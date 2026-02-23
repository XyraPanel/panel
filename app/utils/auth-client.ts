import { createAuthClient } from 'better-auth/vue';
import {
  usernameClient,
  twoFactorClient,
  customSessionClient,
  apiKeyClient,
  adminClient,
  multiSessionClient,
} from 'better-auth/client/plugins';
import type { auth } from '~~/server/utils/auth';

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    twoFactorClient({
      onTwoFactorRedirect() {},
    }),
    apiKeyClient(),
    adminClient(),
    multiSessionClient(),
    customSessionClient<typeof auth>(),
  ],
});

export type AuthClient = typeof authClient;
