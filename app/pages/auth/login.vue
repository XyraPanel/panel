<script setup lang="ts">
import * as z from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

import { until } from '@vueuse/core'

const { signIn, getSession, status } = useAuth()
const route = useRoute()
const toast = useToast()

definePageMeta({
  layout: 'auth',
  auth: false,
})

const requiresToken = ref(false)

const baseFields: AuthFormField[] = [
  {
    name: 'identity',
    type: 'text',
    label: 'Username or Email',
    placeholder: 'Enter your username or email',
    icon: 'i-lucide-user',
    required: true,
    autocomplete: 'username',
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Enter your password',
    icon: 'i-lucide-lock',
    required: true,
    autocomplete: 'current-password',
  },
]

const tokenField: AuthFormField = {
  name: 'token',
  type: 'text',
  label: 'Authenticator Code',
  placeholder: 'Enter 6-digit code or recovery token',
  icon: 'i-lucide-smartphone',
  help: 'Enter the code from your authenticator app or use a recovery token',
  autocomplete: 'one-time-code',
}

const fields = computed<AuthFormField[]>(() =>
  requiresToken.value ? [...baseFields, tokenField] : baseFields,
)

const schema = z.object({
  identity: z.string().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
  token: z.string().trim().max(64, 'Authenticator codes are short.').optional(),
})

type Schema = z.output<typeof schema>

const loading = ref(false)
const submitProps = computed(() => ({
  label: 'Sign In',
  icon: 'i-lucide-log-in',
  block: true,
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
    const submittedToken = token?.trim() ?? ''

    if (requiresToken.value && (!token || token.trim().length === 0)) {
      throw new Error('Two-factor authentication token required.')
    }

    const result = await signIn('credentials', {
      redirect: false,
      identity,
      password,
      token: token && token.length > 0 ? token : undefined,
    })

    if (result?.error) {
      const errorMessage = result.error.toLowerCase()
      const indicatesTwoFactor = errorMessage.includes('two-factor') || errorMessage.includes('recovery token')
      const missingToken = indicatesTwoFactor && submittedToken.length === 0

      if (indicatesTwoFactor)
        requiresToken.value = true

      if (missingToken) {
        toast.add({
          color: 'info',
          title: 'Two-factor required',
          description: 'Enter your authenticator code to finish signing in.',
        })
        return
      }

      throw new Error(result.error)
    }

    const session = await getSession({ force: true })
    if (!session || !session.user) {
      throw new Error('Invalid credentials. Please check your details and try again.')
    }

    toast.add({
      color: 'success',
      title: 'Welcome back',
      description: 'You are signed in.',
    })

    await until(status).toMatch((v) => v === 'authenticated')

    await navigateTo(redirectPath.value)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in with those credentials.'
    const submittedToken = payload.data.token?.trim() ?? ''
    if (typeof message === 'string') {
      const lowered = message.toLowerCase()
      const indicatesTwoFactor = lowered.includes('two-factor') || lowered.includes('recovery token')
      const missingToken = indicatesTwoFactor && submittedToken.length === 0

      if (indicatesTwoFactor)
        requiresToken.value = true

      if (missingToken) {
        toast.add({
          color: 'info',
          title: 'Two-factor required',
          description: 'Enter your authenticator code to finish signing in.',
        })
        return
      }
    }
    toast.add({
      color: 'error',
      title: 'Sign in failed',
      description: message,
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAuthForm class="space-y-6" :schema="schema" :fields="fields" :submit="submitProps" @submit="onSubmit">
      <template #description>
        <p class="text-sm text-muted">
          Enter your panel credentials to continue.
        </p>
      </template>
    </UAuthForm>
  </div>
</template>
