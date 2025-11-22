<script setup lang="ts">
import type { SettingsData } from '#shared/types/server-settings'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)

const { data: settingsData, pending, error } = await useAsyncData(
  `server-${serverId.value}-settings`,
  () => $fetch<{ data: SettingsData }>(`/api/servers/${serverId.value}/settings`),
  {
    watch: [serverId],
  },
)

const server = computed(() => settingsData.value?.data.server)
const limits = computed(() => settingsData.value?.data.limits)

const toast = useToast()
const renaming = ref(false)
const showRenameModal = ref(false)
const newName = ref('')
const reinstalling = ref(false)
const showReinstallModal = ref(false)

function openRenameModal() {
  newName.value = server.value?.name || ''
  showRenameModal.value = true
}

async function renameServer() {
  if (!newName.value.trim()) {
    toast.add({
      title: 'Validation Error',
      description: 'Server name cannot be empty',
      color: 'error',
    })
    return
  }

  renaming.value = true
  try {
    await $fetch(`/api/servers/${serverId.value}/rename`, {
      method: 'PATCH',
      body: { name: newName.value.trim() },
    })

    toast.add({
      title: 'Server Renamed',
      description: 'Server name has been updated successfully',
      color: 'success',
    })

    showRenameModal.value = false
    await refreshNuxtData(`server-${serverId.value}-settings`)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to rename server',
      color: 'error',
    })
  }
  finally {
    renaming.value = false
  }
}

async function reinstallServer() {
  reinstalling.value = true
  try {
    await $fetch(`/api/servers/${serverId.value}/reinstall`, {
      method: 'POST',
    })

    toast.add({
      title: 'Reinstall Queued',
      description: 'Server reinstallation has been started',
      color: 'success',
    })

    showReinstallModal.value = false
    await refreshNuxtData(`server-${serverId.value}-settings`)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to reinstall server',
      color: 'error',
    })
  }
  finally {
    reinstalling.value = false
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return 'Unlimited'
  const k = 1024
  const sizes = ['MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

function formatCpu(cpu: number | null): string {
  if (cpu === null || cpu === 0) return 'Unlimited'
  return `${cpu}%`
}

function formatIo(io: number | null): string {
  if (io === null || io === 0) return 'Default'
  return `${io} weight`
}
</script>

 <template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">Server {{ serverId }} · Settings</p>
            <h1 class="text-xl font-semibold">Server Settings</h1>
          </div>
        </header>

        <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
            <div>
              <p class="font-medium">Failed to load settings</p>
              <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
        </div>

        <template v-else>
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Server Information</h2>
                <UButton
                  icon="i-lucide-pencil"
                  size="sm"
                  variant="ghost"
                  @click="openRenameModal"
                >
                  Rename
                </UButton>
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ server?.name }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Identifier</p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <p class="font-mono text-sm text-foreground">{{ server?.identifier }}</p>
                  <ServerCopyButton v-if="server?.identifier" :text="server.identifier" label="Identifier" />
                </div>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">UUID</p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <p class="font-mono text-xs text-foreground truncate">{{ server?.uuid }}</p>
                  <ServerCopyButton v-if="server?.uuid" :text="server.uuid" label="UUID" />
                </div>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <div class="mt-2 flex items-center gap-2">
                  <UBadge v-if="server?.suspended" color="error" size="sm">Suspended</UBadge>
                  <UBadge v-else color="primary" size="sm">Active</UBadge>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Resource Limits</h2>
              </div>
            </template>

            <ServerEmptyState
              v-if="!limits"
              icon="i-lucide-gauge"
              title="No limits configured"
              description="Resource limits will appear here once configured."
            />

            <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">CPU limit</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatCpu(limits.cpu) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Memory</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatBytes(limits.memory) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Disk</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatBytes(limits.disk) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Swap</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatBytes(limits.swap) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Block IO</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatIo(limits.io) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Reinstall Server</h2>
              </div>
            </template>

            <div class="space-y-4">
              <UAlert color="warning" icon="i-lucide-alert-triangle">
                <template #title>Danger Zone</template>
                <template #description>
                  Reinstalling your server will stop it, and then re-run the installation script that initially set it up.
                  This will delete all files and reset the server to its initial state.
                </template>
              </UAlert>

              <div class="flex justify-end">
                <UButton
                  icon="i-lucide-refresh-cw"
                  color="error"
                  variant="soft"
                  :disabled="server?.suspended"
                  @click="showReinstallModal = true"
                >
                  Reinstall Server
                </UButton>
              </div>
            </div>
          </UCard>

          <UCard v-if="server?.suspended">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Suspension Status</h2>
                <UButton icon="i-lucide-unlock" size="sm" color="warning" variant="soft">Unsuspend</UButton>
              </div>
            </template>

            <UAlert color="warning" icon="i-lucide-alert-triangle" title="Server Suspended">
              <template #description>
                This server is currently suspended and cannot be started. Contact an administrator to resolve this issue.
              </template>
            </UAlert>
          </UCard>
        </template>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model="showReinstallModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Confirm Server Reinstallation</h3>
        </template>

        <div class="space-y-4">
          <UAlert color="error" icon="i-lucide-alert-triangle">
            <template #title>This is a destructive action!</template>
            <template #description>
              Reinstalling will delete all files, databases, and configurations on this server.
              This action cannot be undone.
            </template>
          </UAlert>

          <p class="text-sm text-muted-foreground">
            Are you sure you want to reinstall <strong>{{ server?.name }}</strong>?
          </p>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              :disabled="reinstalling"
              @click="showReinstallModal = false"
            >
              Cancel
            </UButton>
            <UButton
              icon="i-lucide-refresh-cw"
              color="error"
              :loading="reinstalling"
              :disabled="reinstalling"
              @click="reinstallServer"
            >
              Yes, Reinstall Server
            </UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <UModal v-model="showRenameModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Rename Server</h3>
        </template>

        <form class="space-y-4" @submit.prevent="renameServer">
          <UFormField label="Server Name" name="name" required>
            <UInput
              v-model="newName"
              icon="i-lucide-server"
              placeholder="My Awesome Server"
              required
              class="w-full"
              :disabled="renaming"
            />
            <template #help>
              Choose a descriptive name for your server
            </template>
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              :disabled="renaming"
              @click="showRenameModal = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              icon="i-lucide-check"
              color="primary"
              :loading="renaming"
              :disabled="renaming || !newName.trim()"
            >
              Save Name
            </UButton>
          </div>
        </form>
      </UCard>
    </UModal>

    <template #right>
      <UPageAside />
    </template>
  </UPage>
</template>
