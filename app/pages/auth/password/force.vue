<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import type { FetchError } from 'ofetch'
import { accountForcedPasswordSchema } from '#shared/schema/account'
import type { PasswordForceBody } from '#shared/types/account'

const { t } = useI18n()
const authStore = useAuthStore()
const { status, requiresPasswordReset } = storeToRefs(authStore)
const route = useRoute()
const toast = useToast()

definePageMeta({
  layout: 'auth',
  auth: true,
})

const schema = accountForcedPasswordSchema

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
]

const loading = ref(false)
const errorMessage = ref<string | null>(null)

const submitProps = computed(() => ({
  label: t('auth.updatePassword'),
  icon: 'i-lucide-save',
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

watch(status, async (value) => {
  if (value === 'authenticated' && !requiresPasswordReset.value)
    await navigateTo(redirectPath.value)
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<PasswordForceBody>) {
  loading.value = true
  errorMessage.value = null
  try {
    const newPassword = String(event.data.newPassword)
    const confirmPassword = event.data.confirmPassword ? String(event.data.confirmPassword) : undefined
    const body: PasswordForceBody = {
      newPassword,
      confirmPassword,
    }
    await $fetch<{ success: boolean }>('/api/account/password/force', {
      method: 'PUT',
      body,
    })

    await authStore.syncSession({ force: true })

    toast.add({
      title: t('auth.passwordUpdated'),
      description: t('auth.passwordChangedSuccessfully'),
      color: 'success',
    })

    await navigateTo(redirectPath.value)
  }
  catch (error) {
    const fetchError = error as FetchError<{ message?: string }>
    const message = fetchError?.data?.message
      ?? (error instanceof Error ? error.message : t('auth.unableToUpdatePassword'))
    errorMessage.value = message
    toast.add({
      title: t('auth.passwordUpdateFailed'),
      description: message,
      color: 'error',
    })
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
    :title="t('auth.passwordResetRequired')"
    :description="t('auth.chooseNewPasswordToContinue')"
    icon="i-lucide-key-round"
    :submit="submitProps"
    @submit="onSubmit as any"
  >
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
