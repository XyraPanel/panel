<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AccountSessionsResponse, UserSessionSummary } from '#shared/types/auth'

definePageMeta({
  auth: true,
})

const sessions = ref<UserSessionSummary[]>([])
const sessionsError = ref<string | null>(null)
const currentSessionToken = ref<string | null>(null)
const updatingSessions = ref(false)

const hasSessions = computed(() => sessions.value.length > 0)
const toast = useToast()

const { status, getSession } = useAuth()

const {
  data: sessionsResponse,
  pending: sessionsPending,
  error: sessionsFetchError,
  execute: fetchSessions,
} = useLazyFetch<AccountSessionsResponse>('/api/account/sessions', {
  server: false,
  immediate: false,
  cache: 'no-cache',
  retry: 0,
})

watch(sessionsResponse, (response) => {
  if (!response)
    return

  sessions.value = response.data
  currentSessionToken.value = response.currentToken
})

watch(sessionsFetchError, (err) => {
  if (!err) {
    sessionsError.value = null
    return
  }

  const message = err instanceof Error ? err.message : 'Unable to load sessions.'
  sessionsError.value = message
})

watch(status, async (value, previous) => {
  if (value === 'authenticated') {
    await getSession()
    await fetchSessions()
    return
  }

  if (value === 'unauthenticated' && previous === 'authenticated') {
    sessions.value = []
    currentSessionToken.value = null
    sessionsError.value = 'You need to sign in to view sessions.'
  }
}, { immediate: true })

async function loadSessions() {
  await getSession()
  await fetchSessions()
}

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleString()} (${date.toISOString()})`
}

const sortedSessions = computed(() => (
  [...sessions.value].sort((a, b) => b.expiresAtTimestamp - a.expiresAtTimestamp)
))

async function handleSignOut(token: string) {
  if (updatingSessions.value) return

  updatingSessions.value = true
  try {
    const result = await $fetch<{ revoked: boolean, currentSessionRevoked: boolean }>(`/api/account/sessions/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    })

    if (result.currentSessionRevoked) {
      await navigateTo('/auth/login')
      return
    }

    await loadSessions()
    toast.add({
      title: 'Session revoked',
      description: 'The selected session has been signed out.',
    })
  }
  catch (error) {
    toast.add({
      title: 'Failed to revoke session',
      description: error instanceof Error ? error.message : 'Unable to revoke selected session.',
      color: 'error',
    })
  }
  finally {
    updatingSessions.value = false
  }
}

async function handleSignOutAll(includeCurrent = false) {
  if (updatingSessions.value) return

  updatingSessions.value = true
  try {
    const result = await $fetch<{ revoked: number, currentSessionRevoked: boolean }>('/api/account/sessions', {
      method: 'DELETE',
      query: includeCurrent ? { includeCurrent: 'true' } : undefined,
    })

    if (result.currentSessionRevoked) {
      await navigateTo('/auth/login')
      return
    }

    await loadSessions()
    toast.add({
      title: 'Sessions revoked',
      description: result.revoked > 0
        ? `Revoked ${result.revoked} session${result.revoked === 1 ? '' : 's'}.`
        : 'No sessions were revoked.',
    })
  }
  catch (error) {
    toast.add({
      title: 'Failed to revoke sessions',
      description: error instanceof Error ? error.message : 'Unable to revoke sessions.',
      color: 'error',
    })
  }
  finally {
    updatingSessions.value = false
  }
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Sessions"
      description="Manage devices currently authenticated with your XyraPanel account."
    >
      <template #actions>
        <UButton variant="ghost" color="neutral" :loading="updatingSessions"
          :disabled="!hasSessions || updatingSessions" @click="handleSignOutAll(false)">
          Sign out others
        </UButton>
        <UButton variant="soft" color="neutral" :loading="updatingSessions"
          :disabled="!hasSessions || updatingSessions" @click="handleSignOutAll(true)">
          Sign out all
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <UCard :ui="{ body: 'space-y-3' }">
        <template #header>
          <div>
            <h2 class="text-lg font-semibold">Active sessions</h2>
            <p class="text-sm text-muted-foreground">Browser tokens issued for your account.</p>
          </div>
        </template>

      <div v-if="sessionsPending" class="space-y-3">
        <USkeleton v-for="i in 3" :key="`session-skeleton-${i}`" class="h-16 w-full rounded-lg" />
      </div>
      <template v-else>
        <UAlert v-if="sessionsError" icon="i-lucide-alert-triangle" color="error" :title="sessionsError" />

        <UEmpty
          v-else-if="!hasSessions"
          icon="i-lucide-monitor"
          title="No active sessions"
          description="No browser sessions found for your account"
          variant="subtle"
        />

        <div v-else class="space-y-3">
          <div v-for="session in sortedSessions" :key="session.token"
            class="flex flex-col gap-3 rounded-lg border border-default p-3 md:flex-row md:items-center md:justify-between">
            <div class="space-y-1">
              <p class="text-sm font-medium">
                Session token: <code class="break-all text-xs text-muted-foreground">{{ session.token }}</code>
              </p>
              <p class="text-xs text-muted-foreground">
                Issued: {{ formatTimestamp(session.issuedAt) }}
              </p>
              <p class="text-xs text-muted-foreground">
                Expires: {{ formatTimestamp(session.expiresAt) }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span v-if="session.token === currentSessionToken" class="flex items-center gap-1 text-primary">
                <UIcon name="i-lucide-dot" class="size-3" /> Current session
              </span>
              <UButton variant="ghost" color="neutral" size="xs"
                :disabled="session.token === currentSessionToken || updatingSessions"
                @click="handleSignOut(session.token)">
                Sign out
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UCard>
    </UPageBody>
  </UPage>
</template>
