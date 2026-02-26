export default defineEventHandler(async (event) => {
  const secret = process.env.SEED_SECRET;
  const authHeader = getRequestHeader(event, 'Authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
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
      message: `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});
