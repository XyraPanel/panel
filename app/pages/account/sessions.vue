<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
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

const authStore = useAuthStore()
const { status } = storeToRefs(authStore)

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
    await authStore.syncSession()
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
  await authStore.syncSession()
  await fetchSessions()
}

const sortedSessions = computed(() => (
  [...sessions.value].sort((a, b) => b.expiresAtTimestamp - a.expiresAtTimestamp)
))

const revealedIps = ref<Record<string, boolean>>({})

function maskIp(ip: string) {
  if (!ip || ip === 'Unknown') return 'Unknown'
  if (ip.includes(':')) {
    const segments = ip.split(':')
    return segments.slice(0, 4).join(':') + '::'
  }
  const parts = ip.split('.')
  if (parts.length !== 4) return ip
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`
}

function isIpRevealed(token: string) {
  return revealedIps.value[token] === true
}

function toggleIpReveal(token: string) {
  revealedIps.value = {
    ...revealedIps.value,
    [token]: !isIpRevealed(token),
  }
}

function displayIp(ip: string, token: string) {
  if (!ip || ip === 'Unknown') return 'Unknown'
  return isIpRevealed(token) ? ip : maskIp(ip)
}

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
      <template #links>
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
            class="flex flex-col gap-3 rounded-lg border border-default p-4">
            <div class="flex items-start justify-between">
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <UIcon 
                    :name="session.device === 'Mobile' ? 'i-lucide-smartphone' : 
                          session.device === 'Tablet' ? 'i-lucide-tablet' : 'i-lucide-monitor'" 
                    class="size-4 text-muted-foreground" 
                  />
                  <span class="font-medium text-sm">{{ session.browser }} on {{ session.os }}</span>
                  <UBadge v-if="session.isCurrent" color="primary" variant="soft" size="xs">
                    Current
                  </UBadge>
                </div>
                
                <div class="space-y-1 text-xs text-muted-foreground">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-map-pin" class="size-3" />
                    <span>{{ displayIp(session.ipAddress, session.token) }}</span>
                    <UButton
                      variant="ghost"
                      size="xs"
                      color="neutral"
                      @click="toggleIpReveal(session.token)"
                    >
                      {{ isIpRevealed(session.token) ? 'Hide' : 'Reveal' }}
                    </UButton>
                  </div>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-clock" class="size-3" />
                    <span>
                      Expires:
                      <NuxtTime
                        v-if="session.expiresAt"
                        :datetime="session.expiresAt"
                        relative
                        class="font-medium"
                      />
                      <span v-else>Unknown</span>
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-fingerprint" class="size-3" />
                    <span class="font-mono">{{ session.fingerprint }}</span>
                  </div>
                </div>
              </div>
              
              <UButton 
                variant="ghost" 
                color="error" 
                size="xs"
                icon="i-lucide-log-out"
                :disabled="session.isCurrent || updatingSessions"
                @click="handleSignOut(session.token)"
              >
                Sign out
              </UButton>
            </div>
            
            <details v-if="session.isCurrent" class="text-xs">
              <summary class="cursor-pointer text-muted-foreground hover:text-foreground">
                Show session details
              </summary>
              <div class="mt-2 space-y-1 text-muted-foreground">
                <div><strong>Token:</strong> <code class="break-all">{{ session.token }}</code></div>
                <div><strong>User Agent:</strong> {{ session.userAgent }}</div>
                <div>
                  <strong>Issued:</strong>
                  <NuxtTime v-if="session.issuedAt" :datetime="session.issuedAt" relative class="font-medium" />
                  <span v-else>Unknown</span>
                </div>
              </div>
            </details>
          </div>
        </div>
      </template>
    </UCard>
    </UPageBody>
  </UPage>
</template>
