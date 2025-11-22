<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { FormSubmitEvent } from '@nuxt/ui'
import { accountProfileFormSchema, type AccountProfileFormInput } from '#shared/schema/account'
import type { AccountProfileResponse, SanitizedUser } from '#shared/types/auth'

definePageMeta({
  auth: true,
})

const toast = useToast()
const authStore = useAuthStore()
const { status } = storeToRefs(authStore)

const {
  data: profileResponse,
  pending: profilePending,
  error: profileError,
  refresh: refreshProfile,
} = await useAsyncData<AccountProfileResponse>('account-profile', () => $fetch('/api/account/profile', {
  method: 'GET',
  cache: 'no-cache',
}), {
  server: false,
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

  return 'Unable to load profile details.'
})

const showSkeleton = computed(() => profilePending.value && !profile.value)
const disableSubmit = computed(() => !hasChanges.value || isSaving.value)

watch(() => status.value, (value, previous) => {
  if (value === 'authenticated') {
    transientError.value = null
    refreshProfile().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to load profile details.'
      transientError.value = message
    })
  }
  else if (value === 'unauthenticated' && previous === 'authenticated') {
    profileResponse.value = undefined
    transientError.value = 'You need to sign in to view profile details.'
    Object.assign(form, createFormState(null))
  }
}, { immediate: true })

async function handleSubmit(event: FormSubmitEvent<ProfileFormSchema>) {
  if (isSaving.value || !profile.value)
    return

  if (!hasChanges.value) {
    toast.add({
      title: 'No changes detected',
      description: 'Update your profile details before saving.',
      color: 'neutral',
    })
    return
  }

  isSaving.value = true
  transientError.value = null

  try {
    const payload = event.data

    const updated = await $fetch<AccountProfileResponse>('/api/account/profile', {
      method: 'PUT',
      body: payload,
    })

    profileResponse.value = updated
    Object.assign(form, createFormState(updated.data))

    await authStore.syncSession({ force: true })
    await refreshProfile()

    toast.add({
      title: 'Profile updated',
      description: 'Your account information is up to date.',
      color: 'success',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile information.'
    transientError.value = message

    toast.add({
      title: 'Failed to update profile',
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
        title="Profile"
        description="Manage your account information."
      />
    </UContainer>

    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <div>
              <h2 class="text-lg font-semibold">Profile details</h2>
              <p class="text-sm text-muted-foreground">Keep your account information up to date.</p>
            </div>
          </template>

          <div v-if="showSkeleton" class="space-y-3">
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-44" />
          </div>
          <template v-else>
            <UAlert v-if="loadError" color="error" icon="i-lucide-alert-triangle">
              <template #title>Profile unavailable</template>
              <template #description>{{ loadError }}</template>
            </UAlert>

            <UForm
              :schema="schema"
              :state="form"
              class="grid gap-4 md:grid-cols-2"
              :disabled="isSaving"
              @submit="handleSubmit"
            >
              <UFormField label="Username" name="username" required>
                <UInput v-model="form.username" placeholder="Username" class="w-full" />
              </UFormField>

              <UFormField label="Email" name="email" required>
                <UInput v-model="form.email" type="email" placeholder="name@example.com" class="w-full" />
              </UFormField>

              <div class="md:col-span-2">
                <UButton type="submit" variant="subtle" color="primary" :loading="isSaving" :disabled="disableSubmit">
                  Save changes
                </UButton>
              </div>
            </UForm>
          </template>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>

