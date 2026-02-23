export default defineEventHandler(async (event) => {
  const secret = process.env.SEED_SECRET;
  const authHeader = getRequestHeader(event, 'Authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const body = await readBody(event).catch(() => ({}));

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
      statusMessage: `Seed failed: ${(error as Error).message}`,
    });
  }
});
