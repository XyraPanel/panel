import { randomUUID } from 'node:crypto';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { createApiKeySchema } from '#shared/schema/account';
import type { ApiKeyResponse } from '#shared/types/api';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { APIError } from 'better-auth/api';
import { getAuth } from '#server/utils/auth';
import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Create an API key',
    description:
      'Creates a new API key for the authenticated account. The secret token is returned only once, in `meta.secret_token`.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              memo: { type: 'string', maxLength: 500, nullable: true, description: 'Description of the key' },
              allowedIps: {
                type: 'array',
                items: { type: 'string' },
                nullable: true,
                description: 'IP allowlist for the key',
              },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'API key created',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    identifier: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    allowed_ips: { type: 'array', items: { type: 'string' } },
                    last_used_at: { type: 'string', nullable: true },
                    created_at: { type: 'string' },
                  },
                },
                meta: {
                  type: 'object',
                  properties: {
                    secret_token: { type: 'string', description: 'Only returned on creation' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Invalid request body, e.g. expiresAt not a valid future datetime' },
      '401': { description: 'Not authenticated' },
      '500': { description: 'Failed to create API key' },
    },
  },
});

export default defineEventHandler(async (event): Promise<ApiKeyResponse> => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const body = await readValidatedBodyWithLimit(event, createApiKeySchema, BODY_SIZE_LIMITS.SMALL);

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();
    const auth = getAuth();
    const apiKeyPermId = randomUUID();

    let expiresIn: number | undefined;
    if (body.expiresAt) {
      const expiresAtMs = new Date(body.expiresAt).getTime();
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        throw createError({
          status: 400,
          message: 'expiresAt must be a valid future datetime',
        });
      }
      expiresIn = Math.floor((expiresAtMs - Date.now()) / 1000);
    }

    const created = await auth.api.createApiKey({
      body: {
        name: body.memo || 'API Key',
        userId: user.id,
        ...(expiresIn ? { expiresIn } : {}),
      },
    });
    const apiKeyId = created.id;

    await db.insert(tables.apiKeyMetadata).values({
      id: apiKeyPermId as string,
      apiKeyId: apiKeyId,
      keyType: 1,
      allowedIps: body.allowedIps ? JSON.stringify(body.allowedIps) : null,
      memo: body.memo || null,
      lastUsedAt: null,
      rServers: 0,
      rNodes: 0,
      rAllocations: 0,
      rUsers: 0,
      rLocations: 0,
      rNests: 0,
      rEggs: 0,
      rDatabaseHosts: 0,
      rServerDatabases: 0,
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'account.api_key.create',
      targetType: 'user',
      targetId: apiKeyId,
      metadata: {
        description: body.memo || null,
        allowedIpsCount: body.allowedIps?.length || 0,
      },
    });

    return {
      data: {
        identifier: apiKeyId,
        description: body.memo || null,
        allowed_ips: body.allowedIps || [],
        last_used_at: null,
        created_at: now,
      },
      meta: {
        secret_token: created.key,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    if (error instanceof APIError) {
      const statusCode =
        typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500;
      throw createError({
        statusCode,
        message: error.message || 'Failed to create API key',
      });
    }
    debugError('Error creating API key:', error);

    throw createError({
      status: 500,
      message: error instanceof Error ? error.message : 'Failed to create API key',
    });
  }
});
