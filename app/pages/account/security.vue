<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import type { FormSubmitEvent } from '@nuxt/ui';
import { accountPasswordFormSchema, type AccountPasswordFormInput } from '#shared/schema/account';
import type {
  TotpSetupResponse,
  TotpDisableRequest,
  PasswordUpdateResponse,
} from '#shared/types/account';
import { useAuthStore } from '~/stores/auth';
import { authClient } from '~/utils/auth-client';

definePageMeta({
  auth: true,
  ssr: false,
  title: 'Security',
  subtitle: 'Manage your account security settings and authentication',
});

const { t } = useI18n();
const toast = useToast();
const runtimeConfig = useRuntimeConfig();
const isMounted = ref(false);

onMounted(() => {
  isMounted.value = true;
});

const authStore = useAuthStore();
const { status, user } = storeToRefs(authStore);

const passwordError = ref<string | null>(null);
const isSavingPassword = ref(false);

const passwordSchema = accountPasswordFormSchema;

type PasswordFormSchema = AccountPasswordFormInput;

const passwordForm = reactive<PasswordFormSchema>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const passwordStrengthHint = computed(() => {
  if (!passwordForm.newPassword) return t('account.security.password.passwordStrengthHint');

  if (passwordForm.newPassword.length < 12) return t('account.security.password.passwordMinLength');

  return t('account.security.password.passwordLooksGood');
});

const passwordIsValid = computed(() => passwordSchema.safeParse(passwordForm).success);
const passwordErrorMessage = computed(() => passwordError.value);

async function handlePasswordSubmit(event: FormSubmitEvent<PasswordFormSchema>) {
  if (isSavingPassword.value || !passwordIsValid.value) return;

  isSavingPassword.value = true;
  passwordError.value = null;

  try {
    const payload = event.data;

    const response = await $fetch<PasswordUpdateResponse>('/api/account/password', {
      method: 'PUT',
      body: payload,
    });

    toast.add({
      title: t('account.security.password.passwordUpdated'),
      description: t('account.security.password.passwordChanged'),
      color: 'success',
    });

    await authClient.signOut();
    await navigateTo('/auth/login');
  } catch (error) {
    const err = error as { data?: { message?: string }; message?: string };
    const message =
      err.data?.message || err.message || t('account.security.password.unableToUpdatePassword');
    passwordError.value = message;

    toast.add({
      title: t('account.security.password.failedToUpdatePassword'),
      description: message,
      color: 'error',
    });
  } finally {
    isSavingPassword.value = false;
  }
}

const twoFactorError = ref<string | null>(null);
const totpSetup = ref<TotpSetupResponse | null>(null);
const verificationCode = ref('');
const trustDevice = ref(true);
const verifyingToken = ref(false);
const enableForm = reactive({
  password: '',
  issuer: String(runtimeConfig.public?.appName || '').trim(),
});
const disableForm = reactive({ password: '' });
const disableSubmitting = ref(false);
const enableSubmitting = ref(false);
const totpStateOverride = ref<boolean | null>(null);

const isAuthLoading = computed(() => status.value === 'loading');
const usernameValue = computed(() => user.value?.email || user.value?.username || '');
const totpEnabled = computed(() => {
  if (totpStateOverride.value !== null) return totpStateOverride.value;

  const sessionUser = user.value;
  return Boolean(
    sessionUser &&
    ((sessionUser as { twoFactorEnabled?: boolean }).twoFactorEnabled ||
      ('useTotp' in sessionUser && (sessionUser as { useTotp?: boolean }).useTotp)),
  );
});

watch(totpEnabled, (enabled) => {
  if (enabled) clearSetupState();
});

watch(user, () => {
  totpStateOverride.value = null;
});

function clearSetupState() {
  totpSetup.value = null;
  verificationCode.value = '';
  twoFactorError.value = null;
}

async function beginTotpSetup() {
  if (totpEnabled.value) {
    toast.add({
      title: t('account.security.twoFactor.alreadyEnabled'),
      description: t('account.security.twoFactor.disableFirst'),
    });
    return;
  }

  if (!enableForm.password) {
    twoFactorError.value = t('account.security.twoFactor.enterPasswordToEnable');
    return;
  }

  enableSubmitting.value = true;
  twoFactorError.value = null;
  totpSetup.value = null;
  verificationCode.value = '';

  try {
    const setup = await $fetch<TotpSetupResponse>('/api/user/2fa/enable', {
      method: 'POST',
      body: {
        password: enableForm.password,
        issuer: enableForm.issuer.trim() || undefined,
      },
    });
    totpSetup.value = (setup as any).data ?? setup;
    enableForm.password = '';

    toast.add({
      title: t('account.security.twoFactor.totpSetupStarted'),
      description: t('account.security.twoFactor.scanQRCode'),
      color: 'primary',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('account.security.twoFactor.failedToStartSetup');
    twoFactorError.value = message;
    toast.add({
      title: t('account.security.twoFactor.unableToStartSetup'),
      description: message,
      color: 'error',
    });
  } finally {
    enableSubmitting.value = false;
  }
}

async function verifyTotp() {
  if (!totpSetup.value) {
    twoFactorError.value = t('account.security.twoFactor.startSetupFirst');
    return;
  }

  if (verificationCode.value.trim().length < 6) {
    twoFactorError.value = t('account.security.twoFactor.enter6DigitCodeFromApp');
    return;
  }

  verifyingToken.value = true;
  twoFactorError.value = null;

  try {
    await $fetch('/api/user/2fa/verify', {
      method: 'POST',
      body: {
        code: verificationCode.value.trim(),
        trustDevice: trustDevice.value,
      },
    });

    totpSetup.value = null;
    totpStateOverride.value = true;
    toast.add({
      title: t('account.security.twoFactor.twoFactorEnabled'),
      description: t('account.security.twoFactor.keepRecoveryTokens'),
      color: 'success',
    });
    clearSetupState();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t('account.security.twoFactor.invalidVerificationCode');
    twoFactorError.value = message;
    toast.add({
      title: t('account.security.twoFactor.verificationFailed'),
      description: message,
      color: 'error',
    });
  } finally {
    verifyingToken.value = false;
  }
}

async function disableTotp() {
  if (!totpEnabled.value) return;

  if (!disableForm.password) {
    twoFactorError.value = t('account.security.twoFactor.confirmPasswordToDisable');
    return;
  }

  disableSubmitting.value = true;
  twoFactorError.value = null;

  try {
    const payload: TotpDisableRequest = { password: disableForm.password };
    await $fetch('/api/user/2fa/disable', {
      method: 'POST',
      body: payload,
    });

    totpStateOverride.value = false;
    toast.add({
      title: t('account.security.twoFactor.twoFactorDisabled'),
      description: t('account.security.twoFactor.authenticatorRemoved'),
      color: 'warning',
    });
    disableForm.password = '';
    clearSetupState();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t('account.security.twoFactor.unableToDisable');
    twoFactorError.value = message;
    toast.add({
      title: t('account.security.twoFactor.disableFailed'),
      description: message,
      color: 'error',
    });
  } finally {
    disableSubmitting.value = false;
  }
}
</script>

<template>
  <div>
    <div>
      <div class="space-y-6">
        <UCard :ui="{ body: 'space-y-4' }">
          <div class="space-y-1 pb-2">
            <p class="text-sm font-semibold">{{ t('account.security.password.title') }}</p>
            <p class="text-xs text-muted-foreground">
              {{ t('account.security.password.description') }}
            </p>
          </div>

          <UAlert
            v-if="passwordErrorMessage"
            icon="i-lucide-alert-triangle"
            color="error"
            :title="passwordErrorMessage"
          />

          <UForm
            :schema="passwordSchema"
            :state="passwordForm"
            class="space-y-4"
            :disabled="isSavingPassword"
            @submit="handlePasswordSubmit"
          >
            <input
              type="text"
              name="username"
              autocomplete="username"
              :value="usernameValue"
              tabindex="-1"
              aria-hidden="true"
              class="sr-only"
              readonly
            />
            <UFormField
              :label="t('account.security.password.currentPassword')"
              name="currentPassword"
              required
            >
              <UInput
                v-model="passwordForm.currentPassword"
                type="password"
                autocomplete="current-password"
                icon="i-lucide-lock"
                :placeholder="t('account.security.password.enterCurrentPassword')"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('account.security.password.newPassword')"
              name="newPassword"
              required
            >
              <UInput
                v-model="passwordForm.newPassword"
                type="password"
                autocomplete="new-password"
                icon="i-lucide-key"
                :placeholder="t('account.security.password.enterNewPassword')"
                class="w-full"
              />
              <template #help>
                {{ passwordStrengthHint }}
              </template>
            </UFormField>
            <UFormField
              :label="t('account.security.password.confirmPassword')"
              name="confirmPassword"
              required
            >
              <UInput
                v-model="passwordForm.confirmPassword"
                type="password"
                autocomplete="new-password"
                icon="i-lucide-shield-check"
                :placeholder="t('account.security.password.confirmNewPassword')"
                class="w-full"
              />
            </UFormField>
            <div class="flex items-center gap-2">
              <UButton
                type="submit"
                color="primary"
                variant="subtle"
                icon="i-lucide-save"
                :loading="isSavingPassword"
                :disabled="isSavingPassword || !passwordIsValid"
              >
                {{ t('account.security.password.updatePassword') }}
              </UButton>
            </div>
          </UForm>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <div class="flex flex-col gap-2 pb-2 md:flex-row md:items-center md:justify-between">
            <div class="space-y-1">
              <p class="text-sm font-semibold">{{ t('account.security.twoFactor.title') }}</p>
              <p class="text-xs text-muted-foreground">
                {{ t('account.security.twoFactor.description') }}
              </p>
            </div>
            <UBadge :color="totpEnabled ? 'success' : 'warning'" variant="subtle">
              {{
                totpEnabled
                  ? t('account.security.twoFactor.enabled')
                  : t('account.security.twoFactor.disabled')
              }}
            </UBadge>
          </div>

          <UAlert v-if="twoFactorError" icon="i-lucide-alert-triangle" color="error">
            <template #description>{{ twoFactorError }}</template>
          </UAlert>

          <div v-if="isAuthLoading" class="space-y-2 text-sm text-muted-foreground">
            <USkeleton class="h-32 rounded-md" />
            <USkeleton class="h-10 rounded-md" />
          </div>

          <template v-else>
            <form
              v-if="!totpEnabled && !totpSetup"
              class="space-y-4"
              @submit.prevent="beginTotpSetup"
            >
              <p class="text-sm text-muted-foreground">
                {{ t('account.security.twoFactor.enterPasswordToEnable') }}
              </p>
              <input
                type="text"
                name="username"
                autocomplete="username"
                :value="usernameValue"
                tabindex="-1"
                aria-hidden="true"
                class="sr-only"
                readonly
              />
              <UFormField
                :label="t('account.security.twoFactor.passwordConfirmation')"
                name="enablePassword"
                required
              >
                <UInput
                  v-model="enableForm.password"
                  type="password"
                  :placeholder="t('account.security.twoFactor.enterPassword')"
                  icon="i-lucide-lock"
                  class="w-full"
                  :disabled="enableSubmitting"
                />
                <template #help>
                  {{ t('account.security.twoFactor.confirmPasswordToStart') }}
                </template>
              </UFormField>
              <UFormField
                :label="t('account.security.twoFactor.authenticatorIssuerOptional')"
                name="issuer"
              >
                <UInput
                  v-model="enableForm.issuer"
                  :placeholder="t('account.security.twoFactor.authenticatorIssuerPlaceholder')"
                  icon="i-lucide-app-window"
                  class="w-full"
                  :disabled="enableSubmitting"
                />
              </UFormField>
              <UButton
                type="submit"
                color="primary"
                variant="subtle"
                icon="i-lucide-shield"
                :loading="enableSubmitting"
                :disabled="!enableForm.password || enableSubmitting"
              >
                {{ t('account.security.twoFactor.startSetup') }}
              </UButton>
            </form>

            <div v-else-if="totpSetup" class="grid gap-4 md:grid-cols-[160px,1fr]">
              <div class="flex flex-col items-center gap-3 rounded-md border border-default p-4">
                <ClientOnly>
                  <Qrcode
                    v-if="totpSetup.uri"
                    :value="totpSetup.uri"
                    :width="120"
                    :height="120"
                    :margin="1"
                    class="rounded-md"
                  />
                </ClientOnly>
                <p class="text-xs text-muted-foreground text-center">
                  {{ t('account.security.twoFactor.scanQROrUseSecret') }}
                </p>
                <code class="break-all rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {{ totpSetup.secret }}
                </code>
              </div>

              <div class="space-y-3">
                <UFormField
                  :label="t('account.security.twoFactor.authenticatorCode')"
                  name="verificationCode"
                  required
                >
                  <UPinInput
                    :key="verificationCode"
                    :default-value="verificationCode.split('').map(Number)"
                    type="number"
                    :length="6"
                    otp
                    :disabled="verifyingToken"
                    placeholder="○"
                    @complete="verificationCode = $event.join('')"
                  />
                  <template #help>
                    {{ t('account.security.twoFactor.enterCodeFromAuthenticator') }}
                  </template>
                </UFormField>
                <UButton
                  color="primary"
                  variant="subtle"
                  icon="i-lucide-check-circle"
                  :loading="verifyingToken"
                  :disabled="verifyingToken || verificationCode.length < 6"
                  @click="verifyTotp"
                >
                  {{ t('account.security.twoFactor.verifyAndEnable') }}
                </UButton>
                <UCheckbox
                  v-model="trustDevice"
                  :label="t('account.security.twoFactor.trustDevice30Days')"
                  :disabled="verifyingToken"
                />
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {{ t('account.security.twoFactor.recoveryTokens') }}
                  </h3>
                  <div class="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <code
                      v-for="token in totpSetup.recoveryTokens"
                      :key="token"
                      class="rounded bg-muted px-2 py-1"
                    >
                      {{ token }}
                    </code>
                  </div>
                  <p class="mt-2 text-[11px] text-muted-foreground">
                    {{ t('account.security.twoFactor.saveCodesSecurely') }}
                  </p>
                </div>
              </div>
            </div>

            <form v-else class="space-y-3" @submit.prevent="disableTotp">
              <p class="text-sm text-muted-foreground">
                {{ t('account.security.twoFactor.twoFactorActive') }}
              </p>
              <input
                type="text"
                name="username"
                autocomplete="username"
                :value="usernameValue"
                tabindex="-1"
                aria-hidden="true"
                class="sr-only"
                readonly
              />
              <UFormField
                :label="t('account.security.twoFactor.passwordConfirmation')"
                name="disablePassword"
                required
              >
                <UInput
                  v-model="disableForm.password"
                  type="password"
                  :placeholder="t('account.security.twoFactor.enterPassword')"
                  icon="i-lucide-lock"
                  class="w-full"
                  :disabled="disableSubmitting"
                />
                <template #help>
                  {{ t('account.security.twoFactor.confirmPasswordToDisable') }}
                </template>
              </UFormField>
              <UButton
                type="submit"
                color="error"
                variant="subtle"
                icon="i-lucide-shield-off"
                :loading="disableSubmitting"
                :disabled="!disableForm.password"
              >
                {{ t('account.security.twoFactor.disableTwoFactor') }}
              </UButton>
            </form>
          </template>
        </UCard>
      </div>
    </div>
  </div>
</template>
