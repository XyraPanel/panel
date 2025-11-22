<script setup lang="ts">
import type { ServerSubuser } from '#shared/types/server-subusers'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const { data: subusersData, pending, error } = await useAsyncData(
  `server-${serverId.value}-users`,
  () => $fetch<{ data: ServerSubuser[] }>(`/api/servers/${serverId.value}/users`),
  {
    watch: [serverId],
  },
)

const users = computed(() => subusersData.value?.data || [])

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

const permissionGroups = [
  {
    title: 'Console',
    perms: ['control.console'],
  },
  {
    title: 'Power',
    perms: ['control.power', 'control.start', 'control.stop', 'control.restart'],
  },
  {
    title: 'File manager',
    perms: ['files.read', 'files.write', 'files.delete'],
  },
  {
    title: 'Backups',
    perms: ['backups.read', 'backups.create', 'backups.delete', 'backups.restore'],
  },
  {
    title: 'Databases',
    perms: ['databases.read', 'databases.create', 'databases.delete'],
  },
  {
    title: 'Schedules',
    perms: ['schedules.read', 'schedules.create', 'schedules.update', 'schedules.delete'],
  },
]
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">Server {{ serverId }} · Users</p>
            <h1 class="text-xl font-semibold">Collaborators</h1>
          </div>
          <div class="flex gap-2">
            <UButton icon="i-lucide-user-plus" color="primary" variant="soft">Invite user</UButton>
          </div>
        </header>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Invited users</h2>
            </div>
          </template>

          <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
              <div>
                <p class="font-medium">Failed to load users</p>
                <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="pending" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
          </div>

          <div v-else-if="users.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-users" class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-3 text-sm font-medium">No collaborators</p>
            <p class="mt-1 text-xs text-muted-foreground">Invite users to collaborate on this server.</p>
          </div>

          <div v-else class="divide-y divide-default">
            <div
              v-for="user in users"
              :key="user.id"
              class="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold">{{ user.username }}</h3>
                  <UBadge color="primary" size="xs">Active</UBadge>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ user.email }} · Added {{ formatRelativeTime(user.createdAt) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span v-for="perm in user.permissions" :key="perm" class="rounded bg-muted px-2 py-1">{{ perm }}</span>
              </div>
            </div>
          </div>
        </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside>
        <div class="space-y-4">
          <UCard :ui="{ body: 'space-y-2' }">
            <h3 class="text-sm font-semibold">Permission groups</h3>
            <div v-for="group in permissionGroups" :key="group.title" class="rounded-md border border-default px-3 py-2">
              <p class="text-xs font-semibold text-muted-foreground">{{ group.title }}</p>
              <div class="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                <code v-for="perm in group.perms" :key="perm" class="rounded bg-muted px-1.5 py-0.5">{{ perm }}</code>
              </div>
            </div>
          </UCard>
        </div>
      </UPageAside>
    </template>
  </UPage>
</template>
