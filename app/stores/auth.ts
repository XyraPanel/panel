import { defineStore } from 'pinia';
import type { SessionUser } from '#shared/types/auth';
import { authClient } from '~/utils/auth-client';

const EMPTY_PERMISSIONS: string[] = [];

export const useAuthStore = defineStore('auth', () => {
  const sessionRef = authClient.useSession();
  const sessionData = computed(() => sessionRef.value?.data ?? null);
  const isPending = computed(() => sessionRef.value?.isPending ?? false);

  const authStatus = computed(() => {
    if (sessionData.value) return 'authenticated';
    if (isPending.value) return 'loading';
    return 'unauthenticated';
  });

  const user = computed<SessionUser | null>(() => {
    const session = sessionData.value;
    if (!session) return null;
    const sessionUser =
      'user' in session && typeof (session as { user?: unknown }).user !== 'undefined'
        ? (session as { user?: unknown }).user
        : null;
    if (!sessionUser || typeof sessionUser !== 'object') return null;
    return sessionUser as SessionUser;
  });

  const permissions = computed(() => user.value?.permissions ?? EMPTY_PERMISSIONS);
  const permissionSet = computed(() => new Set(permissions.value));
  const isAdmin = computed(() => user.value?.role === 'admin');
  const isSuperUser = computed(() => isAdmin.value || Boolean(user.value?.remember));
  const displayName = computed(() => {
    if (!user.value) return null;
    return user.value.username || user.value.email || user.value.name || null;
  });
  const requiresPasswordReset = computed(() => Boolean(user.value?.passwordResetRequired));
  const avatar = computed(() => {
    if (!user.value || !displayName.value) {
      return null;
    }
    return {
      alt: displayName.value,
      text: displayName.value.slice(0, 2).toUpperCase(),
    };
  });
  const isAuthenticated = computed(
    () => authStatus.value === 'authenticated' && Boolean(user.value),
  );

  function hasPermission(required: string | string[]) {
    if (isAdmin.value) return true;

    const values = permissionSet.value;

    if (Array.isArray(required)) {
      return required.some((permission) => values.has(permission));
    }

    return values.has(required);
  }

  async function syncSession(options?: { disableCookieCache?: boolean }) {
    const query = options?.disableCookieCache ? { disableCookieCache: 'true' } : undefined;
    await authClient.getSession(query ? { query } : undefined);
  }

  async function logout(options?: { revokeOthersFirst?: boolean }) {
    try {
      if (options?.revokeOthersFirst && typeof authClient.revokeOtherSessions === 'function') {
        await authClient.revokeOtherSessions();
      }

      await authClient.signOut();
    } catch (err) {
      const { t } = useI18n();
      throw new Error(err instanceof Error ? err.message : t('auth.failedToSignOut'));
    }
  }

  async function login(
    identity: string,
    password: string,
    token?: string,
    captchaToken?: string,
    options?: { revokeOthersFirst?: boolean },
  ) {
    const isEmail = identity.includes('@');

    const fetchOptions = captchaToken
      ? {
          headers: {
            'x-captcha-response': captchaToken,
          },
        }
      : undefined;

    let result;
    if (isEmail) {
      result = await authClient.signIn.email({
        email: identity,
        password,
        fetchOptions,
      });
    } else {
      result = await authClient.signIn.username({
        username: identity,
        password,
        fetchOptions,
      });
    }

    if (result.error) {
      return { error: result.error.message };
    }

    const requiresTwoFactor = Boolean(
      result.data &&
      typeof result.data === 'object' &&
      'twoFactorRedirect' in result.data &&
      (result.data as Record<string, unknown>).twoFactorRedirect === true,
    );

    if (requiresTwoFactor) {
      if (!token) {
        return { error: 'Two-factor authentication required', twoFactorRedirect: true };
      }

      const twoFactorResult = await authClient.twoFactor.verifyTotp({
        code: token,
        trustDevice: true,
      });

      if (twoFactorResult.error) {
        return { error: twoFactorResult.error.message, twoFactorRedirect: true };
      }
    }

    if (options?.revokeOthersFirst && typeof authClient.revokeOtherSessions === 'function') {
      try {
        await authClient.revokeOtherSessions();
      } catch (error) {
        console.warn('[auth] Failed to revoke other sessions after login:', error);
      }
    }

    await syncSession();

    return result;
  }

  return {
    session: sessionData,
    status: authStatus,
    user,
    permissions,
    isAdmin,
    isSuperUser,
    displayName,
    avatar,
    isAuthenticated,
    hasPermission,
    syncSession,
    logout,
    login,
    requiresPasswordReset,
  };
});
