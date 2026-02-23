import { storeToRefs } from 'pinia';
import { useAuthStore } from '~/stores/auth';
import { authClient } from '~/utils/auth-client';

interface UseImpersonationControlsOptions {
  redirectTo?: string | null;
  notifications?: boolean;
}

interface StopImpersonatingOptions {
  redirectTo?: string | null;
  notifications?: boolean;
}

export function useImpersonationControls(options?: UseImpersonationControlsOptions) {
  const authStore = useAuthStore();
  const { session, user } = storeToRefs(authStore);
  const router = useRouter();
  const toast = useToast();
  const { t } = useI18n();

  const stopImpersonationLoading = ref(false);

  const impersonatedBy = computed<string | null>(() => {
    const sessionValue = session.value;
    if (!sessionValue || typeof sessionValue !== 'object') {
      return null;
    }

    const nestedSession = 'session' in sessionValue ? sessionValue.session : null;
    if (!nestedSession || typeof nestedSession !== 'object') {
      return null;
    }

    const value = 'impersonatedBy' in nestedSession ? nestedSession.impersonatedBy : null;
    return typeof value === 'string' ? value : null;
  });

  const isImpersonating = computed(() => Boolean(impersonatedBy.value));

  const impersonatedUserName = computed(() => {
    return user.value?.username || user.value?.email || user.value?.name || t('common.user');
  });

  async function stopImpersonating(override?: StopImpersonatingOptions) {
    if (stopImpersonationLoading.value) return;

    stopImpersonationLoading.value = true;
    try {
      const result = await authClient.admin.stopImpersonating({});
      if (result.error) {
        throw new Error(result.error.message || t('layout.impersonationStopFailed'));
      }

      await authClient.getSession({ fetchOptions: { cache: 'no-store' } });
      clearNuxtData();
      await refreshNuxtData();

      const shouldNotify = override?.notifications ?? options?.notifications ?? true;
      if (shouldNotify) {
        toast.add({
          title: t('layout.impersonationStoppedTitle'),
          description: t('layout.impersonationStoppedDescription'),
          color: 'success',
        });
      }

      const redirectTarget =
        'redirectTo' in (override ?? {}) ? override?.redirectTo : (options?.redirectTo ?? '/admin');
      if (redirectTarget) await router.push(redirectTarget);
    } catch (error) {
      const shouldNotify = override?.notifications ?? options?.notifications ?? true;
      if (shouldNotify) {
        const description =
          error instanceof Error ? error.message : t('layout.impersonationStopFailed');
        toast.add({
          title: t('layout.impersonationStopFailed'),
          description,
          color: 'error',
        });
      }
    } finally {
      stopImpersonationLoading.value = false;
    }
  }

  return {
    isImpersonating,
    impersonatedUserName,
    stopImpersonating,
    stopImpersonationLoading,
  };
}
