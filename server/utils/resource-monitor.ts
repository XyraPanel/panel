import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  getWingsClientForServer,
  getWingsClient,
  WingsConnectionError,
  WingsAuthError,
} from '#server/utils/wings-client';
import { debugLog, debugError, debugWarn } from '#server/utils/logger';
import type {
  ServerResourceStats,
  NodeResourceStats,
  NodeHealthStatus,
} from '#shared/types/server';

export class ResourceMonitor {
  private db = useDrizzle();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  async getServerResources(serverUuid: string): Promise<ServerResourceStats | null> {
    try {
      const { client, server } = await getWingsClientForServer(serverUuid);
      const details = await client.getServerResources(server.uuid as string);

      return {
        serverId: server.id as string,
        serverUuid: server.uuid as string,
        state: details.state || 'offline',
        isSuspended: details.isSuspended,
        memoryBytes: details.utilization.memory_bytes,
        memoryLimitBytes: details.utilization.memory_limit_bytes,
        cpuAbsolute: details.utilization.cpu_absolute,
        diskBytes: details.utilization.disk_bytes,
        networkRxBytes: details.utilization.network.rx_bytes,
        networkTxBytes: details.utilization.network.tx_bytes,
        uptime: details.utilization.uptime,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Server not found') || errorMessage.includes('not found')) {
        debugWarn(`Server ${serverUuid} not found, skipping resource collection`);
      } else {
        debugError(`Failed to get resources for server ${serverUuid}:`, error);
      }
      return null;
    }
  }

  async getNodeResources(nodeId: string): Promise<NodeResourceStats> {
    const result = await this.db
      .select()
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, nodeId))
      .limit(1);

    const node = result[0];

    if (!node) {
      return {
        nodeId,
        totalMemory: 0,
        usedMemory: 0,
        totalDisk: 0,
        usedDisk: 0,
        cpuCount: 0,
        cpuUsage: 0,
        serverCount: 0,
        lastUpdated: null,
        status: 'unknown',
        message: 'Node not registered in panel',
      };
    }

    const wingsNode = {
      id: node.id,
      fqdn: node.fqdn,
      scheme: node.scheme as 'http' | 'https',
      daemonListen: node.daemonListen,
      daemonSftp: node.daemonSftp,
      daemonBase: node.daemonBase,
      tokenId: node.tokenIdentifier,
      token: node.tokenSecret,
    };

    const client = getWingsClient(wingsNode);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new WingsConnectionError('Node health check timeout')), 5000),
    );

    try {
      const systemInfo = await Promise.race([client.getSystemInfo(), timeoutPromise]);

      const serverCount = await this.db
        .select()
        .from(tables.servers)
        .where(eq(tables.servers.nodeId, nodeId));

      const lastSeenAt = new Date();

      Promise.resolve().then(async () => {
        try {
          await this.db
            .update(tables.wingsNodes)
            .set({ lastSeenAt, updatedAt: new Date().toISOString() })
            .where(eq(tables.wingsNodes.id, nodeId));
        } catch (err) {
          debugError('Failed to update node status:', err);
        }
      });

      const status: NodeHealthStatus = node.maintenanceMode ? 'maintenance' : 'online';

      return {
        nodeId: node.id,
        totalMemory: Number(systemInfo.memory_total) || 0,
        usedMemory: Number(systemInfo.memory_used) || 0,
        totalDisk: Number(systemInfo.disk_total) || 0,
        usedDisk: Number(systemInfo.disk_used) || 0,
        cpuCount: Number(systemInfo.cpu_count) || 0,
        cpuUsage: Number(systemInfo.cpu_usage) || 0,
        serverCount: serverCount.length,
        lastUpdated: lastSeenAt,
        status,
      };
    } catch (error) {
      let status: NodeHealthStatus = 'offline';
      let message = 'Failed to contact Wings node';

      if (node.maintenanceMode) {
        status = 'maintenance';
        message = 'Node is in maintenance mode';
      } else if (error instanceof WingsAuthError) {
        status = 'offline';
        message = 'Authentication failed - verify node token';
      } else if (error instanceof WingsConnectionError) {
        status = 'offline';
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }

      Promise.resolve().then(async () => {
        try {
          await this.db
            .update(tables.wingsNodes)
            .set({ lastSeenAt: node.lastSeenAt ?? null, updatedAt: new Date().toISOString() })
            .where(eq(tables.wingsNodes.id, nodeId));
        } catch (err) {
          debugError('Failed to update node status:', err);
        }
      });

      return {
        nodeId: node.id,
        totalMemory: 0,
        usedMemory: 0,
        totalDisk: 0,
        usedDisk: 0,
        cpuCount: 0,
        cpuUsage: 0,
        serverCount: 0,
        lastUpdated: node.lastSeenAt ? new Date(node.lastSeenAt) : null,
        status,
        message,
      };
    }
  }

  async getAllServerResources(): Promise<ServerResourceStats[]> {
    const servers = await this.db.select().from(tables.servers);

    const resources: ServerResourceStats[] = [];

    for (const server of servers) {
      if (!server.uuid) {
        debugWarn(`Server ${server.id} has no UUID, skipping resource collection`);
        continue;
      }
      const stats = await this.getServerResources(server.uuid);
      if (stats) {
        resources.push(stats);
      }
    }

    return resources;
  }

  async getAllNodeResources(): Promise<NodeResourceStats[]> {
    const nodes = await this.db.select().from(tables.wingsNodes);

    const resources: NodeResourceStats[] = [];

    for (const node of nodes) {
      const stats = await this.getNodeResources(node.id);
      resources.push(stats);
    }

    return resources;
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      debugLog('Resource monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    debugLog(`Starting resource monitoring with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectAllResources();
      } catch (error) {
        debugError('Resource monitoring cycle failed:', error);
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    debugLog('Resource monitoring stopped');
  }

  private async collectAllResources(): Promise<void> {
    const startTime = Date.now();

    try {
      const serverResources = await this.getAllServerResources();
      debugLog(`Collected resources for ${serverResources.length} servers`);

      const nodeResources = await this.getAllNodeResources();
      const onlineNodes = nodeResources.filter(
        (node) => node.status === 'online' || node.status === 'maintenance',
      );
      const offlineNodes = nodeResources.filter((node) => node.status === 'offline');

      debugLog(
        `Collected resources for ${nodeResources.length} nodes (${onlineNodes.length} online, ${offlineNodes.length} offline)`,
      );

      if (offlineNodes.length > 0) {
        for (const offline of offlineNodes) {
          debugWarn(`Node ${offline.nodeId} is offline: ${offline.message ?? 'unknown issue'}`);
        }
      }

      for (const node of nodeResources) {
        await this.db
          .update(tables.wingsNodes)
          .set({ lastSeenAt: node.lastUpdated ?? null, updatedAt: new Date().toISOString() })
          .where(eq(tables.wingsNodes.id, node.nodeId));
      }

      for (const resource of serverResources) {
        await this.db
          .update(tables.servers)
          .set({ status: resource.state, updatedAt: new Date().toISOString() })
          .where(eq(tables.servers.id, resource.serverId));
      }

      const duration = Date.now() - startTime;
      debugLog(`Resource collection completed in ${duration}ms`);
    } catch (error) {
      debugError('Failed to collect resources:', error);
    }
  }

  getMonitoringStatus(): { isMonitoring: boolean; intervalMs?: number } {
    return {
      isMonitoring: this.isMonitoring,
      intervalMs: this.monitoringInterval ? 30000 : undefined,
    };
  }
}

export const resourceMonitor = new ResourceMonitor();
