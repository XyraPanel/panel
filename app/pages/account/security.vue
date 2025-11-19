<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { FormSubmitEvent } from '@nuxt/ui'
import { accountPasswordFormSchema, type AccountPasswordFormInput } from '#shared/schema/account'
import type { TotpSetupResponse, TotpVerifyRequest, TotpDisableRequest } from '#shared/types/2fa'

definePageMeta({
  auth: true,
})

const toast = useToast()

const authStore = useAuthStore()
const { status, user } = storeToRefs(authStore)

const passwordError = ref<string | null>(null)
const isSavingPassword = ref(false)

const passwordSchema = accountPasswordFormSchema

type PasswordFormSchema = AccountPasswordFormInput

const passwordForm = reactive<PasswordFormSchema>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const passwordStrengthHint = computed(() => {
  if (!passwordForm.newPassword)
    return 'Use at least 12 characters with a mix of letters, numbers, and symbols.'

  if (passwordForm.newPassword.length < 12)
    return 'Password must be at least 12 characters.'

  return 'Looks good! Make sure it is unique to XyraPanel.'
})

const passwordIsValid = computed(() => passwordSchema.safeParse(passwordForm).success)
const passwordErrorMessage = computed(() => passwordError.value)

async function handlePasswordSubmit(event: FormSubmitEvent<PasswordFormSchema>) {
  if (isSavingPassword.value || !passwordIsValid.value)
    return

  isSavingPassword.value = true
  passwordError.value = null

  try {
    const payload = event.data

    const response = await $fetch<{ success: boolean, revokedSessions: number }>('/api/account/password', {
      method: 'PUT',
      body: payload,
    })

    toast.add({
      title: 'Password updated',
      description: response.revokedSessions > 0
        ? `Signed out ${response.revokedSessions} other session${response.revokedSessions === 1 ? '' : 's'}.`
        : 'Your password has been changed.',
      color: 'success',
    })

    Object.assign(passwordForm, {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update password.'
    passwordError.value = message

    toast.add({
      title: 'Failed to update password',
      description: message,
      color: 'error',
    })
  }
  finally {
    isSavingPassword.value = false
  }
}

const twoFactorError = ref<string | null>(null)
const totpSetup = ref<TotpSetupResponse | null>(null)
const verificationCode = ref('')
const verifyingToken = ref(false)
const disableForm = reactive({ password: '' })
const disableSubmitting = ref(false)
const totpStateOverride = ref<boolean | null>(null)

const isAuthLoading = computed(() => status.value === 'loading')
const totpEnabled = computed(() => {
  if (totpStateOverride.value !== null)
    return totpStateOverride.value

  const sessionUser = user.value
  return Boolean(sessionUser && 'useTotp' in sessionUser && (sessionUser as { useTotp?: boolean }).useTotp)
})

watch(totpEnabled, (enabled) => {
  if (enabled)
    clearSetupState()
})

watch(user, () => {
  totpStateOverride.value = null
})

function clearSetupState() {
  totpSetup.value = null
  verificationCode.value = ''
  twoFactorError.value = null
}

async function beginTotpSetup() {
  if (totpEnabled.value) {
    toast.add({
      title: 'Two-factor already enabled',
      description: 'You need to disable it first if you want to reconfigure your authenticator.',
    })
    return
  }

  twoFactorError.value = null
  totpSetup.value = null
  verificationCode.value = ''

  try {
    const setup = await $fetch<TotpSetupResponse>('/api/user/2fa/enable', { method: 'POST' })
    totpSetup.value = setup
    toast.add({
      title: 'TOTP setup started',
      description: 'Scan the QR code with your authenticator app and enter the 6-digit token to confirm.',
      color: 'primary',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start two-factor setup.'
    twoFactorError.value = message
    toast.add({
      title: 'Unable to start setup',
      description: message,
      color: 'error',
    })
  }
}

async function verifyTotp() {
  if (!totpSetup.value) {
    twoFactorError.value = 'Start the setup process before verifying.'
    return
  }

  if (verificationCode.value.trim().length < 6) {
    twoFactorError.value = 'Enter the 6-digit code from your authenticator app.'
    return
  }

  verifyingToken.value = true
  twoFactorError.value = null

  try {
    const payload: TotpVerifyRequest = { token: verificationCode.value.trim() }
    await $fetch('/api/user/2fa/verify', {
      method: 'POST',
      body: payload,
    })

    totpSetup.value = null
    totpStateOverride.value = true
    await authStore.syncSession()
    toast.add({
      title: 'Two-factor enabled',
      description: 'Keep your recovery tokens in a safe location.',
      color: 'success',
    })
    clearSetupState()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid verification code.'
    twoFactorError.value = message
    toast.add({
      title: 'Verification failed',
      description: message,
      color: 'error',
    })
  }
  finally {
    verifyingToken.value = false
  }
}

async function disableTotp() {
  if (!totpEnabled.value)
    return

  if (!disableForm.password) {
    twoFactorError.value = 'Enter your password to disable two-factor authentication.'
    return
  }

  disableSubmitting.value = true
  twoFactorError.value = null

  try {
    const payload: TotpDisableRequest = { password: disableForm.password }
    await $fetch('/api/user/2fa/disable', {
      method: 'POST',
      body: payload,
    })

    await authStore.syncSession()
    totpStateOverride.value = false
    toast.add({
      title: 'Two-factor disabled',
      description: 'Authenticator requirements have been removed.',
      color: 'warning',
    })
    disableForm.password = ''
    clearSetupState()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to disable two-factor authentication.'
    twoFactorError.value = message
    toast.add({
      title: 'Disable failed',
      description: message,
      color: 'error',
    })
  }
  finally {
    disableSubmitting.value = false
  }
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Security"
      description="Harden your account with strong passwords and multifactor authentication."
    />

    <UPageBody>
      <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div class="space-y-6">
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="text-lg font-semibold">Password</h2>
          </template>

          <UAlert v-if="passwordErrorMessage" icon="i-lucide-alert-triangle" color="error" :title="passwordErrorMessage" />

          <UForm
            :schema="passwordSchema"
            :state="passwordForm"
            class="space-y-4"
            :disabled="isSavingPassword"
            @submit="handlePasswordSubmit"
          >
            <UFormField label="Current password" name="currentPassword" required>
              <UInput
                v-model="passwordForm.currentPassword"
                type="password"
                autocomplete="current-password"
                icon="i-lucide-lock"
                placeholder="Enter current password"
                class="w-full"
              />
            </UFormField>
            <UFormField label="New password" name="newPassword" required>
              <UInput
                v-model="passwordForm.newPassword"
                type="password"
                autocomplete="new-password"
                icon="i-lucide-key"
                placeholder="Enter new password"
                class="w-full"
              />
              <template #help>
                {{ passwordStrengthHint }}
              </template>
            </UFormField>
            <UFormField label="Confirm password" name="confirmPassword" required>
              <UInput
                v-model="passwordForm.confirmPassword"
                type="password"
                autocomplete="new-password"
                icon="i-lucide-shield-check"
                placeholder="Confirm new password"
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
                Update password
              </UButton>
            </div>
          </UForm>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold">Two-factor authentication</h2>
                <p class="text-xs text-muted-foreground">
                  Protect your account with TOTP-compatible authenticator apps (Google Authenticator, 1Password, etc.).
                </p>
              </div>
              <UBadge :color="totpEnabled ? 'success' : 'warning'" variant="subtle">
                {{ totpEnabled ? 'Enabled' : 'Disabled' }}
              </UBadge>
            </div>
          </template>

          <UAlert v-if="twoFactorError" icon="i-lucide-alert-triangle" color="error">
            <template #description>{{ twoFactorError }}</template>
          </UAlert>

          <div v-if="isAuthLoading" class="space-y-2 text-sm text-muted-foreground">
            <USkeleton class="h-32 rounded-md" />
            <USkeleton class="h-10 rounded-md" />
          </div>

          <template v-else>
            <div v-if="!totpEnabled && !totpSetup" class="space-y-4">
              <p class="text-sm text-muted-foreground">
                Click the button below to generate a TOTP secret and recovery codes. You’ll scan a QR code and confirm with a 6-digit token.
              </p>
              <UButton color="primary" variant="subtle" icon="i-lucide-shield" @click="beginTotpSetup">
                Start setup
              </UButton>
            </div>

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
                  Scan this QR code or use the secret below.
                </p>
                <code class="break-all rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {{ totpSetup.secret }}
                </code>
              </div>

              <div class="space-y-3">
                <UFormField label="Authenticator code" name="verificationCode" required>
                  <UInput
                    v-model="verificationCode"
                    placeholder="Enter 6-digit code"
                    inputmode="numeric"
                    maxlength="6"
                    icon="i-lucide-smartphone"
                    class="w-full"
                    :disabled="verifyingToken"
                  />
                  <template #help>
                    Enter the code from your authenticator app
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
                  Verify & Enable
                </UButton>
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recovery tokens</h3>
                  <div class="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <code v-for="token in totpSetup.recoveryTokens" :key="token"
                      class="rounded bg-muted px-2 py-1">
                      {{ token }}
                    </code>
                  </div>
                  <p class="mt-2 text-[11px] text-muted-foreground">Save these codes in a secure password manager. Each token can be used once.</p>
                </div>
              </div>
            </div>

            <div v-else>
              <p class="text-sm text-muted-foreground">
                Two-factor authentication is active. You’ll be prompted for a 6-digit code (or recovery token) on new logins.
              </p>

              <div class="space-y-3">
                <UFormField label="Password confirmation" name="disablePassword" required>
                  <UInput
                    v-model="disableForm.password"
                    type="password"
                    placeholder="Enter your password"
                    icon="i-lucide-lock"
                    class="w-full"
                    :disabled="disableSubmitting"
                  />
                  <template #help>
                    Confirm your password to disable two-factor authentication
                  </template>
                </UFormField>
                <UButton
                  color="error"
                  variant="subtle"
                  icon="i-lucide-shield-off"
                  :loading="disableSubmitting"
                  :disabled="!disableForm.password"
                  @click="disableTotp"
                >
                  Disable Two-Factor
                </UButton>
              </div>
            </div>
          </template>
        </UCard>
      </div>
      </div>
    </UPageBody>
  </UPage>
</template>
