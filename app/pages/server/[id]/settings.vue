<script setup lang="ts">
import type { SettingsData } from '#shared/types/server'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const { t } = useI18n()
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
      title: t('validation.required'),
      description: t('server.settings.serverNameHelp'),
      color: 'error',
    })
    return
  }

  renaming.value = true
  try {
    await $fetch(`/api/servers/${serverId.value}/rename`, {
      method: 'patch',
      body: { name: newName.value.trim() },
    })

    toast.add({
      title: t('common.success'),
      description: t('common.success'),
      color: 'success',
    })

    showRenameModal.value = false
    await refreshNuxtData(`server-${serverId.value}-settings`)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('common.error'),
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
      title: t('server.settings.serverReinstalled'),
      description: t('server.settings.serverReinstalledDescription'),
      color: 'success',
    })

    showReinstallModal.value = false
    await refreshNuxtData(`server-${serverId.value}-settings`)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('common.error'),
      color: 'error',
    })
  }
  finally {
    reinstalling.value = false
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === 0 || bytes === -1) return t('common.none')
  if (bytes < 0) return t('common.none')
  const k = 1024
  const sizes = [t('common.mb'), t('common.gb'), t('common.tb')]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

function formatCpu(cpu: number | null): string {
  if (cpu === null || cpu === 0) return t('common.none')
  return `${cpu}%`
}

function formatIo(io: number | null): string {
  if (io === null || io === 0) return t('common.none')
  return `${io} ${t('server.settings.ioWeight')}`
}
</script>

 <template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">{{ t('server.settings.title') }}</p>
            <h1 class="text-xl font-semibold">{{ t('server.settings.title') }}</h1>
          </div>
        </header>

        <div v-if="error" class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
            <div>
              <p class="font-medium">{{ t('server.settings.title') }}</p>
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
                <h2 class="text-lg font-semibold">{{ t('server.settings.title') }}</h2>
                <UButton
                  icon="i-lucide-pencil"
                  size="sm"
                  variant="ghost"
                  @click="openRenameModal"
                >
                  {{ t('server.files.rename') }}
                </UButton>
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('common.name') }}</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ server?.name }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.identifier') }}</p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <p class="font-mono text-sm text-foreground">{{ server?.identifier }}</p>
                  <ServerCopyButton v-if="server?.identifier" :text="server.identifier" :label="t('server.details.identifier')" />
                </div>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.uuid') }}</p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <p class="font-mono text-xs text-foreground truncate">{{ server?.uuid }}</p>
                  <ServerCopyButton v-if="server?.uuid" :text="server.uuid" :label="t('server.details.uuid')" />
                </div>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('common.status') }}</p>
                <div class="mt-2 flex items-center gap-2">
                  <UBadge v-if="server?.suspended" color="error" size="sm">{{ t('common.suspended') }}</UBadge>
                  <UBadge v-else color="primary" size="sm">{{ t('common.active') }}</UBadge>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('server.details.limits') }}</h2>
              </div>
            </template>

            <ServerEmptyState
              v-if="!limits"
              icon="i-lucide-gauge"
              :title="t('common.none')"
              :description="t('common.none')"
            />

            <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.cpu') }}</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatCpu(limits.cpu) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.memory') }}</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatBytes(limits.memory) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.disk') }}</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatBytes(limits.disk) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.swap') }}</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatBytes(limits.swap) }}</p>
              </div>
              <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('server.details.io') }}</p>
                <p class="mt-2 text-lg font-semibold text-foreground">{{ formatIo(limits.io) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('server.settings.title') }}</h2>
              </div>
            </template>

            <div class="space-y-4">
              <UAlert color="warning" icon="i-lucide-alert-triangle">
                <template #title>{{ t('common.warning') }}</template>
                <template #description>
                  {{ t('server.settings.reinstallWarningDescription') }}
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
                  {{ t('server.settings.reinstallServer') }}
                </UButton>
              </div>
            </div>
          </UCard>

          <UCard v-if="server?.suspended">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">{{ t('common.suspended') }}</h2>
                <UButton icon="i-lucide-unlock" size="sm" color="warning" variant="soft">{{ t('common.suspended') }}</UButton>
              </div>
            </template>

            <UAlert color="warning" icon="i-lucide-alert-triangle" :title="t('common.suspended')">
              <template #description>
                {{ t('common.suspended') }}
              </template>
            </UAlert>
          </UCard>
        </template>
        </section>
      </UContainer>
    </UPageBody>

    <UModal
      v-model:open="showReinstallModal"
      :title="t('server.settings.reinstallServer')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('common.warning') }}</template>
            <template #description>
              {{ t('server.settings.reinstallWarningDescription') }}
            </template>
          </UAlert>

          <p class="text-sm text-muted-foreground">
            {{ t('server.settings.confirmReinstall', { name: server?.name }) }}
          </p>
        </div>
      </template>

      <template #footer>
        <UButton
          variant="ghost"
          :disabled="reinstalling"
          @click="showReinstallModal = false"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          color="error"
          :loading="reinstalling"
          :disabled="reinstalling"
          @click="reinstallServer"
        >
          {{ t('server.settings.reinstallServer') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="showRenameModal"
      :title="t('server.files.rename')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField :label="t('common.name')" name="name" required>
          <UInput
            v-model="newName"
            icon="i-lucide-server"
            :placeholder="t('common.name')"
            required
            class="w-full"
            :disabled="renaming"
            @keydown.enter="renameServer"
          />
          <template #help>
            {{ t('server.settings.serverNameHelp') }}
          </template>
        </UFormField>
      </template>

      <template #footer>
        <UButton
          variant="ghost"
          :disabled="renaming"
          @click="showRenameModal = false"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          icon="i-lucide-check"
          color="primary"
          :loading="renaming"
          :disabled="renaming || !newName.trim()"
          @click="renameServer"
        >
          {{ t('common.save') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
