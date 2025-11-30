<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import type { FormSubmitEvent } from '@nuxt/ui'
import { accountProfileFormSchema, type AccountProfileFormInput } from '#shared/schema/account'
import type { AccountProfileResponse, SanitizedUser } from '#shared/types/auth'

definePageMeta({
  auth: true,
})

const { t } = useI18n()
const toast = useToast()
const authStore = useAuthStore()
const { status } = storeToRefs(authStore)

const {
  data: profileResponse,
  pending: profilePending,
  error: profileError,
  refresh: refreshProfile,
} = await useFetch<AccountProfileResponse>('/api/account/profile', {
  key: 'account-profile',
  immediate: false,
})

const profile = computed<SanitizedUser | null>(() => profileResponse.value?.data ?? null)

const transientError = ref<string | null>(null)
const isSaving = ref(false)

const schema = accountProfileFormSchema

type ProfileFormSchema = AccountProfileFormInput

function createFormState(user: SanitizedUser | null): ProfileFormSchema {
  return {
    username: user?.username ?? '',
    email: user?.email ?? '',
  }
}

const form = reactive<ProfileFormSchema>(createFormState(profile.value))

watch(profile, (value) => {
  Object.assign(form, createFormState(value))
}, { immediate: true })

const normalizedForm = computed(() => ({
  username: form.username.trim(),
  email: form.email.trim(),
}))

const hasChanges = computed(() => {
  const current = profile.value
  if (!current)
    return false

  return normalizedForm.value.username !== current.username
    || normalizedForm.value.email !== current.email
})

const loadError = computed(() => {
  if (transientError.value)
    return transientError.value

  const err = profileError.value
  if (!err)
    return null

  if (err instanceof Error)
    return err.message

  return t('account.profile.unableToLoadProfile')
})

const showSkeleton = computed(() => profilePending.value && !profile.value)
const disableSubmit = computed(() => !hasChanges.value || isSaving.value)

watch(() => status.value, (value, previous) => {
  if (value === 'authenticated') {
      transientError.value = null
      refreshProfile().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : t('account.profile.unableToLoadProfile')
      transientError.value = message
    })
  }
  else if (value === 'unauthenticated' && previous === 'authenticated') {
    profileResponse.value = undefined
    transientError.value = t('auth.signInToContinue')
    Object.assign(form, createFormState(null))
  }
}, { immediate: true })

async function handleSubmit(event: FormSubmitEvent<ProfileFormSchema>) {
  if (isSaving.value || !profile.value)
    return

  if (!hasChanges.value) {
    toast.add({
      title: t('account.profile.noChangesDetected'),
      description: t('account.profile.updateBeforeSaving'),
      color: 'neutral',
    })
    return
  }

  isSaving.value = true
  transientError.value = null

  try {
    const payload = event.data

    await $fetch<AccountProfileResponse>('/api/account/profile', {
      method: 'PUT',
      body: payload,
    })

    await authStore.syncSession({ force: true })
    await nextTick()
    await refreshProfile()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    if (profileResponse.value) {
      Object.assign(form, createFormState(profileResponse.value.data))
    }

    toast.add({
      title: t('account.profile.profileUpdated'),
      description: t('account.profile.accountInfoUpdated'),
      color: 'success',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : t('account.profile.unableToUpdateProfile')
    transientError.value = message

    toast.add({
      title: t('account.profile.failedToUpdateProfile'),
      description: message,
      color: 'error',
    })
  }
  finally {
    isSaving.value = false
  }
}

</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader
        :title="t('account.profile.title')"
        :description="t('account.profile.description')"
      />
    </UContainer>

    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div>
              <h2 class="text-lg font-semibold">{{ t('account.profile.profileDetails') }}</h2>
              <p class="text-sm text-muted-foreground">{{ t('account.profile.keepAccountUpdated') }}</p>
            </div>
          </template>

          <div v-if="showSkeleton" class="space-y-3">
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-44" />
          </div>
          <template v-else>
            <UAlert v-if="loadError" color="error" icon="i-lucide-alert-triangle">
              <template #title>{{ t('account.profile.profileUnavailable') }}</template>
              <template #description>{{ loadError }}</template>
            </UAlert>

            <UForm
              :schema="schema"
              :state="form"
              class="grid gap-4 md:grid-cols-2"
              :disabled="isSaving"
              @submit="handleSubmit"
            >
              <UFormField :label="t('account.profile.username')" name="username" required>
                <UInput v-model="form.username" :placeholder="t('account.profile.enterUsername')" class="w-full" />
              </UFormField>

              <UFormField :label="t('account.profile.email')" name="email" required>
                <UInput v-model="form.email" type="email" :placeholder="t('account.profile.enterEmail')" class="w-full" />
              </UFormField>

              <div class="md:col-span-2">
                <UButton type="submit" variant="subtle" color="primary" :loading="isSaving" :disabled="disableSubmit">
                  {{ t('account.profile.saveChanges') }}
                </UButton>
              </div>
            </UForm>
          </template>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>

