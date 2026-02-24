import { desc, eq, sql } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { listWingsNodes } from '#server/utils/wings/nodesStore';
import { remotePaginateServers } from '#server/utils/wings/registry';

import type {
  DashboardResponse,
  DashboardMetric,
  DashboardNode,
  DashboardIncident,
  DashboardOperation,
  NodeStatus,
} from '#shared/types/admin';

type DashboardSection = 'full' | 'critical' | 'incidents';

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { raw: String(parsed) };
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      normalized[key] = value;
    }
    return normalized;
  } catch {
    return { raw };
  }
}

function formatHelperRange(current: number, total: number, suffix: string): string {
  if (total === 0) return `0 ${suffix}`;
  return `${current}/${total} ${suffix}`;
}

function resolveSection(event: H3Event): DashboardSection {
  const query = getQuery(event);
  const section = Array.isArray(query.section) ? query.section[0] : query.section;
  if (section === 'critical') return 'critical';
  if (section === 'incidents') return 'incidents';
  return 'full';
}

function getEmptyDashboardResponse(): DashboardResponse {
  return {
    metrics: [],
    nodes: [],
    incidents: [],
    operations: [],
    generatedAt: new Date().toISOString(),
  };
}

async function fetchCriticalData(
  _event: H3Event,
): Promise<Pick<DashboardResponse, 'metrics' | 'nodes' | 'operations'>> {
  const db = useDrizzle();
  const nodes = await listWingsNodes();

  const nodeResults = await Promise.all(
    nodes.map(async (node): Promise<DashboardNode> => {
      let serverCount: number | null = null;
      let issue: string | null = null;
      let status: NodeStatus = node.maintenanceMode ? 'maintenance' : 'unknown';

      try {
        const response = await remotePaginateServers(1, 1, node.id);
        serverCount = response.meta.total;
        if (!node.maintenanceMode) status = 'online';
      } catch (error) {
        issue = error instanceof Error ? error.message : 'Failed to contact Wings node';
      }

      if (node.maintenanceMode) status = 'maintenance';

      return {
        id: node.id,
        name: node.name,
        fqdn: node.fqdn,
        allowInsecure: node.allowInsecure,
        maintenanceMode: node.maintenanceMode,
        lastSeenAt: node.lastSeenAt,
        serverCount,
        status,
        issue,
      };
    }),
  );

  const respondingNodes = nodeResults.filter((n) => n.status === 'online').length;
  const maintenanceNodes = nodeResults.filter((n) => n.status === 'maintenance').length;
  const unreachableNodes = nodeResults.filter((n) => n.status === 'unknown').length;
  const totalServers = nodeResults.reduce((sum, n) => sum + (n.serverCount ?? 0), 0);

  const userCountResult = await db.select({ totalUsers: sql<number>`count(*)` }).from(tables.users);
  const userCounts = userCountResult[0];

  const adminUsersResult = await db
    .select({ value: sql<number>`count(*)` })
    .from(tables.users)
    .where(eq(tables.users.role, 'admin'));
  const adminUsersRow = adminUsersResult[0];

  const totalUsers = Number(userCounts?.totalUsers ?? 0);
  const adminUsers = Number(adminUsersRow?.value ?? 0);

  const metrics: DashboardMetric[] = [
    {
      key: 'nodes-online',
      label: 'Responding nodes',
      value: respondingNodes,
      icon: 'i-lucide-server',
      helper: formatHelperRange(respondingNodes, nodes.length, 'responding'),
    },
    {
      key: 'servers-registered',
      label: 'Servers registered',
      value: totalServers,
      icon: 'i-lucide-monitor',
      helper:
        unreachableNodes > 0
          ? `${unreachableNodes} node${unreachableNodes === 1 ? '' : 's'} unreachable`
          : maintenanceNodes > 0
            ? `${maintenanceNodes} in maintenance`
            : null,
    },
    {
      key: 'panel-users',
      label: 'Panel users',
      value: totalUsers,
      icon: 'i-lucide-users',
      helper:
        totalUsers > 0 ? `${adminUsers} admin${adminUsers === 1 ? '' : 's'}` : 'No users recorded',
    },
  ];

  const operations: DashboardOperation[] = [];
  if (nodes.length === 0)
    operations.push({
      key: 'connect-node',
      label: 'Connect a Wings node',
      detail: 'No Wings nodes are configured. Add a node to start provisioning servers.',
    });
  if (unreachableNodes > 0)
    operations.push({
      key: 'resolve-nodes',
      label: 'Resolve unreachable nodes',
      detail: `${unreachableNodes} node${unreachableNodes === 1 ? '' : 's'} failed to respond to the remote API.`,
    });
  if (totalServers === 0 && nodes.length > 0)
    operations.push({
      key: 'provision-servers',
      label: 'Provision servers',
      detail:
        'No servers are registered across your Wings nodes. Create a server from the Servers page.',
    });
  if (adminUsers <= 1)
    operations.push({
      key: 'invite-admin',
      label: 'Invite additional admin',
      detail:
        'Only one administrator account exists. Invite a teammate to ensure redundant access.',
    });
  if (operations.length === 0)
    operations.push({
      key: 'all-clear',
      label: 'All systems nominal',
      detail: 'Wings nodes and panel services are responding as expected.',
    });

  return {
    metrics,
    nodes: nodeResults,
    operations,
  };
}

async function fetchIncidents(): Promise<DashboardIncident[]> {
  const db = useDrizzle();

  const users = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      displayUsername: tables.users.displayUsername,
    })
    .from(tables.users);

  const usersById = new Map(users.map((user) => [user.id, user] as const));
  const usersByEmail = new Map(
    users
      .filter((user) => typeof user.email === 'string' && user.email.length > 0)
      .map((user) => [user.email.toLowerCase(), user] as const),
  );

  const audits = await db
    .select({
      id: tables.auditEvents.id,
      occurredAt: tables.auditEvents.occurredAt,
      actor: tables.auditEvents.actor,
      action: tables.auditEvents.action,
      targetType: tables.auditEvents.targetType,
      targetId: tables.auditEvents.targetId,
      metadata: tables.auditEvents.metadata,
    })
    .from(tables.auditEvents)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(5);

  return audits.map(
    (event: {
      id: string;
      occurredAt: Date | string;
      actor: string;
      action: string;
      targetType: string;
      targetId: string | null;
      metadata: string | null;
    }) => ({
      ...(function resolveActor() {
        const actorRaw = String(event.actor);
        const byId = usersById.get(actorRaw);
        if (byId) {
          return {
            actorUserId: byId.id,
            actorEmail: byId.email ?? undefined,
            actorUsername: byId.displayUsername ?? undefined,
          };
        }

        if (actorRaw.includes('@')) {
          const byEmail = usersByEmail.get(actorRaw.toLowerCase());
          if (byEmail) {
            return {
              actorUserId: byEmail.id,
              actorEmail: byEmail.email ?? undefined,
              actorUsername: byEmail.displayUsername ?? undefined,
            };
          }
        }

        return {
          actorUserId: undefined,
          actorEmail: undefined,
          actorUsername: undefined,
        };
      })(),
      id: event.id,
      occurredAt:
        typeof event.occurredAt === 'string'
          ? event.occurredAt
          : new Date(event.occurredAt).toISOString(),
      actor: event.actor,
      action: event.action,
      target: event.targetId ? `${event.targetType}#${event.targetId}` : event.targetType,
      metadata: parseMetadata(event.metadata),
    }),
  );
}

export default defineEventHandler(async (event): Promise<{ data: DashboardResponse }> => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.DASHBOARD,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const section = resolveSection(event);
  if (section === 'critical') {
    const critical = await fetchCriticalData(event);
    return {
      data: {
        ...getEmptyDashboardResponse(),
        metrics: critical.metrics,
        nodes: critical.nodes,
        operations: critical.operations,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  if (section === 'incidents') {
    return {
      data: {
        ...getEmptyDashboardResponse(),
        incidents: await fetchIncidents(),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const [critical, incidents] = await Promise.all([fetchCriticalData(event), fetchIncidents()]);

  return {
    data: {
      metrics: critical.metrics,
      nodes: critical.nodes,
      incidents,
      operations: critical.operations,
      generatedAt: new Date().toISOString(),
    },
  };
});
