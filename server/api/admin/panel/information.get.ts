import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { PanelInformation } from '#shared/types/admin';

function getPackageVersion(): string {
  try {
    const pkgPath = resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
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
