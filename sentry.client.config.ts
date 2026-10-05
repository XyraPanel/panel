import * as Sentry from '@sentry/nuxt';
import { useRuntimeConfig } from '#imports';

const dsn = useRuntimeConfig().public.sentryDsn;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
