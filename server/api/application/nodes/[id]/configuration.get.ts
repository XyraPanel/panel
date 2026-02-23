import { timingSafeEqual } from 'node:crypto';
import { getWingsNodeConfigurationById } from '#server/utils/wings/nodesStore';
import { parseAuthToken, decryptToken } from '#server/utils/wings/encryption';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { useRuntimeConfig, getRequestURL } from '#imports';

export default defineEventHandler(async (event) => {
  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node UUID' });
  }

  const authHeader = getHeader(event, 'authorization');
  if (!authHeader) {
    throw createError({ status: 401, statusText: 'Unauthorized' });
  }

  const tokenData = parseAuthToken(authHeader);
  if (!tokenData) {
    throw createError({ status: 401, statusText: 'Invalid authorization token format' });
  }

  const db = useDrizzle();
  const [nodeRow] = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.uuid, id))
    .limit(1);

  if (!nodeRow) {
    throw createError({ status: 404, statusText: 'Node not found' });
  }

  if (!nodeRow.tokenIdentifier || !nodeRow.tokenSecret) {
    throw createError({ status: 401, statusText: 'Node has no valid token' });
  }

  if (tokenData.tokenId !== nodeRow.tokenIdentifier) {
    throw createError({ status: 403, statusText: 'Invalid token identifier' });
  }

  let decryptedSecret: string;
  try {
    decryptedSecret = decryptToken(nodeRow.tokenSecret);
  } catch (error) {
    throw createError({
      status: 500,
      statusText: 'Token decryption failed',
      message: error instanceof Error ? error.message : 'Failed to decrypt token',
    });
  }

  const providedSecret = Buffer.from(tokenData.token, 'utf8');
  const storedSecret = Buffer.from(decryptedSecret, 'utf8');

  if (
    providedSecret.byteLength !== storedSecret.byteLength ||
    !timingSafeEqual(providedSecret, storedSecret)
  ) {
    throw createError({ status: 403, statusText: 'Invalid token secret' });
  }

  const config = useRuntimeConfig();
  const requestURL = getRequestURL(event);
  const requestOrigin = `${requestURL.protocol}//${requestURL.host}`;
  const panelConfig = config.public.panel as { baseUrl?: string } | undefined;
  const panelUrl = panelConfig?.baseUrl || requestOrigin || '';

  try {
    const configuration = await getWingsNodeConfigurationById(nodeRow.id, panelUrl);

    await recordAuditEventFromRequest(event, {
      actor: nodeRow.uuid,
      actorType: 'daemon',
      action: 'application.node.configuration.requested',
      targetType: 'node',
      targetId: nodeRow.id,
      metadata: {
        requestOrigin: requestOrigin || null,
      },
    });

    return configuration;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build node configuration';
    throw createError({ status: 500, statusText: message });
  }
});
