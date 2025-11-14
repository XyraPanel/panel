<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { AccountProfileResponse, SanitizedUser } from '#shared/types/auth'

definePageMeta({
  auth: true,
})

const profile = ref<SanitizedUser | null>(null)
const savingProfile = ref(false)
const profileError = ref<string | null>(null)

const toast = useToast()
const { status } = useAuth()

const {
  data: profileResponse,
  pending: profilePending,
  error: profileFetchError,
  execute: fetchProfile,
} = useLazyFetch<AccountProfileResponse>('/api/account/profile', {
  server: false,
  immediate: false,
  cache: 'no-cache',
  retry: 0,
})

const isSaving = computed(() => savingProfile.value)
const isLoading = computed(() => profilePending.value)
const errorMessage = computed(() => profileError.value)

const profileForm = reactive({
  username: '',
  email: '',
})

const hasChanges = computed(() => (
  profileForm.username !== profile.value?.username
  || profileForm.email !== profile.value?.email
))

watch(profileResponse, (response) => {
  if (!response?.data)
    return

  profile.value = response.data
  profileForm.username = response.data.username
  profileForm.email = response.data.email
})

watch(profileFetchError, (err) => {
  if (!err) {
    profileError.value = null
    return
  }

  const message = err instanceof Error ? err.message : 'Unable to load profile details.'
  profileError.value = message
})

watch(status, (value, previous) => {
  if (value === 'authenticated') {
    fetchProfile()
    return
  }

  if (value === 'unauthenticated' && previous === 'authenticated') {
    profile.value = null
    profileError.value = 'You need to sign in to view profile details.'
  }
}, { immediate: true })

async function handleSubmit() {
  if (isSaving.value || !hasChanges.value) {
    return
  }

  savingProfile.value = true
  profileError.value = null
  try {
    const response = await $fetch<AccountProfileResponse>('/api/account/profile', {
      method: 'PUT',
      body: {
        username: profileForm.username,
        email: profileForm.email,
      },
    })
    profile.value = response.data
    toast.add({ title: 'Profile updated', color: 'success' })
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : 'Unable to update profile information.'
    toast.add({
      title: 'Failed to update profile',
      description: profileError.value || 'An error occurred',
      color: 'error',
    })
  } finally {
    savingProfile.value = false
  }
}

</script>

<template>
  <UPage>
    <UPageHeader
      title="Profile"
      description="Manage your account information."
    />

    <UPageBody>
      <UCard :ui="{ body: 'space-y-4' }">
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Profile details</h2>
          <p class="text-sm text-muted-foreground">Keep your account information up to date.</p>
        </div>
      </template>

      <div v-if="isLoading" class="space-y-3">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-10 w-44" />
      </div>
      <template v-else>
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-alert-triangle" :title="errorMessage" />

        <UForm :state="profileForm" class="grid gap-4 md:grid-cols-2" @submit.prevent="handleSubmit">
          <UFormField label="Username" name="username" required>
            <UInput v-model="profileForm.username" placeholder="Username" class="w-full" />
          </UFormField>

          <UFormField label="Email" name="email" required>
            <UInput v-model="profileForm.email" type="email" placeholder="name@example.com" class="w-full" />
          </UFormField>

          <div class="md:col-span-2">
            <UButton type="submit" color="primary" :loading="isSaving" :disabled="!hasChanges">
              Save changes
            </UButton>
          </div>
        </UForm>
      </template>
    </UCard>
    </UPageBody>
  </UPage>
</template>
