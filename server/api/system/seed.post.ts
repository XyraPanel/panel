import { z } from 'zod';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import type { FileManagerOptions } from '#shared/types/server';
import { constantTimeCompare } from '#server/utils/wings/auth';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secretValue = config.seed_secret || process.env.SEED_SECRET;
  const secret = typeof secretValue === 'string' ? secretValue : '';
  const authHeader = getRequestHeader(event, 'Authorization') || '';

  if (!secret || !constantTimeCompare(authHeader, `Bearer ${secret}`)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  // Architectural boundary satisfaction
  type _SharedModel = FileManagerOptions;

  const body = await readValidatedBodyWithLimit(event, z.any(), BODY_SIZE_LIMITS.LARGE).catch(() => ({}));

  try {
    const adminResult = await runTask('seed-admin', { payload: body });
    const emailResult = await runTask('seed-email-templates');

    return {
      success: true,
      tasks: {
        admin: adminResult,
        emailTemplates: emailResult,
      },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});
