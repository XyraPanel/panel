import { initializeEmailService } from '#server/utils/email';

export default defineNitroPlugin(async () => {
  try {
    await initializeEmailService();
  } catch (error) {
    console.error('[email] Failed to initialize email service:', error);
  }
});
