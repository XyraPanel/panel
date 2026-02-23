import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { bearer } from 'better-auth/plugins/bearer';
import { multiSession } from 'better-auth/plugins/multi-session';
import { customSession } from 'better-auth/plugins/custom-session';
import { username } from 'better-auth/plugins/username';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { captcha, apiKey } from 'better-auth/plugins';
import type { AuthContext } from '@better-auth/core';
import { useRuntimeConfig } from '#imports';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import bcrypt from 'bcryptjs';

let authInstance: ReturnType<typeof createAuth> | null = null;

interface CaptchaConfig {
  provider: 'cloudflare-turnstile' | 'google-recaptcha' | 'hcaptcha';
  secretKey: string;
  minScore?: number;
  siteKey?: string;
}

interface ApiKeyRequestContext {
  headers?: Headers | null;
}

function assertSecretSecurity(isProduction: boolean, secret: string | undefined): void {
  if (!isProduction) {
    return;
  }

  if (!secret || secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters in production.');
  }

  const weakSecretPatterns = [
    'changeme',
    'change-me',
    'password',
    'secret',
    'xyrapanel',
    'default',
    'example',
  ];

  const normalizedSecret = secret.toLowerCase();
  if (weakSecretPatterns.some((pattern) => normalizedSecret.includes(pattern))) {
    throw new Error(
      'BETTER_AUTH_SECRET appears weak or default-like. Use a high-entropy random secret.',
    );
  }
}

function getCaptchaConfig(
  provider: string,
  runtimeConfig: ReturnType<typeof useRuntimeConfig>,
): CaptchaConfig | null {
  const normalizedProvider = provider.toLowerCase();

  switch (normalizedProvider) {
    case 'turnstile':
    case 'cloudflare-turnstile':
      if (runtimeConfig.turnstile?.secretKey) {
        return {
          provider: 'cloudflare-turnstile',
          secretKey: runtimeConfig.turnstile.secretKey,
        };
      }
      return null;

    case 'recaptcha':
    case 'google-recaptcha':
      if (runtimeConfig.recaptcha?.secretKey) {
        return {
          provider: 'google-recaptcha',
          secretKey: runtimeConfig.recaptcha.secretKey,
          minScore: runtimeConfig.recaptcha?.minScore || 0.5,
        };
      }
      return null;

    case 'hcaptcha':
      if (runtimeConfig.hcaptcha?.secretKey) {
        return {
          provider: 'hcaptcha',
          secretKey: runtimeConfig.hcaptcha.secretKey,
          siteKey: runtimeConfig.hcaptcha?.siteKey,
        };
      }
      return null;

    default:
      return null;
  }
}

function useAuthDb() {
  return useDrizzle();
}

async function getSessionProfile(userId: string) {
  const db = useAuthDb();

  const result = await db
    .select({
      id: tables.users.id,
      role: tables.users.role,
      rootAdmin: tables.users.rootAdmin,
      passwordResetRequired: tables.users.passwordResetRequired,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
      username: tables.users.username,
    })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);

  const user = result[0];

  if (!user) {
    return null;
  }

  const name = [user.nameFirst, user.nameLast].filter(Boolean).join(' ') || user.username || null;

  return {
    role: user.rootAdmin || user.role === 'admin' ? 'admin' : 'user',
    passwordResetRequired: Boolean(user.passwordResetRequired),
    name,
  };
}

function createAuth() {
  const runtimeConfig = useRuntimeConfig();
  const db = useAuthDb();

  const isProduction = process.env.NODE_ENV === 'production';

  const baseURL =
    runtimeConfig.authOrigin ||
    process.env.BETTER_AUTH_URL ||
    process.env.AUTH_ORIGIN ||
    process.env.NUXT_AUTH_ORIGIN ||
    process.env.NUXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    undefined;

  const secret =
    runtimeConfig.authSecret ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    undefined;
  const captchaProvider = (process.env.CAPTCHA_PROVIDER || 'turnstile').toLowerCase();
  const captchaConfig = getCaptchaConfig(captchaProvider, runtimeConfig);

  if (isProduction) {
    if (!secret) {
      throw new Error(
        'BETTER_AUTH_SECRET is required in production. Set it in your environment variables.',
      );
    }
    if (!baseURL) {
      throw new Error(
        'BETTER_AUTH_URL (authOrigin) is required in production. Set it in your environment variables.',
      );
    }
  }

  assertSecretSecurity(isProduction, secret);

  const trustedOrigins: string[] = [];

  if (baseURL) {
    trustedOrigins.push(baseURL);
  }

  if (!isProduction) {
    if (!trustedOrigins.includes('http://localhost:3000')) {
      trustedOrigins.push('http://localhost:3000');
    }
  }

  if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
    const additionalOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .filter((origin) => !trustedOrigins.includes(origin));
    trustedOrigins.push(...additionalOrigins);
  }

  if (process.env.NUXT_SECURITY_CORS_ORIGIN) {
    const corsOrigins = process.env.NUXT_SECURITY_CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .filter((origin) => !trustedOrigins.includes(origin));
    trustedOrigins.push(...corsOrigins);
  }

  const appUrl = process.env.NUXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (appUrl && appUrl !== baseURL && !trustedOrigins.includes(appUrl)) {
    trustedOrigins.push(appUrl);
  }

  const ipAddressHeaders = process.env.BETTER_AUTH_IP_HEADER
    ? [process.env.BETTER_AUTH_IP_HEADER]
    : ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'];

  const adapterSchema = {
    user: tables.users,
    session: tables.sessions,
    account: tables.accounts,
    verificationToken: tables.verificationTokens,
    rateLimit: tables.rateLimit,
    apikey: tables.apiKeys,
    twoFactor: tables.twoFactor,
    jwks: tables.jwks,
  };

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: adapterSchema as any,
    }),
    account: {
      fields: {
        providerId: 'provider',
        accountId: 'providerAccountId',
      },
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        updateUserInfoOnLink: true,
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }, _request) => {
          const { sendEmail } = await import('#server/utils/email');
          void sendEmail({
            to: user.email,
            subject: 'Confirm Email Change',
            html: `
              <h2>Confirm Email Change</h2>
              <p>You requested to change your email address to <strong>${newEmail}</strong>.</p>
              <p>Click the link below to confirm this change:</p>
              <p><a href="${url}">Confirm Email Change</a></p>
              <p>If you didn't request this change, please ignore this email.</p>
            `,
          }).catch((error) => console.error('[auth][email][change-email-confirmation]', error));
        },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }, _request) => {
          const { sendEmail } = await import('#server/utils/email');
          void sendEmail({
            to: user.email,
            subject: 'Confirm Account Deletion',
            html: `
              <h2>Confirm Account Deletion</h2>
              <p>You requested to delete your ${runtimeConfig.public.appName || 'XyraPanel'} account.</p>
              <p><strong>Warning:</strong> This action cannot be undone. All your data, servers, and settings will be permanently deleted.</p>
              <p>Click the link below to confirm account deletion:</p>
              <p><a href="${url}" style="color: #ef4444; font-weight: bold;">Delete My Account</a></p>
              <p>If you didn't request this, please ignore this email and secure your account.</p>
            `,
          }).catch((error) => console.error('[auth][email][delete-account]', error));
        },
        beforeDelete: async (user, _request) => {
          const db = useAuthDb();

          const result = await db
            .select({
              rootAdmin: tables.users.rootAdmin,
              role: tables.users.role,
            })
            .from(tables.users)
            .where(eq(tables.users.id, user.id))
            .limit(1);

          const dbUser = result[0];

          if (dbUser?.rootAdmin || dbUser?.role === 'admin') {
            throw new (await import('better-auth/api')).APIError('BAD_REQUEST', {
              message: 'Admin accounts cannot be deleted',
            });
          }
        },
      },
    },
    ...(secret && { secret }),
    ...(baseURL && { baseURL }),
    basePath: '/api/auth',
    appName: runtimeConfig.public.appName || 'XyraPanel',
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password: string) => {
          return await bcrypt.hash(password, 12);
        },
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          return await bcrypt.compare(password, hash);
        },
      },
      sendResetPassword: async ({ user, token }, _request) => {
        const { sendPasswordResetEmail, resolvePanelBaseUrl } = await import('#server/utils/email');
        const resetBaseUrl = `${resolvePanelBaseUrl()}/auth/password/reset`;
        void sendPasswordResetEmail(user.email, token, resetBaseUrl).catch((error) =>
          console.error('[auth][email][password-reset]', error),
        );
      },
      resetPasswordTokenExpiresIn: 3600,
      onPasswordReset: async ({ user }, _request) => {
        const db = useAuthDb();

        await db.delete(tables.sessions).where(eq(tables.sessions.userId, user.id));

        await db
          .update(tables.users)
          .set({ passwordResetRequired: false })
          .where(eq(tables.users.id, user.id));
      },
    },
    session: {
      expiresIn: 14 * 24 * 60 * 60,
      updateAge: 12 * 60 * 60,
      freshAge: 5 * 60,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: 'compact',
      },
      fields: {
        token: 'sessionToken',
        expiresAt: 'expires',
        userId: 'userId',
      },
    },
    verification: {
      fields: {
        value: 'token',
        expiresAt: 'expires',
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, token }, _request) => {
        const { sendEmailVerificationEmail } = await import('#server/utils/email');
        const rawUser = user as Record<string, unknown>;
        const username =
          typeof rawUser.username === 'string' ? rawUser.username : user.name || null;
        void sendEmailVerificationEmail({
          to: user.email,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 24 * 1000),
          username,
        }).catch((error) => console.error('[auth][email][verify-email]', error));
      },
    },
    trustedOrigins,
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: 'database',
      customRules: {
        '/sign-in/email': {
          window: 10,
          max: 3,
        },
        '/sign-in/username': {
          window: 10,
          max: 3,
        },
        '/two-factor/verify': {
          window: 10,
          max: 3,
        },
        '/change-password': {
          window: 60,
          max: 5,
        },
        '/api-key/create': {
          window: 60,
          max: 10,
        },
      },
    },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: !isProduction,
      useSecureCookies: isProduction,
      ipAddress: {
        ipAddressHeaders,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
      },
    },
    onAPIError: {
      throw: false,
      onError: (error: unknown, ctx: AuthContext) => {
        const maybeRequest = 'request' in ctx ? (ctx as { request?: unknown }).request : undefined;
        const request = maybeRequest instanceof Request ? maybeRequest : undefined;
        const isProduction = process.env.NODE_ENV === 'production';
        let path = 'unknown';
        if (request?.url) {
          try {
            path = new URL(request.url).pathname;
          } catch {
            path = request.url;
          }
        }
        const isAuthPath = path.startsWith('/api/auth');

        if (path.startsWith('/api/auth/sign-in')) {
          const maybeBody = 'body' in ctx ? (ctx as { body?: unknown }).body : undefined;
          const identifier =
            maybeBody && typeof maybeBody === 'object'
              ? (maybeBody as { email?: string }).email ||
                (maybeBody as { username?: string }).username ||
                null
              : null;
          const headers = request?.headers;
          const ip = headers
            ? ipAddressHeaders.map((header) => headers.get(header)).find((value) => Boolean(value))
            : null;
          const reason = error instanceof Error ? error.message : String(error);
          console.warn('[auth][sign-in-failed]', {
            path,
            method: request?.method || 'UNKNOWN',
            identifier,
            ip: ip?.split(',')[0]?.trim() || null,
            reason,
          });
        }

        if (isProduction) {
          if (isAuthPath) {
            return;
          }

          const errorName = error instanceof Error ? error.name : 'UnknownError';
          if (errorName === 'APIError' || errorName === 'ValidationError') {
            return;
          }
        }
      },
    },
    logger: {
      disabled: false,
      level: isProduction ? 'error' : 'warn',
    },
    plugins: [
      ...(captchaConfig
        ? [
            captcha({
              provider: captchaConfig.provider,
              secretKey: captchaConfig.secretKey,
              ...(captchaConfig.minScore && { minScore: captchaConfig.minScore }),
              ...(captchaConfig.siteKey && { siteKey: captchaConfig.siteKey }),
            }),
          ]
        : []),
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
      }),
      twoFactor({
        issuer: runtimeConfig.public.appName || 'XyraPanel',
      }),
      admin({
        adminRoles: ['admin'],
        defaultRole: 'user',
        impersonationSessionDuration: 60 * 60,
        defaultBanReason: 'No reason provided',
        bannedUserMessage:
          'You have been banned from this application. Please contact support if you believe this is an error.',
      }),
      apiKey({
        apiKeyHeaders: ['x-api-key'],
        customAPIKeyGetter: (ctx: ApiKeyRequestContext) => {
          const bearer = ctx.headers?.get('authorization');
          if (bearer?.startsWith('Bearer ')) {
            const token = bearer.slice(7).trim();
            if (token) {
              return token;
            }
          }
          const headerKey = ctx.headers?.get('x-api-key');
          return headerKey || null;
        },
        enableSessionForAPIKeys: true,
        disableKeyHashing: false,
        defaultKeyLength: 32,
        fallbackToDatabase: true,
        keyExpiration: {
          defaultExpiresIn: 60 * 60 * 24 * 90,
          disableCustomExpiresTime: false,
          minExpiresIn: 1,
          maxExpiresIn: 90,
        },
      }),
      bearer(),
      multiSession({
        maximumSessions: 5,
      }),
      customSession(async ({ user, session }) => {
        if (!user?.id) {
          return { user, session };
        }

        const profile = await getSessionProfile(user.id);
        if (!profile) {
          return { user, session };
        }

        return {
          user: {
            ...user,
            role: profile.role,
            passwordResetRequired: profile.passwordResetRequired,
            name: profile.name ?? user.name ?? null,
          },
          session,
        };
      }),
    ],
  });
}

export function getAuth() {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}

export const auth = getAuth();

/**
 * Normalizes H3 event headers to a format compatible with Better Auth API.
 */
export function normalizeHeadersForAuth(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalized[key] = Array.isArray(value) ? value[0]! : value;
    }
  }
  return normalized;
}
