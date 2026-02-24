<script setup lang="ts">
import { ref, computed } from 'vue';
import type { FormSubmitEvent } from '@nuxt/ui';
import { accountLoginFormSchema } from '#shared/schema/account';
import type { AccountLoginFormInput } from '#shared/schema/account';
import { until } from '@vueuse/core';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const authStore = useAuthStore();
const { status } = storeToRefs(authStore);
const runtimeConfig = useRuntimeConfig();
const appName = computed(() => runtimeConfig.public.appName || 'XyraPanel');
const { data: brandingSettings } = await useFetch('/api/branding', {
  key: 'auth-login-branding-settings',
  default: () =>
    ({
      showBrandLogo: false,
      brandLogoUrl: null,
    }) as { showBrandLogo: boolean; brandLogoUrl: string | null },
});
const route = useRoute();
const toast = useToast();

const turnstileSiteKey = computed(() => runtimeConfig.public.turnstile?.siteKey || '');
const hasTurnstile = computed(() => !!turnstileSiteKey.value && turnstileSiteKey.value.length > 0);

definePageMeta({
  auth: false,
});

useSeoMeta({
  title: () => `${t('auth.signIn')} | ${appName.value}`,
  description: () => t('auth.enterUsernameOrEmail'),
  ogTitle: () => `${t('auth.signIn')} | ${appName.value}`,
  ogDescription: () => t('auth.enterUsernameOrEmail'),
  twitterTitle: () => `${t('auth.signIn')} | ${appName.value}`,
  twitterDescription: () => t('auth.enterUsernameOrEmail'),
});

const requiresToken = ref(false);
const turnstileToken = ref<string | undefined>(undefined);
const turnstileRef = ref<{ reset: () => void } | null>(null);

type AuthFormField = {
  name: string;
  type: string;
  label: string;
  placeholder?: string;
  icon?: string;
  help?: string;
  required?: boolean;
  autocomplete?: string;
};

const baseFields: AuthFormField[] = [
  {
    name: 'identity',
    type: 'text',
    label: t('auth.usernameOrEmail'),
    placeholder: t('auth.enterUsernameOrEmail'),
    icon: 'i-lucide-user',
    required: true,
    autocomplete: 'username',
  },
  {
    name: 'password',
    type: 'password',
    label: t('auth.password'),
    placeholder: t('auth.enterPassword'),
    icon: 'i-lucide-lock',
    required: true,
    autocomplete: 'current-password',
  },
];

const tokenField: AuthFormField = {
  name: 'token',
  type: 'text',
  label: t('auth.authenticatorCode'),
  placeholder: t('auth.enterAuthenticatorCode'),
  icon: 'i-lucide-smartphone',
  help: t('auth.enterCodeFromAuthenticator'),
  autocomplete: 'one-time-code',
};

const fields = computed<AuthFormField[]>(() =>
  requiresToken.value ? [...baseFields, tokenField] : baseFields,
);

const schema = accountLoginFormSchema;

type Schema = AccountLoginFormInput;

const loading = ref(false);
const submitProps = computed(() => ({
  label: t('auth.signIn'),
  icon: 'i-lucide-log-in',
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

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true;
  try {
    const { identity, password, token } = payload.data;
    const submittedToken = token ?? '';

    if (requiresToken.value && !token) {
      throw new Error(t('auth.twoFactorTokenRequired'));
    }

    if (hasTurnstile.value && !turnstileToken.value) {
      toast.add({
        color: 'error',
        title: t('auth.verificationRequired'),
        description: t('auth.completeSecurityVerification'),
      });
      return;
    }

    const result = await authStore.login(
      identity,
      password,
      token,
      turnstileToken.value || undefined,
    );

    if (result?.error) {
      turnstileRef.value?.reset();
      turnstileToken.value = undefined;
    }

    if (result?.error) {
      const errorMessage = result.error.toLowerCase();
      const indicatesTwoFactor =
        errorMessage.includes('two-factor') ||
        errorMessage.includes('recovery token') ||
        errorMessage.includes('2fa');
      const missingToken = indicatesTwoFactor && submittedToken.length === 0;

      if (indicatesTwoFactor) requiresToken.value = true;

      if (missingToken) {
        toast.add({
          color: 'info',
          title: t('auth.twoFactorRequired'),
          description: t('auth.enterAuthenticatorCodeToFinish'),
        });
        return;
      }

      throw new Error(result.error);
    }

    toast.add({
      color: 'success',
      title: t('auth.welcomeBack'),
      description: t('auth.signedIn'),
    });

    await until(status).toMatch((v: string | null | undefined) => v === 'authenticated');

    await navigateTo(redirectPath.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : t('auth.unableToSignIn');
    const submittedToken = payload.data.token ?? '';
    if (typeof message === 'string') {
      const lowered = message.toLowerCase();
      const indicatesTwoFactor =
        lowered.includes('two-factor') || lowered.includes('recovery token');
      const missingToken = indicatesTwoFactor && submittedToken.length === 0;

      if (indicatesTwoFactor) requiresToken.value = true;

      if (missingToken) {
        toast.add({
          color: 'info',
          title: t('auth.twoFactorRequired'),
          description: t('auth.enterAuthenticatorCodeToFinish'),
        });
        return;
      }
    }
    toast.add({
      color: 'error',
      title: t('auth.signInFailed'),
      description: message,
    });
    turnstileRef.value?.reset();
    turnstileToken.value = undefined;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ClientOnly>
    <div class="space-y-6">
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
                {{ t('auth.signIn') }}
              </h2>
              <p class="text-sm text-white/80">
                {{ t('auth.signInToContinue') }}
              </p>
            </div>
          </div>
        </template>
        <template #password-hint>
          <NuxtLink to="/auth/password/request" class="text-primary font-medium" tabindex="-1">
            {{ t('auth.forgotPassword') }}?
          </NuxtLink>
        </template>
      </UAuthForm>
      <div v-if="hasTurnstile" class="flex flex-col items-center gap-2 mt-4">
        <NuxtTurnstile
          ref="turnstileRef"
          v-model="turnstileToken"
          :options="{
            theme: 'dark',
            size: 'normal',
          }"
        />
      </div>
    </div>
    <template #fallback>
      <div class="space-y-4">
        <div class="h-8 w-1/2 bg-default/40 animate-pulse rounded" />
        <div class="h-40 w-full bg-default/30 animate-pulse rounded" />
        <div class="h-10 w-full bg-default/30 animate-pulse rounded" />
      </div>
    </template>
  </ClientOnly>
</template>
