import { randomUUID, createHash } from 'node:crypto';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { createSshKeySchema } from '#shared/schema/account';

function parseSSHPublicKey(publicKey: string): { fingerprint: string; valid: boolean } {
  try {
    const cleanKey = publicKey.trim().split(/\s+/);

    if (cleanKey.length < 2) {
      return { fingerprint: '', valid: false };
    }

    const keyType = cleanKey[0];
    const keyData = cleanKey[1];

    if (!keyType || !keyData) {
      return { fingerprint: '', valid: false };
    }

    const validKeyType = keyType;
    const validKeyData = keyData;

    const validTypes = [
      'ssh-rsa',
      'ssh-dss',
      'ssh-ed25519',
      'ecdsa-sha2-nistp256',
      'ecdsa-sha2-nistp384',
      'ecdsa-sha2-nistp521',
    ];
    if (!validTypes.includes(validKeyType)) {
      return { fingerprint: '', valid: false };
    }

    const keyBuffer = Buffer.from(validKeyData, 'base64');
    const hash = createHash('sha256').update(keyBuffer).digest('base64');
    const fingerprint = `SHA256:${hash}`;

    return { fingerprint, valid: true };
  } catch {
    return { fingerprint: '', valid: false };
  }
}

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Create SSH key',
    description:
      "Registers a new SSH public key for the authenticated user's account. Validates the key format and fingerprint.",
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'A label for the SSH key' },
              publicKey: { type: 'string', description: 'The raw SSH public key string' },
            },
            required: ['name', 'publicKey'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SSH key successfully created',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    fingerprint: { type: 'string' },
                    public_key: { type: 'string' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Invalid key format or too many keys' },
      401: { description: 'Authentication required' },
      409: { description: 'SSH key already exists' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const user = accountContext.user;

  const body = await readValidatedBodyWithLimit(event, createSshKeySchema, BODY_SIZE_LIMITS.SMALL);

  const { fingerprint, valid } = parseSSHPublicKey(body.publicKey);

  if (!valid) {
    throw createError({ status: 400, message: 'Invalid SSH public key format' });
  }

  try {
    const db = useDrizzle();

    const existingResult = await db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.fingerprint, fingerprint))
      .limit(1);

    if (existingResult[0]) {
      throw createError({ status: 409, message: 'This SSH key already exists' });
    }

    const userKeys = await db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.userId, user.id));

    if (userKeys.length >= 25) {
      throw createError({ status: 400, message: 'Maximum of 25 SSH keys allowed per account' });
    }

    const now = Date.now();
    const keyId = randomUUID();

    await db.insert(tables.sshKeys).values({
      id: keyId as string,
      userId: user.id,
      name: body.name.trim(),
      fingerprint,
      publicKey: body.publicKey.trim(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });

    const keyResult = await db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.id, keyId))
      .limit(1);

    const key = keyResult[0]!;

    await recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'account.ssh_key.create',
      targetType: 'user',
      targetId: keyId,
      metadata: {
        name: key.name,
        fingerprint: key.fingerprint,
      },
    });

    return {
      data: {
        id: key.id,
        name: key.name,
        fingerprint: key.fingerprint,
        public_key: key.publicKey,
        created_at: key.createdAt,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    throw createError({
      status: 500,
      message: `Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});
