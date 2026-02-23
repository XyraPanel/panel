export default defineI18nConfig(() => {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    fallbackWarn: isDev,
    missingWarn: isDev,
    warnHtmlMessage: false,
    silentTranslationWarn: !isDev,
    silentFallbackWarn: !isDev,
  };
});
