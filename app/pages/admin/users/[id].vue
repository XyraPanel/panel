<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  AdminUserProfilePayload,
  AdminUserServerSummary,
  AdminUserApiKeySummary,
} from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'User profile',
  adminSubtitle: 'Inspect panel access, owned servers, and activity',
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const requestFetch = useRequestFetch() as <T>(input: string, options?: Parameters<typeof $fetch>[1]) => Promise<T>
const actionLoading = ref<string | null>(null)
const isActionRunning = (key: string) => actionLoading.value === key

const userId = computed(() => route.params.id as string)

const { data, pending, error, refresh } = await useFetch<AdminUserProfilePayload>(
  () => `/api/admin/users/${userId.value}`,
  {
    watch: [userId],
    immediate: true,
  },
)

async function runAction<T>(
  key: string,
  task: () => Promise<T>,
  options: { refreshAfter?: boolean; successMessage?: string } = {},
): Promise<T | undefined> {
  if (actionLoading.value) {
    return undefined
  }

  actionLoading.value = key

  try {
    const result = await task()

    if (options.refreshAfter !== false) {
      await refresh()
    }

    if (options.successMessage) {
      toast.add({
        title: 'Success',
        description: options.successMessage,
        color: 'success',
      })
    }

    return result
  }
  catch (error) {
    const description = error instanceof Error ? error.message : 'An unexpected error occurred.'
    toast.add({
      title: 'Action failed',
      description,
      color: 'error',
    })
    return undefined
  }
  finally {
    actionLoading.value = null
  }
}

watch(error, (value) => {
  if (value) {
    toast.add({
      title: 'Failed to load user profile',
      description: value.statusMessage || value.message,
      color: 'error',
    })

    if (value.statusCode === 404) {
      router.replace('/admin/users')
    }
  }
})

const profile = computed(() => data.value)
const user = computed(() => profile.value?.user)
const servers = computed<AdminUserServerSummary[]>(() => profile.value?.servers ?? [])
const apiKeys = computed<AdminUserApiKeySummary[]>(() => profile.value?.apiKeys ?? [])
const activity = computed(() => profile.value?.activity ?? [])

const activeApiKeys = computed(() => apiKeys.value.filter(key => !key.expiresAt || new Date(key.expiresAt) > new Date()))
const expiredApiKeys = computed(() => apiKeys.value.filter(key => key.expiresAt && new Date(key.expiresAt) <= new Date()))
const isSuspended = computed(() => Boolean(user.value?.suspended))
const hasTwoFactor = computed(() => Boolean(user.value?.twoFactorEnabled))
const hasVerifiedEmail = computed(() => Boolean(user.value?.emailVerified))
const requiresPasswordReset = computed(() => Boolean(user.value?.passwordResetRequired))
const hasEmail = computed(() => Boolean(user.value?.email))

const tab = ref<'overview' | 'servers' | 'api-keys' | 'activity'>('overview')
const controlsOpen = ref(false)

const tabItems = computed(() => [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
  { label: `Servers (${servers.value.length})`, value: 'servers', icon: 'i-lucide-server' },
  { label: `API keys (${apiKeys.value.length})`, value: 'api-keys', icon: 'i-lucide-key' },
  { label: `Activity (${activity.value.length})`, value: 'activity', icon: 'i-lucide-activity' },
])

function cleanMetadata(details: Record<string, unknown>) {
  return Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== '')
}

function formatDate(value: string | null | undefined) {
  if (!value)
    return 'Unknown'

  return new Date(value).toLocaleString()
}

const isLoading = computed(() => pending.value && !profile.value)

async function sendResetLink(notify = true) {
  if (!user.value)
    return

  await runAction('reset-link', async () => {
    return await requestFetch<{ success: boolean }>(
      `/api/admin/users/${userId.value}/actions/reset-password`,
      {
        method: 'POST',
        body: {
          mode: 'link',
          notify,
        },
      },
    )
  }, {
    successMessage: notify
      ? 'Password reset link generated and emailed to the user.'
      : 'Password reset link generated.',
  })
}

async function setTemporaryPassword() {
  if (!user.value)
    return

  const response = await runAction('reset-temp', async () => {
    return await requestFetch<{ success: boolean; temporaryPassword: string }>(
      `/api/admin/users/${userId.value}/actions/reset-password`,
      {
        method: 'POST',
        body: {
          mode: 'temporary',
        },
      },
    )
  })

  if (!response?.temporaryPassword)
    return

  let copied = false

  if (import.meta.client && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(response.temporaryPassword)
      copied = true
    }
    catch (error) {
      console.error('Failed to copy temporary password to clipboard', error)
    }
  }

  if (!copied && import.meta.client && typeof window !== 'undefined')
    window.prompt('Temporary password (copy before closing)', response.temporaryPassword)

  const baseMessage = 'User must update their password on next login.'
  toast.add({
    title: 'Temporary password generated',
    description: copied
      ? `Temporary password copied to clipboard. ${baseMessage}`
      : `Temporary password: ${response.temporaryPassword}\n${baseMessage}`,
    color: 'success',
  })
}

async function disableTwoFactor() {
  if (!user.value)
    return

  await runAction('disable-2fa', async () => {
    return await requestFetch<{ success: boolean }>(
      `/api/admin/users/${userId.value}/actions/disable-2fa`,
      {
        method: 'POST',
      },
    )
  }, {
    successMessage: 'Two-factor authentication disabled for this user.',
  })
}

async function markEmailVerified() {
  if (!user.value || hasVerifiedEmail.value)
    return

  await runAction('email-verify', async () => {
    return await requestFetch<{ success: boolean }>(
      `/api/admin/users/${userId.value}/actions/email-verification`,
      {
        method: 'POST',
        body: { action: 'mark-verified' },
      },
    )
  }, {
    successMessage: 'Email marked as verified.',
  })
}

async function markEmailUnverified() {
  if (!user.value || !hasVerifiedEmail.value)
    return

  await runAction('email-unverify', async () => {
    return await requestFetch<{ success: boolean }>(
      `/api/admin/users/${userId.value}/actions/email-verification`,
      {
        method: 'POST',
        body: { action: 'mark-unverified' },
      },
    )
  }, {
    successMessage: 'Email marked as unverified.',
  })
}

async function resendVerificationEmail() {
  if (!user.value)
    return

  if (!hasEmail.value) {
    toast.add({
      title: 'No email address available',
      description: 'Add an email address before resending the verification link.',
      color: 'error',
    })
    return
  }

  await runAction('email-resend', async () => {
    return await requestFetch<{ success: boolean }>(
      `/api/admin/users/${userId.value}/actions/email-verification`,
      {
        method: 'POST',
        body: { action: 'resend-link' },
      },
    )
  }, {
    refreshAfter: false,
    successMessage: 'Verification email re-sent.',
  })
}

async function toggleSuspension() {
  if (!user.value)
    return

  if (isSuspended.value) {
    if (import.meta.client && typeof window !== 'undefined' && !window.confirm('Unsuspend this user?'))
      return

    await runAction('unsuspend', async () => {
      return await requestFetch<{ success: boolean }>(
        `/api/admin/users/${userId.value}/actions/suspension`,
        {
          method: 'POST',
          body: { action: 'unsuspend' },
        },
      )
    }, {
      successMessage: 'User unsuspended.',
    })

    return
  }

  if (import.meta.client && typeof window !== 'undefined' && !window.confirm('Suspend this user? This will revoke active sessions.'))
    return

  let reason: string | undefined
  if (import.meta.client && typeof window !== 'undefined') {
    const input = window.prompt('Provide a suspension reason (optional)')?.trim()
    reason = input && input.length > 0 ? input : undefined
  }

  await runAction('suspend', async () => {
    return await requestFetch<{ success: boolean }>(
      `/api/admin/users/${userId.value}/actions/suspension`,
      {
        method: 'POST',
        body: {
          action: 'suspend',
          reason,
        },
      },
    )
  }, {
    successMessage: 'User suspended.',
  })
}

async function impersonateUser() {
  if (!user.value || isSuspended.value)
    return

  const response = await runAction('impersonate', async () => {
    return await requestFetch<{ impersonateUrl: string; expiresAt: string }>(
      `/api/admin/users/${userId.value}/actions/impersonate`,
      {
        method: 'POST',
      },
    )
  }, {
    refreshAfter: false,
  })

  if (!response?.impersonateUrl)
    return

  const impersonateUrl = response.impersonateUrl
  let copied = false

  if (import.meta.client && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(impersonateUrl)
      copied = true
    }
    catch (error) {
      console.error('Failed to copy impersonation link to clipboard', error)
    }
  }

  if (import.meta.client && typeof window !== 'undefined')
    window.open(impersonateUrl, '_blank', 'noopener')

  const expiresLabel = formatDate(response.expiresAt)
  toast.add({
    title: 'Impersonation link ready',
    description: copied
      ? `Link copied to clipboard. Expires at ${expiresLabel}.`
      : `Opened a new tab. Expires at ${expiresLabel}.`,
    color: 'success',
  })

  if (!copied && import.meta.client && typeof window !== 'undefined')
    window.prompt('Impersonation link (copy if needed)', impersonateUrl)
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold">
                <template v-if="user">
                  {{ user.name || user.username }}
                </template>
                <template v-else>
                  Loading user…
                </template>
              </h1>
              <p class="text-xs text-muted-foreground">
                Review account metadata, owned servers, and recent audit activity.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton v-if="user" icon="i-lucide-rotate-ccw" variant="outline" color="neutral"
                @click="() => refresh()">
                Refresh
              </UButton>
              <UButton
                icon="i-lucide-sliders-horizontal"
                color="warning"
                variant="subtle"
                @click="controlsOpen = true"
              >
                User controls
              </UButton>
            </div>
          </header>

          <USlideover
            v-model:open="controlsOpen"
            title="User controls"
            description="Reset passwords, toggle verification, suspension, and impersonation actions."
            :ui="{ body: 'space-y-6', footer: 'justify-end gap-2' }"
          >
          <template #body>
            <div class="flex flex-col gap-4">
              <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                <div class="space-y-2">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Password</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      icon="i-lucide-mail"
                      size="xs"
                      variant="outline"
                      color="primary"
                      :loading="isActionRunning('reset-link')"
                      @click="sendResetLink()"
                    >
                      Send reset link
                    </UButton>
                    <UButton
                      icon="i-lucide-key"
                      size="xs"
                      variant="outline"
                      color="neutral"
                      :loading="isActionRunning('reset-temp')"
                      @click="setTemporaryPassword"
                    >
                      Temporary password
                    </UButton>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    Generates a reset link or temporary password and revokes active sessions.
                  </p>
                </div>
              </UCard>

              <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                <div class="space-y-2">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Two-factor</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      icon="i-lucide-shield-off"
                      size="xs"
                      variant="outline"
                      color="neutral"
                      :disabled="!hasTwoFactor"
                      :loading="isActionRunning('disable-2fa')"
                      @click="disableTwoFactor"
                    >
                      Disable 2FA
                    </UButton>
                  </div>
                  <p class="text-xs text-muted-foreground">Removes TOTP configuration and recovery tokens for this user.</p>
                </div>
              </UCard>

              <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                <div class="space-y-2">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Email verification</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      icon="i-lucide-badge-check"
                      size="xs"
                      variant="outline"
                      color="primary"
                      :disabled="hasVerifiedEmail"
                      :loading="isActionRunning('email-verify')"
                      @click="markEmailVerified"
                    >
                      Mark verified
                    </UButton>
                    <UButton
                      icon="i-lucide-badge-x"
                      size="xs"
                      variant="outline"
                      color="neutral"
                      :disabled="!hasVerifiedEmail"
                      :loading="isActionRunning('email-unverify')"
                      @click="markEmailUnverified"
                    >
                      Mark unverified
                    </UButton>
                    <UButton
                      icon="i-lucide-mail-plus"
                      size="xs"
                      variant="outline"
                      color="neutral"
                      :loading="isActionRunning('email-resend')"
                      @click="resendVerificationEmail"
                    >
                      Resend email
                    </UButton>
                  </div>
                  <p class="text-xs text-muted-foreground">Update email verification state or resend the verification link.</p>
                </div>
              </UCard>

              <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                <div class="space-y-2">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Account state</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      :icon="isSuspended ? 'i-lucide-user-check' : 'i-lucide-user-x'"
                      size="xs"
                      variant="outline"
                      :color="isSuspended ? 'primary' : 'error'"
                      :loading="isActionRunning(isSuspended ? 'unsuspend' : 'suspend')"
                      @click="toggleSuspension"
                    >
                      {{ isSuspended ? 'Unsuspend user' : 'Suspend user' }}
                    </UButton>
                    <UButton
                      icon="i-lucide-user-cog"
                      size="xs"
                      variant="outline"
                      color="primary"
                      :disabled="isSuspended"
                      :loading="isActionRunning('impersonate')"
                      @click="impersonateUser"
                    >
                      Start impersonation
                    </UButton>
                  </div>
                  <p class="text-xs text-muted-foreground">Suspension revokes active sessions; impersonation generates a temporary sign-in link.</p>
                </div>
              </UCard>
            </div>
          </template>

        </USlideover>

        <div v-if="isLoading" class="grid gap-4 xl:grid-cols-3">
          <div
            v-for="i in 3"
            :key="`skeleton-${i}`"
            class="space-y-3 rounded-lg border border-dashed border-default/60 bg-muted/30 p-4"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-3 w-24" />
            <USkeleton class="h-24 w-full" />
          </div>
        </div>

        <div v-else-if="profile" class="space-y-6">
          <div v-if="isSuspended || requiresPasswordReset" class="space-y-3">
            <UAlert v-if="isSuspended" color="error" variant="soft" icon="i-lucide-ban">
              <template #title>Account suspended</template>
              <template #description>
                <p>Active sessions have been revoked and the user cannot sign in.</p>
                <p v-if="user?.suspensionReason" class="mt-2 text-xs text-muted-foreground">Reason: {{ user.suspensionReason }}</p>
                <p v-if="user?.suspendedAt" class="mt-1 text-xs text-muted-foreground">Suspended at {{ formatDate(user.suspendedAt) }}</p>
              </template>
            </UAlert>
            <UAlert v-if="requiresPasswordReset" color="warning" variant="soft" icon="i-lucide-alert-triangle">
              <template #title>Password reset required</template>
              <template #description>
                <p>The user must set a new password on their next login.</p>
              </template>
            </UAlert>
          </div>

          <UTabs v-model="tab" variant="link" :items="tabItems" class="w-full" />

          <div v-if="tab === 'overview'" class="space-y-4">
            <UCard :ui="{ body: 'space-y-6' }">
              <template #header>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 class="text-lg font-semibold">Profile overview</h2>
                    <p class="text-xs text-muted-foreground">Consolidated account metadata, status, and metrics.</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge v-if="user?.rootAdmin" size="sm" color="error" variant="soft" class="uppercase">Root admin</UBadge>
                    <UBadge size="sm" color="primary" variant="soft" class="uppercase">{{ user?.role }}</UBadge>
                    <UBadge v-if="isSuspended" size="sm" color="error" variant="solid" class="uppercase">Suspended</UBadge>
                    <UBadge v-if="requiresPasswordReset" size="sm" color="warning" variant="soft" class="uppercase">Reset required</UBadge>
                    <UBadge size="sm" :color="hasTwoFactor ? 'primary' : 'neutral'" variant="soft" class="uppercase">
                      2FA {{ hasTwoFactor ? 'ON' : 'OFF' }}
                    </UBadge>
                  </div>
                </div>
              </template>

              <div class="grid gap-4 md:grid-cols-2">
                <dl class="space-y-3 text-sm">
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Username</dt>
                    <dd class="font-medium">{{ user?.username }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Email</dt>
                    <dd class="font-medium">{{ user?.email || 'No email provided' }}</dd>
                  </div>
                  <div v-if="user?.name" class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Display name</dt>
                    <dd class="font-medium">{{ user.name }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Language</dt>
                    <dd class="font-medium">{{ user?.language?.toUpperCase() }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Created</dt>
                    <dd class="font-medium">{{ formatDate(user?.createdAt) }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Updated</dt>
                    <dd class="font-medium">{{ formatDate(user?.updatedAt) }}</dd>
                  </div>
                </dl>

                <dl class="space-y-3 text-sm">
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Two-factor</dt>
                    <dd class="font-medium">{{ hasTwoFactor ? 'Enabled' : 'Disabled' }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Password reset required</dt>
                    <dd class="font-medium">{{ requiresPasswordReset ? 'Yes' : 'No' }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Account status</dt>
                    <dd class="font-medium">{{ isSuspended ? 'Suspended' : 'Active' }}</dd>
                  </div>
                  <div v-if="user?.suspensionReason" class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Suspension reason</dt>
                    <dd class="font-medium">{{ user.suspensionReason }}</dd>
                  </div>
                  <div v-if="user?.emailVerifiedAt" class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">Email verified at</dt>
                    <dd class="font-medium">{{ formatDate(user.emailVerifiedAt) }}</dd>
                  </div>
                </dl>
              </div>

              <USeparator />

              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <UCard variant="soft" :ui="{ body: 'p-3 space-y-1' }">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Owned servers</p>
                  <p class="text-sm font-semibold">{{ profile.stats.serverCount }}</p>
                </UCard>
                <UCard variant="soft" :ui="{ body: 'p-3 space-y-1' }">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">API keys</p>
                  <p class="text-sm font-semibold">{{ profile.stats.apiKeyCount }}</p>
                </UCard>
                <UCard variant="soft" :ui="{ body: 'p-3 space-y-1' }">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Email verified</p>
                  <p class="text-sm font-semibold">{{ user?.emailVerified ? 'Yes' : 'No' }}</p>
                </UCard>
                <UCard variant="soft" :ui="{ body: 'p-3 space-y-1' }">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Two-factor</p>
                  <p class="text-sm font-semibold">{{ hasTwoFactor ? 'Enabled' : 'Disabled' }}</p>
                </UCard>
              </div>
            </UCard>
          </div>

          <UCard v-else-if="tab === 'servers'" :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Servers</h2>
                <UBadge color="neutral" variant="soft" size="xs">{{ servers.length }} total</UBadge>
              </div>
            </template>

            <UCard
              v-if="servers.length === 0"
              variant="subtle"
              :ui="{ body: 'px-4 py-6 text-center space-y-2 text-sm text-muted-foreground' }"
            >
              This user does not own any servers.
            </UCard>
            <div v-else class="overflow-hidden rounded-md border border-default">
              <table class="min-w-full divide-y divide-default text-sm">
                <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 text-left">Server</th>
                    <th class="px-3 py-2 text-left">Status</th>
                    <th class="px-3 py-2 text-left">Node</th>
                    <th class="px-3 py-2 text-left">Created</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="server in servers" :key="server.id">
                    <td class="px-3 py-2">
                      <div class="flex flex-col">
                        <NuxtLink :to="`/admin/servers/${server.id}`" class="font-medium hover:text-primary">
                          {{ server.name }}
                        </NuxtLink>
                        <span class="text-xs text-muted-foreground">{{ server.identifier }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      <UBadge v-if="server.suspended" size="xs" color="error" variant="soft">Suspended</UBadge>
                      <span v-else class="text-xs text-muted-foreground">{{ server.status || 'Unknown' }}</span>
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      {{ server.nodeName || 'Unassigned' }}
                    </td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">{{ formatDate(server.createdAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <UCard v-else-if="tab === 'api-keys'" :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">API keys</h2>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{{ activeApiKeys.length }} active</span>
                  <span v-if="expiredApiKeys.length">· {{ expiredApiKeys.length }} expired</span>
                </div>
              </div>
            </template>

            <UCard
              v-if="apiKeys.length === 0"
              variant="subtle"
              :ui="{ body: 'px-4 py-6 text-center text-sm text-muted-foreground' }"
            >
              No API keys issued.
            </UCard>
            <div v-else class="space-y-4 text-sm">
              <div v-if="activeApiKeys.length" class="space-y-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Active keys</p>
                <ul class="space-y-3">
                  <UCard
                    v-for="key in activeApiKeys"
                    :key="key.id"
                    as="li"
                    variant="outline"
                    :ui="{ body: 'space-y-3 px-3 py-3' }"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-mono text-sm break-all">{{ key.identifier }}</span>
                      <span class="text-xs text-muted-foreground">Created {{ formatDate(key.createdAt) }}</span>
                    </div>
                    <p v-if="key.memo" class="text-xs text-muted-foreground">{{ key.memo }}</p>
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                      <span v-if="key.lastUsedAt">Last used {{ formatDate(key.lastUsedAt) }}</span>
                      <span v-if="key.expiresAt">Expires {{ formatDate(key.expiresAt) }}</span>
                    </div>
                  </UCard>
                </ul>
              </div>

              <div v-if="expiredApiKeys.length" class="space-y-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Expired keys</p>
                <ul class="space-y-3">
                  <UCard
                    v-for="key in expiredApiKeys"
                    :key="key.id"
                    as="li"
                    variant="outline"
                    :ui="{ body: 'space-y-3 px-3 py-3 opacity-70' }"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-mono text-sm break-all">{{ key.identifier }}</span>
                      <span class="text-xs text-muted-foreground">Expired {{ formatDate(key.expiresAt) }}</span>
                    </div>
                    <p v-if="key.memo" class="text-xs text-muted-foreground">{{ key.memo }}</p>
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                      <span v-if="key.lastUsedAt">Last used {{ formatDate(key.lastUsedAt) }}</span>
                      <span>Created {{ formatDate(key.createdAt) }}</span>
                    </div>
                  </UCard>
                </ul>
              </div>
            </div>
          </UCard>

          <UCard v-else-if="tab === 'activity'" :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Recent activity</h2>
                <UBadge color="neutral" variant="soft" size="xs">{{ activity.length }}</UBadge>
              </div>
            </template>

            <UCard
              v-if="activity.length === 0"
              variant="subtle"
              :ui="{ body: 'px-4 py-6 text-center text-sm text-muted-foreground' }"
            >
              No audit events recorded for this user yet.
            </UCard>
            <ul v-else class="space-y-3">
              <UCard
                v-for="item in activity"
                :key="item.id"
                as="li"
                variant="outline"
                :ui="{ body: 'space-y-2 px-3 py-3 text-sm' }"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="font-medium">{{ item.action }}</p>
                    <p class="text-xs text-muted-foreground">{{ item.target }}</p>
                  </div>
                  <span class="text-xs text-muted-foreground">{{ formatDate(item.occurredAt) }}</span>
                </div>

                <dl
                  v-if="cleanMetadata(item.details ?? {})?.length"
                  class="grid gap-1 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground"
                >
                  <div
                    v-for="([label, value]) in cleanMetadata(item.details ?? {})"
                    :key="label"
                    class="flex flex-wrap items-center gap-2"
                  >
                    <dt class="font-medium uppercase tracking-wide">{{ label }}</dt>
                    <dd class="flex-1 break-words text-muted-foreground">
                      <code class="whitespace-pre-wrap">{{ String(value) }}</code>
                    </dd>
                  </div>
                </dl>
              </UCard>
            </ul>
          </UCard>
          </div>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
