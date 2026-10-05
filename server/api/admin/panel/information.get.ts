import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { PanelInformation } from '#shared/types/admin';

function isPackageJson(value: unknown): value is { version?: string } {
  return typeof value === 'object' && value !== null && 'version' in value;
}

function getPackageVersion(): string {
  try {
    const pkgPath = resolve(process.cwd(), 'package.json');
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf-8')) as unknown;
    if (isPackageJson(parsed) && typeof parsed.version === 'string') {
      return parsed.version;
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const packageVersion = getPackageVersion();

const RELEASE_NOTES_URL =
  process.env.XYRA_RELEASES_URL ?? 'https://github.com/XyraPanel/panel/releases';
const DOCUMENTATION_URL = process.env.XYRA_DOCUMENTATION_URL ?? 'https://xyrapanel.com';
const SUPPORT_URL = process.env.XYRA_SUPPORT_URL ?? 'https://xyrapanel.com/discord';
const DONATIONS_URL = process.env.XYRA_DONATIONS_URL ?? 'https://ko-fi.com/26bzz';
const REPOSITORY_URL = process.env.XYRA_REPOSITORY_URL ?? 'https://github.com/XyraPanel/panel';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Panel'],
    summary: 'Get panel information',
    description:
      'Returns panel version and links (docs, support, donations, repository). Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'Panel information',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    panelVersion: { type: 'string' },
                    latestPanelVersion: { type: 'string', nullable: true },
                    isPanelUpToDate: { type: 'boolean', nullable: true },
                    documentationUrl: { type: 'string' },
                    supportUrl: { type: 'string' },
                    donationsUrl: { type: 'string' },
                    releaseNotesUrl: { type: 'string' },
                    repositoryUrl: { type: 'string' },
                    lastCheckedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event): Promise<{ data: PanelInformation }> => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const data: PanelInformation = {
    panelVersion: packageVersion,
    latestPanelVersion: null,
    isPanelUpToDate: null,
    documentationUrl: DOCUMENTATION_URL,
    supportUrl: SUPPORT_URL,
    donationsUrl: DONATIONS_URL,
    releaseNotesUrl: RELEASE_NOTES_URL,
    repositoryUrl: REPOSITORY_URL,
    lastCheckedAt: new Date().toISOString(),
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.panel.information.viewed',
    targetType: 'settings',
    metadata: {
      panelVersion: packageVersion,
    },
  });

  return { data };
});
