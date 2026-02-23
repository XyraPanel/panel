<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui';
import type { FetchError } from 'ofetch';
import { accountForcedPasswordSchema } from '#shared/schema/account';
import type { PasswordForceBody } from '#shared/types/account';

const { t } = useI18n();
const authStore = useAuthStore();
const { status, requiresPasswordReset, isAuthenticated } = storeToRefs(authStore);
const route = useRoute();
const toast = useToast();
const runtimeConfig = useRuntimeConfig();
const appName = computed(() => runtimeConfig.public.appName || 'XyraPanel');
const { data: brandingSettings } = await useFetch('/api/branding', {
  key: 'auth-password-force-branding',
  default: () =>
    ({
      showBrandLogo: false,
      brandLogoUrl: null,
    }) as { showBrandLogo: boolean; brandLogoUrl: string | null },
});

definePageMeta({
  auth: true,
});

const schema = accountForcedPasswordSchema;

const fields: AuthFormField[] = [
  {
    name: 'newPassword',
    type: 'password',
    label: t('auth.newPassword'),
    placeholder: t('auth.enterNewPassword'),
    icon: 'i-lucide-key',
    required: true,
    autocomplete: 'new-password',
  },
  {
    name: 'confirmPassword',
    type: 'password',
    label: t('auth.confirmPassword'),
    placeholder: t('auth.reEnterNewPassword'),
    icon: 'i-lucide-shield-check',
    required: true,
    autocomplete: 'new-password',
  },
];

const loading = ref(false);
const errorMessage = ref<string | null>(null);

const submitProps = computed(() => ({
  label: t('auth.updatePassword'),
  icon: 'i-lucide-save',
  block: true,
  variant: 'subtle' as const,
  color: 'primary' as const,
  loading: loading.value,
}));

const redirectPath = computed(() => {
  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect.startsWith('/')) return redirect;
  return '/';
});

async function redirectAfterReset() {
  if (status.value === 'authenticated' && isAuthenticated.value) {
    await navigateTo(redirectPath.value);
  } else {
    await navigateTo('/auth/login');
  }
}

watch(
  requiresPasswordReset,
  async (value) => {
    if (value === false) {
      await redirectAfterReset();
    }
  },
  { immediate: true },
);

async function onSubmit(event: FormSubmitEvent<PasswordForceBody>) {
  loading.value = true;
  errorMessage.value = null;
  try {
    if (!requiresPasswordReset.value) {
      await redirectAfterReset();
      return;
    }

    const newPassword = String(event.data.newPassword);
    const confirmPassword = event.data.confirmPassword
      ? String(event.data.confirmPassword)
      : undefined;
    const body: PasswordForceBody = {
      newPassword,
      confirmPassword,
    };
    // @ts-expect-error - Nuxt typed routes cause deep type instantiation here
    await $fetch<{ success: boolean }, { method: 'PUT'; body: PasswordForceBody }>(
      '/api/account/password/force',
      {
        method: 'PUT',
        body,
      },
    );

    await authStore.syncSession({ disableCookieCache: true });

    toast.add({
      title: t('auth.passwordUpdated'),
      description: t('auth.passwordChangedSuccessfully'),
      color: 'success',
    });

    await redirectAfterReset();
    return;
  } catch (error) {
    const fetchError = error as FetchError<{ message?: string }>;
    const message =
      fetchError?.data?.message ??
      (error instanceof Error ? error.message : t('auth.unableToUpdatePassword'));
    errorMessage.value = message;
    toast.add({
      title: t('auth.passwordUpdateFailed'),
      description: message,
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UAuthForm :schema="schema" :fields="fields" :submit="submitProps" @submit="onSubmit as any">
    <template #title>
      <div class="flex flex-col items-center gap-3 text-center">
        <img
          v-if="brandingSettings?.showBrandLogo && brandingSettings?.brandLogoUrl"
          :src="brandingSettings.brandLogoUrl"
          :alt="appName"
          class="h-16 w-auto"
        />
        <h1 v-else class="text-3xl font-semibold text-white">
          {{ appName }}
        </h1>
        <div class="space-y-1">
          <h2 class="text-2xl font-semibold text-white">
            {{ t('auth.passwordResetRequired') }}
          </h2>
          <p class="text-sm text-white/80">
            {{ t('auth.chooseNewPasswordToContinue') }}
          </p>
        </div>
      </div>
    </template>
    <template #validation>
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        icon="i-lucide-alert-triangle"
        :title="errorMessage"
      />
    </template>
  </UAuthForm>
</template>
