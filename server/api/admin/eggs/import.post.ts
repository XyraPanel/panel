import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import type { EggImportResponse } from '#shared/types/admin';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { eggImportSchema } from '#shared/schema/admin/eggs';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Eggs'],
    summary: 'Import an egg',
    description:
      'Imports an egg from a Pterodactyl-compatible egg export (PTDL_v1/v2, JSON body) into a target nest, creating the egg and its variables. Requires an admin session with the eggs:write ACL permission.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['nestId', 'eggData'],
            properties: {
              nestId: { type: 'string', description: 'Target nest ID' },
              eggData: {
                type: 'object',
                description: 'Parsed contents of a Pterodactyl egg export JSON file',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Egg imported',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      '400': {
        description:
          'Missing nestId/eggData, unsupported egg format version, or egg file missing required fields',
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing eggs:write ACL permission' },
      '404': { description: 'Target nest not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event): Promise<EggImportResponse> => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

  const { nestId, eggData } = await readValidatedBodyWithLimit(
    event,
    eggImportSchema,
    BODY_SIZE_LIMITS.LARGE,
  );

  try {
    const typedEggData = eggData;

    if (!nestId || !typedEggData) {
      throw createError({
        status: 400,
        message: 'Nest ID and egg data are required: Missing nestId or eggData in request body',
      });
    }

    const metaVersion = typedEggData.meta?.version;
    const ACCEPTED_VERSIONS = ['PTDL_v1', 'PTDL_v2', 'v1', 'v2'];
    if (metaVersion && !ACCEPTED_VERSIONS.includes(metaVersion)) {
      throw createError({
        status: 400,
        message: `Invalid egg format version: "${metaVersion}". Expected one of: ${ACCEPTED_VERSIONS.join(', ')}`,
      });
    }

    if (!typedEggData.name || !typedEggData.author) {
      throw createError({
        status: 400,
        message: `Egg file is missing required fields: ${[!typedEggData.name && 'name', !typedEggData.author && 'author'].filter(Boolean).join(', ')}`,
      });
    }

    const db = useDrizzle();

    const [nest] = await db.select().from(tables.nests).where(eq(tables.nests.id, nestId)).limit(1);

    if (!nest) {
      throw createError({ status: 404, message: 'Nest not found' });
    }

    const now = new Date().toISOString();
    const eggId = randomUUID();

    const dockerImages = typedEggData.docker_images || {};
    const firstImage = Object.values(dockerImages)[0] || 'ghcr.io/pterodactyl/yolks:latest';

    const normalizeConfigField = (field: string | Record<string, unknown> | undefined): string => {
      if (!field) return '{}';
      if (typeof field === 'string') return field;
      return JSON.stringify(field);
    };

    await db.insert(tables.eggs).values({
      id: eggId,
      uuid: randomUUID(),
      nestId,
      author: typedEggData.author || 'unknown@unknown.com',
      name: typedEggData.name,
      description: typedEggData.description || null,
      features: typedEggData.features ? JSON.stringify(typedEggData.features) : null,
      fileDenylist: typedEggData.file_denylist ? JSON.stringify(typedEggData.file_denylist) : null,
      forceOutgoingIp: Boolean(typedEggData.force_outgoing_ip),
      updateUrl: typedEggData.meta?.update_url || null,
      dockerImage: firstImage,
      dockerImages: JSON.stringify(dockerImages),
      startup: typedEggData.startup || '',
      configFiles: normalizeConfigField(typedEggData.config?.files),
      configStartup: normalizeConfigField(typedEggData.config?.startup),
      configLogs: normalizeConfigField(typedEggData.config?.logs),
      configStop: typedEggData.config?.stop || 'stop',
      scriptInstall: typedEggData.scripts?.installation?.script || '',
      scriptContainer: typedEggData.scripts?.installation?.container || 'alpine:3.4',
      scriptEntry: typedEggData.scripts?.installation?.entrypoint || 'ash',
      copyScriptFrom: null,
      createdAt: now,
      updatedAt: now,
    });

    if (typedEggData.variables && typedEggData.variables.length > 0) {
      const variableValues = typedEggData.variables.map((variable) => ({
        id: randomUUID(),
        eggId,
        name: variable.name,
        description: variable.description || null,
        envVariable: variable.env_variable,
        defaultValue: variable.default_value || null,
        userViewable: variable.user_viewable !== false,
        userEditable: variable.user_editable !== false,
        rules: variable.rules || 'required|string',
        createdAt: now,
        updatedAt: now,
      }));

      if (variableValues.length > 0) {
        await db.insert(tables.eggVariables).values(variableValues);
      }
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.egg.imported',
      targetType: 'settings',
      targetId: eggId,
      metadata: {
        eggName: typedEggData.name,
        nestId,
        variableCount: typedEggData.variables?.length || 0,
      },
    });

    return {
      success: true,
      data: { id: eggId },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('Fatal error during egg import:', error);
    throw createError({
      status: 500,
      message: 'Failed to import egg',
    });
  }
});
