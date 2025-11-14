<script setup lang="ts">
import { computed, watch } from 'vue'
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

const userId = computed(() => route.params.id as string)

const { data, pending, error, refresh } = await useFetch<AdminUserProfilePayload>(
  () => `/api/admin/users/${userId.value}`,
  {
    watch: [userId],
    immediate: true,
  },
)

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

function cleanMetadata(details: Record<string, unknown>) {
  return Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== '')
}

function formatDate(value: string | null | undefined) {
  if (!value)
    return 'Unknown'

  return new Date(value).toLocaleString()
}

const isLoading = computed(() => pending.value && !profile.value)
</script>

<template>
  <UPage>
    <UPageBody>
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
            <UButton icon="i-lucide-users" variant="ghost" color="neutral" to="/admin/users">
              Back to users
            </UButton>
            <UButton v-if="user" icon="i-lucide-rotate-ccw" variant="outline" color="neutral"
              @click="() => refresh()">
              Refresh
            </UButton>
          </div>
        </header>

        <div v-if="isLoading" class="grid gap-4 xl:grid-cols-3">
          <UCard v-for="i in 3" :key="`skeleton-${i}`" :ui="{ body: 'space-y-3' }">
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-4 w-20" />
          </UCard>
        </div>

        <template v-else-if="profile">
          <div class="grid gap-4 xl:grid-cols-3">
            <UCard :ui="{ body: 'space-y-4' }" class="xl:col-span-2">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">Overview</h2>
                  <div class="flex items-center gap-2">
                    <UBadge v-if="user?.rootAdmin" size="xs" color="error" variant="soft" class="uppercase">
                      Root admin
                    </UBadge>
                    <UBadge size="xs" color="primary" variant="soft" class="uppercase">
                      {{ user?.role }}
                    </UBadge>
                  </div>
                </div>
              </template>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <p class="text-xs text-muted-foreground uppercase tracking-wide">Account</p>
                  <div class="space-y-1 text-sm">
                    <p class="font-medium">{{ user?.username }}</p>
                    <p class="text-muted-foreground">{{ user?.email }}</p>
                    <p v-if="user?.name" class="text-muted-foreground">{{ user.name }}</p>
                  </div>
                </div>
                <div class="space-y-2">
                  <p class="text-xs text-muted-foreground uppercase tracking-wide">Locale</p>
                  <p class="text-sm">{{ user?.language?.toUpperCase() }}</p>
                  <p class="text-xs text-muted-foreground">Two-factor {{ user?.twoFactorEnabled ? 'enabled' : 'disabled' }}</p>
                </div>
              </div>

              <USeparator />

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <p class="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
                  <p class="text-sm">{{ formatDate(user?.createdAt) }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground uppercase tracking-wide">Updated</p>
                  <p class="text-sm">{{ formatDate(user?.updatedAt) }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground uppercase tracking-wide">Email verified</p>
                  <p class="text-sm">{{ user?.emailVerified ? 'Yes' : 'No' }}</p>
                  <p v-if="user?.emailVerifiedAt" class="text-xs text-muted-foreground">
                    {{ formatDate(user.emailVerifiedAt) }}
                  </p>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <h2 class="text-lg font-semibold">Stats</h2>
              </template>
              <div class="space-y-3 text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Owned servers</span>
                  <span class="font-semibold">{{ profile.stats.serverCount }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">API keys</span>
                  <span class="font-semibold">{{ profile.stats.apiKeyCount }}</span>
                </div>
              </div>
            </UCard>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <UCard :ui="{ body: 'space-y-3' }" class="xl:col-span-2">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">Servers</h2>
                  <UBadge color="neutral" variant="soft" size="xs">
                    {{ servers.length }} total
                  </UBadge>
                </div>
              </template>

              <div v-if="servers.length === 0" class="rounded-md border border-dashed border-default px-4 py-6 text-center text-sm text-muted-foreground">
                This user does not own any servers.
              </div>
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

            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">API keys</h2>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ activeApiKeys.length }} active</span>
                    <span v-if="expiredApiKeys.length">· {{ expiredApiKeys.length }} expired</span>
                  </div>
                </div>
              </template>

              <div v-if="apiKeys.length === 0" class="rounded-md border border-dashed border-default px-4 py-6 text-center text-sm text-muted-foreground">
                No API keys issued.
              </div>
              <div v-else class="space-y-4 text-sm">
                <div v-if="activeApiKeys.length" class="space-y-3">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Active keys</p>
                  <ul class="space-y-3">
                    <li v-for="key in activeApiKeys" :key="key.id" class="rounded-md border border-default px-3 py-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-mono text-sm break-all">{{ key.identifier }}</span>
                        <span class="text-xs text-muted-foreground">Created {{ formatDate(key.createdAt) }}</span>
                      </div>
                      <p v-if="key.memo" class="mt-2 text-xs text-muted-foreground">{{ key.memo }}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                        <span v-if="key.lastUsedAt">Last used {{ formatDate(key.lastUsedAt) }}</span>
                        <span v-if="key.expiresAt">Expires {{ formatDate(key.expiresAt) }}</span>
                      </div>
                    </li>
                  </ul>
                </div>

                <div v-if="expiredApiKeys.length" class="space-y-3">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">Expired keys</p>
                  <ul class="space-y-3">
                    <li v-for="key in expiredApiKeys" :key="key.id" class="rounded-md border border-default px-3 py-3 opacity-70">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-mono text-sm break-all">{{ key.identifier }}</span>
                        <span class="text-xs text-muted-foreground">Expired {{ formatDate(key.expiresAt) }}</span>
                      </div>
                      <p v-if="key.memo" class="mt-2 text-xs text-muted-foreground">{{ key.memo }}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                        <span v-if="key.lastUsedAt">Last used {{ formatDate(key.lastUsedAt) }}</span>
                        <span>Created {{ formatDate(key.createdAt) }}</span>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </UCard>
          </div>

          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Recent activity</h2>
                <UBadge color="neutral" variant="soft" size="xs">{{ activity.length }}</UBadge>
              </div>
            </template>

            <div v-if="activity.length === 0" class="rounded-md border border-dashed border-default px-4 py-6 text-center text-sm text-muted-foreground">
              No audit events recorded for this user yet.
            </div>
            <ul v-else class="space-y-3">
              <li v-for="item in activity" :key="item.id" class="rounded-md border border-default px-3 py-3 text-sm">
                <div class="flex flex-col gap-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="font-medium">{{ item.action }}</p>
                      <p class="text-xs text-muted-foreground">{{ item.target }}</p>
                    </div>
                    <span class="text-xs text-muted-foreground">{{ formatDate(item.occurredAt) }}</span>
                  </div>

                  <dl v-if="cleanMetadata(item.details ?? {})?.length"
                    class="grid gap-1 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                    <div v-for="([label, value]) in cleanMetadata(item.details ?? {})" :key="label"
                      class="flex flex-wrap items-center gap-2">
                      <dt class="font-medium uppercase tracking-wide">{{ label }}</dt>
                      <dd class="flex-1 break-words text-muted-foreground">
                        <code class="whitespace-pre-wrap">{{ String(value) }}</code>
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            </ul>
          </UCard>
        </template>

        <div v-else-if="error" class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          Unable to load user profile.
        </div>
      </section>
    </UPageBody>

    <template #right />
  </UPage>
</template>
