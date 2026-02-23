import { randomUUID } from 'node:crypto';
import type { StoredWingsNode, WingsNodeConfiguration } from '#shared/types/wings';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  decryptToken,
  encryptToken,
  generateToken,
  generateTokenId,
} from '#server/utils/wings/encryption';
import { debugLog, debugError, debugWarn } from '#server/utils/logger';

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true';
  }
  return Boolean(value);
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return value;
  }
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatCombinedToken(identifier: string, secret: string): string {
  return `${identifier}.${secret}`;
}

async function generateNodeId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const base = slug.length > 0 ? slug : 'node';
  const db = useDrizzle();

  const exists = async (id: string) => {
    const result = await db
      .select({ id: tables.wingsNodes.id })
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, id))
      .limit(1);
    return result[0] ?? null;
  };

  let candidate = base;
  let index = 1;
  while (await exists(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function buildCombinedToken(row: typeof tables.wingsNodes.$inferSelect): string {
  try {
    const plainSecret = decryptToken(row.tokenSecret);
    return formatCombinedToken(row.tokenIdentifier, plainSecret);
  } catch {
    return row.apiToken.includes('.')
      ? row.apiToken
      : formatCombinedToken(row.tokenIdentifier, row.tokenSecret);
  }
}

function mapRowToStored(row: typeof tables.wingsNodes.$inferSelect): StoredWingsNode {
  const normalizedToken = buildCombinedToken(row);

  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    description: row.description ?? undefined,
    baseURL: row.baseUrl,
    fqdn: row.fqdn,
    scheme: row.scheme,
    public: toBoolean(row.public),
    maintenanceMode: toBoolean(row.maintenanceMode),
    behindProxy: toBoolean(row.behindProxy),
    apiToken: normalizedToken,
    allowInsecure: toBoolean(row.allowInsecure),
    memory: toNumber(row.memory, 0),
    memoryOverallocate: toNumber(row.memoryOverallocate, 0),
    disk: toNumber(row.disk, 0),
    diskOverallocate: toNumber(row.diskOverallocate, 0),
    uploadSize: toNumber(row.uploadSize, 0),
    daemonBase: row.daemonBase,
    daemonListen: toNumber(row.daemonListen, 8080),
    daemonSftp: toNumber(row.daemonSftp, 2022),
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString(),
  };
}

export async function resolveNodeConnection(id: string) {
  const row = await requireNodeRow(id);
  const combinedToken = buildCombinedToken(row);
  let plainSecret: string | null = null;

  try {
    plainSecret = decryptToken(row.tokenSecret);
  } catch (error) {
    throw new Error(
      `Failed to decrypt Wings token for node ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    stored: mapRowToStored(row),
    connection: {
      tokenId: row.tokenIdentifier,
      tokenSecret: plainSecret,
      combinedToken,
    },
  };
}

export async function requireNodeRow(id: string) {
  const db = useDrizzle();
  const result = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, id))
    .limit(1);
  const row = result[0];
  if (!row) {
    throw new Error(`Node ${id} not found`);
  }
  return row;
}

export async function syncWingsNodeConfiguration(id: string, panelUrl: string): Promise<void> {
  const { stored, connection } = await resolveNodeConnection(id);
  const configuration = await getWingsNodeConfigurationById(id, panelUrl);

  const requestUrl = new URL('/api/update', stored.baseURL);

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.combinedToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(configuration),
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    Object.assign(error, { response });
    throw error;
  }
}

export async function listWingsNodes(): Promise<StoredWingsNode[]> {
  const db = useDrizzle();
  const rows = await db.select().from(tables.wingsNodes);
  return rows.map(mapRowToStored);
}

export async function findWingsNode(id: string): Promise<StoredWingsNode | undefined> {
  const db = useDrizzle();
  const result = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, id))
    .limit(1);
  const row = result[0];
  return row ? mapRowToStored(row) : undefined;
}

export async function getWingsNode(id: string): Promise<StoredWingsNode> {
  return mapRowToStored(await requireNodeRow(id));
}

export function toWingsNodeSummary(node: StoredWingsNode): WingsNodeSummary {
  const { apiToken, ...rest } = node;
  return {
    ...rest,
    hasToken: apiToken.length > 0,
  };
}

export async function listWingsNodeSummaries(): Promise<WingsNodeSummary[]> {
  return (await listWingsNodes()).map(toWingsNodeSummary);
}

export async function ensureNodeHasToken(id: string): Promise<void> {
  const db = useDrizzle();
  const row = await requireNodeRow(id);

  if (
    !row.tokenSecret ||
    row.tokenSecret.trim().length === 0 ||
    !row.tokenIdentifier ||
    row.tokenIdentifier.trim().length === 0
  ) {
    const token = generateTokenParts();
    const now = new Date().toISOString();

    await db
      .update(tables.wingsNodes)
      .set({
        tokenIdentifier: token.identifier,
        tokenSecret: token.secret,
        apiToken: token.combined,
        updatedAt: now,
      })
      .where(eq(tables.wingsNodes.id, id));
  }
}

export async function getWingsNodeConfigurationById(
  id: string,
  panelUrl: string,
): Promise<WingsNodeConfiguration> {
  await ensureNodeHasToken(id);
  const row = await requireNodeRow(id);

  if (!row.tokenSecret || row.tokenSecret.trim().length === 0) {
    throw new Error(`Node ${id} does not have a token secret. Please generate a token first.`);
  }

  if (!row.tokenIdentifier || row.tokenIdentifier.trim().length === 0) {
    throw new Error(`Node ${id} does not have a token identifier. Please generate a token first.`);
  }

  let plainTokenSecret: string;
  try {
    const encryptionKeyAvailable = !!(
      process.env.WINGS_ENCRYPTION_KEY ||
      process.env.NUXT_SESSION_PASSWORD ||
      process.env.BETTER_AUTH_SECRET ||
      process.env.AUTH_SECRET
    );

    if (!encryptionKeyAvailable) {
      debugError(`[Wings Config] No encryption key available! Check environment variables.`);
      throw new Error(
        'Wings token encryption key not configured. Set WINGS_ENCRYPTION_KEY, NUXT_SESSION_PASSWORD, BETTER_AUTH_SECRET, or AUTH_SECRET.',
      );
    }

    plainTokenSecret = decryptToken(row.tokenSecret);
    debugLog(
      `[Wings Config] Successfully decrypted token for node ${id}, length: ${plainTokenSecret.length}`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debugError(`[Wings Config] Failed to decrypt token for node ${id}:`, errorMessage);
    debugError(`[Wings Config] Token secret length:`, row.tokenSecret?.length || 0);
    debugError(`[Wings Config] Token identifier:`, row.tokenIdentifier);
    throw new Error(`Failed to decrypt token for node ${id}: ${errorMessage}`);
  }

  if (!plainTokenSecret || plainTokenSecret.trim().length === 0) {
    debugError(
      `[Wings Config] Node ${id} has empty decrypted token. Token secret exists:`,
      !!row.tokenSecret,
    );
    throw new Error(`Node ${id} has an empty decrypted token. Please regenerate the token.`);
  }

  if (plainTokenSecret.length < 32) {
    debugWarn(
      `[Wings Config] Node ${id} has suspiciously short token (${plainTokenSecret.length} chars). Expected 64+ chars.`,
    );
  }

  const normalizedPanelUrl = panelUrl.replace(/\/$/, '');

  return {
    debug: false,
    uuid: row.uuid,
    token_id: row.tokenIdentifier,
    token: plainTokenSecret,
    api: {
      host: '0.0.0.0',
      port: toNumber(row.daemonListen, 8080),
      ssl: {
        enabled: !toBoolean(row.behindProxy) && row.scheme === 'https',
        cert: `/etc/letsencrypt/live/${row.fqdn.toLowerCase()}/fullchain.pem`,
        key: `/etc/letsencrypt/live/${row.fqdn.toLowerCase()}/privkey.pem`,
      },
      upload_limit: toNumber(row.uploadSize, 100),
    },
    system: {
      data: row.daemonBase,
      sftp: {
        bind_port: toNumber(row.daemonSftp, 2022),
      },
    },
    allowed_mounts: [],
    remote: normalizedPanelUrl || panelUrl,
  };
}

function parseBaseUrl(raw: string) {
  const trimmed = raw.trim();
  const sanitized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  let url: URL | null = null;
  try {
    url = new URL(sanitized);
  } catch {
    throw new Error('Invalid base URL provided for Wings node');
  }

  const scheme = url.protocol.replace(':', '') || 'https';
  const port = url.port ? Number(url.port) : 8080;

  return {
    sanitized,
    scheme,
    fqdn: url.hostname,
    daemonListen: port,
  };
}

function generateTokenParts() {
  const identifier = generateTokenId(16);
  const secret = generateToken(64);
  const encryptedSecret = encryptToken(secret);
  return {
    identifier,
    secret: encryptedSecret,
    plainSecret: secret,
    combined: formatCombinedToken(identifier, secret),
  };
}

function resolveTokenParts(inputToken?: string) {
  if (!inputToken || inputToken.trim().length < 16) {
    return generateTokenParts();
  }

  const trimmed = inputToken.trim();
  const normalized = trimmed.includes('.') ? trimmed : `${trimmed.slice(0, 8)}.${trimmed.slice(8)}`;

  const [identifier, ...rest] = normalized.split('.');
  const secret = rest.join('.');

  if (!identifier || identifier.length === 0 || !secret || secret.length === 0) {
    throw new Error('Invalid Wings API token format');
  }

  return {
    identifier,
    secret,
    combined: formatCombinedToken(identifier, secret),
  };
}

export async function createWingsNode(input: CreateWingsNodeInput): Promise<StoredWingsNode> {
  const db = useDrizzle();
  const requestedId = input.id?.trim();
  const id = requestedId || (await generateNodeId(input.name));

  const now = new Date();

  const { sanitized, scheme, fqdn, daemonListen } = parseBaseUrl(input.baseURL);

  if (requestedId) {
    const existingById = await db
      .select({ id: tables.wingsNodes.id })
      .from(tables.wingsNodes)
      .where(eq(tables.wingsNodes.id, requestedId))
      .limit(1);

    if (existingById[0]) {
      throw new Error(`A Wings node with id "{requestedId}""lready exists`);
    }
  }

  const existingByBaseUrl = await db
    .select({ id: tables.wingsNodes.id })
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.baseUrl, sanitized))
    .limit(1);

  if (existingByBaseUrl[0]) {
    throw new Error(
      `A Wings node with base URL "{sanitized}""lready exists (id: ${existingByBaseUrl[0].id})`,
    );
  }

  const token = resolveTokenParts(input.apiToken);

  const record = {
    id,
    uuid: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    baseUrl: sanitized,
    fqdn,
    scheme,
    public: input.public ?? true,
    maintenanceMode: input.maintenanceMode ?? false,
    allowInsecure: Boolean(input.allowInsecure),
    behindProxy: input.behindProxy ?? false,
    memory: input.memory ?? 4096,
    memoryOverallocate: input.memoryOverallocate ?? 0,
    disk: input.disk ?? 51200,
    diskOverallocate: input.diskOverallocate ?? 0,
    uploadSize: input.uploadSize ?? 100,
    daemonBase: input.daemonBase?.trim() || '/var/lib/pterodactyl/volumes',
    daemonListen: input.daemonListen ?? daemonListen,
    daemonSftp: input.daemonSftp ?? 2022,
    tokenIdentifier: token.identifier,
    tokenSecret: token.secret,
    apiToken: token.combined,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tables.wingsNodes).values(record);

  const insertedResult = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, id))
    .limit(1);
  const inserted = insertedResult[0];
  if (!inserted) {
    throw new Error('Failed to persist Wings node');
  }

  return mapRowToStored(inserted);
}

export async function updateWingsNode(
  id: string,
  input: UpdateWingsNodeInput,
): Promise<StoredWingsNode> {
  const db = useDrizzle();
  const existing = await requireNodeRow(id);

  const baseUrlUpdates = input.baseURL !== undefined ? parseBaseUrl(input.baseURL) : null;

  const tokenUpdates =
    input.apiToken !== undefined && input.apiToken.trim().length > 0
      ? resolveTokenParts(input.apiToken)
      : null;

  const existingToken = existing.apiToken.includes('.')
    ? existing.apiToken
    : formatCombinedToken(existing.tokenIdentifier, existing.tokenSecret);

  const updated = {
    name: input.name !== undefined ? input.name.trim() : existing.name,
    description:
      input.description !== undefined ? input.description.trim() || null : existing.description,
    baseUrl: baseUrlUpdates ? baseUrlUpdates.sanitized : existing.baseUrl,
    fqdn: baseUrlUpdates ? baseUrlUpdates.fqdn : existing.fqdn,
    scheme: baseUrlUpdates ? baseUrlUpdates.scheme : existing.scheme,
    daemonListen: baseUrlUpdates ? baseUrlUpdates.daemonListen : existing.daemonListen,
    apiToken: tokenUpdates ? tokenUpdates.combined : existingToken,
    tokenIdentifier: tokenUpdates ? tokenUpdates.identifier : existing.tokenIdentifier,
    tokenSecret: tokenUpdates ? tokenUpdates.secret : existing.tokenSecret,
    public: input.public !== undefined ? Boolean(input.public) : existing.public,
    maintenanceMode:
      input.maintenanceMode !== undefined
        ? Boolean(input.maintenanceMode)
        : existing.maintenanceMode,
    behindProxy:
      input.behindProxy !== undefined ? Boolean(input.behindProxy) : existing.behindProxy,
    allowInsecure:
      input.allowInsecure !== undefined ? Boolean(input.allowInsecure) : existing.allowInsecure,
    memory: input.memory ?? existing.memory,
    memoryOverallocate: input.memoryOverallocate ?? existing.memoryOverallocate,
    disk: input.disk ?? existing.disk,
    diskOverallocate: input.diskOverallocate ?? existing.diskOverallocate,
    uploadSize: input.uploadSize ?? existing.uploadSize,
    daemonBase:
      input.daemonBase !== undefined
        ? input.daemonBase.trim() || existing.daemonBase
        : existing.daemonBase,
    daemonSftp: input.daemonSftp ?? existing.daemonSftp,
    updatedAt: new Date().toISOString(),
  };

  await db.update(tables.wingsNodes).set(updated).where(eq(tables.wingsNodes.id, id));

  const refreshedResult = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, id))
    .limit(1);
  const refreshed = refreshedResult[0];
  if (!refreshed) {
    throw new Error(`Node ${id} not found after update`);
  }

  return mapRowToStored(refreshed);
}

export async function deleteWingsNode(id: string): Promise<void> {
  const db = useDrizzle();
  const result = await db.delete(tables.wingsNodes).where(eq(tables.wingsNodes.id, id));
  const changes = (result as any)?.rowCount ?? 0;
  if (changes === 0) {
    throw new Error(`Node ${id} not found`);
  }
}
