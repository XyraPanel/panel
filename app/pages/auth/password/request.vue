<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { passwordRequestSchema } from '#shared/schema/account'
import type { PasswordRequestBody } from '#shared/types/account'

definePageMeta({
  layout: 'auth',
  auth: false,
})

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const runtimeConfig = useRuntimeConfig()

const turnstileSiteKey = computed(() => runtimeConfig.public.turnstile?.siteKey || '')
const hasTurnstile = computed(() => !!turnstileSiteKey.value && turnstileSiteKey.value.length > 0)
const turnstileToken = ref<string | undefined>(undefined)
const turnstileRef = ref<{ reset: () => void } | null>(null)

const fields: AuthFormField[] = [
  {
    name: 'identity',
    type: 'text',
    label: t('auth.usernameOrEmail'),
    placeholder: t('auth.enterEmailOrUsername'),
    icon: 'i-lucide-mail',
    required: true,
    autocomplete: 'username',
  },
]

const schema = passwordRequestSchema

const loading = ref(false)

const submitProps = computed(() => ({
  label: t('auth.sendResetLink'),
  icon: 'i-lucide-send',
  block: true,
  variant: 'subtle' as const,
  color: 'primary' as const,
  loading: loading.value,
}))

async function onSubmit(payload: FormSubmitEvent<PasswordRequestBody>) {
  loading.value = true
  try {
    if (hasTurnstile.value && !turnstileToken.value) {
      toast.add({
        color: 'error',
        title: t('auth.verificationRequired'),
        description: t('auth.completeSecurityVerification'),
      })
      return
    }

    const identity = String(payload.data.identity).trim()
    const body: PasswordRequestBody = { identity }
    
    const fetchOptions: { headers?: Record<string, string> } = {}
    if (hasTurnstile.value && turnstileToken.value) {
      fetchOptions.headers = { 'x-captcha-response': turnstileToken.value }
    }

    const response = await fetch('/api/auth/password/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
      },
      body: JSON.stringify(body),
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: t('auth.requestFailed') }))
      throw new Error(error.message || t('auth.requestFailed'))
    }
    
    await response.json() as { success: boolean }

    toast.add({
      title: t('auth.checkYourInbox'),
      description: t('auth.ifAccountExists'),
      color: 'success',
    })

    router.push('/auth/login')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : t('auth.unableToProcessRequest')
    toast.add({
      title: t('auth.requestFailed'),
      description: message,
      color: 'error',
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
  <UAuthForm
    :schema="schema"
    :fields="fields"
    :title="t('auth.resetYourPassword')"
    :description="t('auth.enterEmailOrUsername')"
    icon="i-lucide-key-round"
    :submit="submitProps"
    @submit="onSubmit as any"
  >
    <template #footer>
      <div class="space-y-4">
        <div v-if="hasTurnstile" class="flex flex-col items-center gap-2">
          <NuxtTurnstile
            ref="turnstileRef"
            :model-value="turnstileToken"
            :options="{
              theme: 'dark',
              size: 'normal',
            }"
            @update:model-value="(value: string | undefined) => { turnstileToken = value }"
          />
        </div>
        <NuxtLink to="/auth/login" class="text-primary font-medium block text-center">
          {{ t('auth.backToSignIn') }}
        </NuxtLink>
      </div>
    </template>
  </UAuthForm>
</template>
