<script setup lang="ts">
import * as z from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'

const { t } = useI18n()
const authStore = useAuthStore()
const { status, user } = storeToRefs(authStore)
const runtimeConfig = useRuntimeConfig()
const appName = computed(() => runtimeConfig.public.appName || 'XyraPanel')
const route = useRoute()
const toast = useToast()

const turnstileSiteKey = computed(() => runtimeConfig.public.turnstile?.siteKey || '')
const hasTurnstile = computed(() => !!turnstileSiteKey.value && turnstileSiteKey.value.length > 0)

definePageMeta({
  layout: 'auth',
  auth: false,
})

const requiresToken = ref(false)
const turnstileToken = ref<string | undefined>(undefined)
const turnstileRef = ref<{ reset: () => void } | null>(null)

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
]

const tokenField: AuthFormField = {
  name: 'token',
  type: 'text',
  label: t('auth.authenticatorCode'),
  placeholder: t('auth.enterAuthenticatorCode'),
  icon: 'i-lucide-smartphone',
  help: t('auth.enterCodeFromAuthenticator'),
  autocomplete: 'one-time-code',
}

const fields = computed<AuthFormField[]>(() =>
  requiresToken.value ? [...baseFields, tokenField] : baseFields,
)

const tokenSchema = z.string().trim().max(64, t('auth.authenticatorCodesShort'))

const schema = z.object({
  identity: z.string().trim().min(1, t('auth.enterUsernameOrEmail')),
  password: z.string().trim().min(1, t('auth.enterPassword')),
  token: tokenSchema.optional().transform(value => (value && value.length > 0 ? value : undefined)),
})

type Schema = z.output<typeof schema>

const loading = ref(false)
const submitProps = computed(() => ({
  label: t('auth.signIn'),
  icon: 'i-lucide-log-in',
  block: true,
  variant: 'subtle' as const,
  color: 'primary' as const,
  loading: loading.value,
}))

const redirectPath = computed(() => {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/'))
    return redirect
  return '/'
})

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const { identity, password, token } = payload.data
    const submittedToken = token ?? ''

    if (requiresToken.value && !token) {
      throw new Error(t('auth.twoFactorTokenRequired'))
    }

    if (hasTurnstile.value && !turnstileToken.value) {
      toast.add({
        color: 'error',
        title: t('auth.verificationRequired'),
        description: t('auth.completeSecurityVerification'),
      })
      return
    }

    const result = await authStore.login(identity, password, token, turnstileToken.value || undefined)
    
    if (result?.error) {
      turnstileRef.value?.reset()
      turnstileToken.value = undefined
    }

    if (result?.error) {
      const errorMessage = result.error.toLowerCase()
      const indicatesTwoFactor = errorMessage.includes('two-factor') || errorMessage.includes('recovery token') || errorMessage.includes('2fa')
      const missingToken = indicatesTwoFactor && submittedToken.length === 0

      if (indicatesTwoFactor)
        requiresToken.value = true

      if (missingToken) {
        toast.add({
          color: 'info',
          title: t('auth.twoFactorRequired'),
          description: t('auth.enterAuthenticatorCodeToFinish'),
        })
        return
      }

      throw new Error(result.error)
    }

    await authStore.syncSession({ force: true })
    if (!user.value) {
      throw new Error(t('auth.invalidCredentials'))
    }

    toast.add({
      color: 'success',
      title: t('auth.welcomeBack'),
      description: t('auth.signedIn'),
    })

    await until(status).toMatch((v) => v === 'authenticated')

    await navigateTo(redirectPath.value)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : t('auth.unableToSignIn')
    const submittedToken = payload.data.token ?? ''
    if (typeof message === 'string') {
      const lowered = message.toLowerCase()
      const indicatesTwoFactor = lowered.includes('two-factor') || lowered.includes('recovery token')
      const missingToken = indicatesTwoFactor && submittedToken.length === 0

      if (indicatesTwoFactor)
        requiresToken.value = true

      if (missingToken) {
        toast.add({
          color: 'info',
          title: t('auth.twoFactorRequired'),
          description: t('auth.enterAuthenticatorCodeToFinish'),
        })
        return
      }
    }
    toast.add({
      color: 'error',
      title: t('auth.signInFailed'),
      description: message,
    })
    turnstileRef.value?.reset()
    turnstileToken.value = undefined
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAuthForm :schema="schema" :fields="fields" :submit="submitProps" @submit="onSubmit as any">
      <template #title>
        <h1 class="text-3xl font-semibold text-white">
          {{ appName }}
        </h1>
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
</template>
