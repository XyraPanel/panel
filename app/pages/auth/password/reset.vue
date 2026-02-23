<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui';
import { passwordResetSchema, type PasswordResetInput } from '#shared/schema/account';
import type { PasswordResetBody } from '#shared/types/account';
import { authClient } from '~/utils/auth-client';

definePageMeta({
  auth: false,
});

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const appName = computed(() => runtimeConfig.public.appName || 'XyraPanel');
const { data: brandingSettings } = await useFetch('/api/branding', {
  key: 'auth-password-reset-branding',
  default: () =>
    ({
      showBrandLogo: false,
      brandLogoUrl: null,
    }) as { showBrandLogo: boolean; brandLogoUrl: string | null },
});

const fields: AuthFormField[] = [
  {
    name: 'token',
    type: 'text',
    label: t('auth.resetToken'),
    placeholder: t('auth.pasteTokenFromEmail'),
    icon: 'i-lucide-key',
    required: true,
    autocomplete: 'off',
  },
  {
    name: 'password',
    type: 'password',
    label: t('auth.newPassword'),
    placeholder: t('auth.enterNewPassword'),
    icon: 'i-lucide-lock',
    required: true,
    autocomplete: 'new-password',
  },
  {
    name: 'confirmPassword',
    type: 'password',
    label: t('auth.confirmPassword'),
    placeholder: t('auth.reEnterPassword'),
    icon: 'i-lucide-shield-check',
    required: true,
    autocomplete: 'new-password',
  },
];

const schema = passwordResetSchema;

const loading = ref(false);

const submitProps = computed(() => ({
  label: t('auth.updatePassword'),
  icon: 'i-lucide-save',
  block: true,
  variant: 'subtle' as const,
  color: 'primary' as const,
  loading: loading.value,
}));

const initialToken = computed(() => {
  return typeof route.query.token === 'string' ? route.query.token : '';
});

async function onSubmit(payload: FormSubmitEvent<PasswordResetInput>) {
  loading.value = true;
  try {
    const formData = payload.data;
    const token = String(formData.token || initialToken.value).trim();

    if (!token) {
      throw new Error(t('auth.resetTokenRequired'));
    }

    const newPassword = String(formData.password).trim();

    const requestBody: PasswordResetBody = {
      token,
      newPassword,
    };

    await $fetch('/api/auth/password/reset', {
      method: 'POST',
      body: requestBody,
    });

    try {
      await authClient.signOut();
    } catch {
      // Ignore user might not be logged in anyway
    }

    toast.add({
      title: t('auth.passwordUpdated'),
      description: t('auth.canNowSignIn'),
      color: 'success',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    router.push('/auth/login');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('auth.unableToResetPassword');
    toast.add({
      title: t('auth.resetFailed'),
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
            {{ t('auth.setNewPassword') }}
          </h2>
          <p class="text-sm text-white/80">
            {{ t('auth.enterResetTokenAndPassword') }}
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <NuxtLink to="/auth/login" class="text-primary font-medium">
        {{ t('auth.backToSignIn') }}
      </NuxtLink>
    </template>
  </UAuthForm>
</template>
