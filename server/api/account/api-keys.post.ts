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
    summary: 'Create API key',
    description:
      'Generates a new personal API key for the authenticated user. Note: The secret token is only returned once upon creation.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              memo: { type: 'string', description: 'A short description or name for the API key' },
              allowedIps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional list of IP addresses allowed to use this key',
              },
              expiresAt: {
                type: 'string',
                format: 'date-time',
                description: 'Optional expiration timestamp for the key',
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'API key successfully created',
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
                    last_used_at: { type: 'string', format: 'date-time', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
                meta: {
                  type: 'object',
                  properties: {
                    secret_token: {
                      type: 'string',
                      description: 'The raw API key secret (only shown once)',
                    },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Invalid request body' },
      401: { description: 'Authentication required' },
      500: { description: 'Internal server error' },
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
