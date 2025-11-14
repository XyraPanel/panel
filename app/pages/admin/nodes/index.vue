<script setup lang="ts">
import type { WingsNodeConfiguration, WingsNodeSummary, WingsSystemInformation } from '#shared/types/wings'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Nodes',
  adminSubtitle: 'Manage Wings daemons and monitor node health',
})

const toast = useToast()
const requestURL = useRequestURL()

const panelOrigin = computed(() => requestURL.origin)

const showCreate = ref(false)
const isSubmitting = ref(false)
const issuingFor = ref<string | null>(null)
const loadingConfigFor = ref<string | null>(null)

const tokenModal = reactive({
  visible: false,
  command: '',
  token: '',
  nodeName: '',
  nodeId: '',
  allowInsecure: false,
  error: '' as string | null,
})

const createState = reactive({
  name: '',
  description: '',
  baseURL: '',
  apiToken: '',
  allowInsecure: false,
})

const systemModal = reactive({
  visible: false,
  loading: false,
  nodeId: '' as string,
  nodeName: '' as string,
  info: null as WingsSystemInformation | null,
  error: '' as string | null,
})

const {
  data: nodesResponse,
  pending,
  error,
} = await useAsyncData('wings-nodes', () => $fetch<{ data: WingsNodeSummary[] }>('/api/wings/nodes'))

const nodes = computed(() => nodesResponse.value?.data ?? [])

function resetCreateForm() {
  createState.name = ''
  createState.description = ''
  createState.baseURL = ''
  createState.apiToken = ''
  createState.allowInsecure = false
}

async function handleCreateNode() {
  isSubmitting.value = true
  try {
    const payload: Record<string, unknown> = {
      name: createState.name,
      description: createState.description || undefined,
      baseURL: createState.baseURL,
      allowInsecure: createState.allowInsecure,
    }

    if (createState.apiToken.trim().length > 0) {
      payload.apiToken = createState.apiToken.trim()
    }

    await $fetch('/api/wings/nodes', {
      method: 'POST',
      body: payload,
    })
    toast.add({ title: 'Node registered', color: 'primary' })
    resetCreateForm()
    showCreate.value = false
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to register node'
    toast.add({ title: 'Failed to register node', description: message, color: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDeleteNode(id: string) {
  if (!confirm('Remove this node from the panel?')) {
    return
  }

  try {
    await $fetch(`/api/wings/nodes/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Node removed', color: 'primary' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to remove node'
    toast.add({ title: 'Failed to remove node', description: message, color: 'error' })
  }
}

async function handleIssueToken(node: WingsNodeSummary) {
  issuingFor.value = node.id
  tokenModal.error = null

  try {
    const response = await $fetch<{ data: { token: string } }>(`/api/admin/wings/nodes/${node.id}/token`, {
      method: 'POST',
    })

    const token = response.data.token
    const commandParts = [
      'wings configure',
      `--panel-url ${panelOrigin.value}`,
      `--node ${node.id}`,
      `--token ${token}`,
    ]

    if (node.allowInsecure) {
      commandParts.push('--allow-insecure')
    }

    tokenModal.visible = true
    tokenModal.command = commandParts.join(' ')
    tokenModal.token = token
    tokenModal.nodeName = node.name
    tokenModal.nodeId = node.id
    tokenModal.allowInsecure = node.allowInsecure
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to issue deployment token'
    tokenModal.error = message
    toast.add({ title: 'Failed to issue token', description: message, color: 'error' })
  }
  finally {
    issuingFor.value = null
  }
}

async function copyInstallCommand() {
  if (!tokenModal.command) {
    return
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(tokenModal.command)
      toast.add({ title: 'Command copied', color: 'primary' })
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to copy command'
    toast.add({ title: 'Copy failed', description: message, color: 'error' })
  }
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function resetSystemModal() {
  systemModal.loading = false
  systemModal.nodeId = ''
  systemModal.nodeName = ''
  systemModal.info = null
  systemModal.error = null
}

async function fetchSystemInformation(nodeId: string) {
  systemModal.loading = true
  systemModal.error = null
  try {
    const response = await $fetch<{ data: WingsSystemInformation }>(`/api/admin/wings/nodes/${nodeId}/system`)
    systemModal.info = response.data
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve system information'
    systemModal.error = message
    toast.add({ title: 'Failed to load system info', description: message, color: 'error' })
  }
  finally {
    systemModal.loading = false
  }
}

async function handleViewSystemInfo(node: WingsNodeSummary) {
  systemModal.visible = true
  systemModal.nodeId = node.id
  systemModal.nodeName = node.name
  systemModal.info = null
  await fetchSystemInformation(node.id)
}

async function handleDownloadConfiguration(node: WingsNodeSummary) {
  if (typeof window === 'undefined') {
    toast.add({ title: 'Unsupported environment', description: 'Configuration download is only available in the browser.', color: 'warning' })
    return
  }

  loadingConfigFor.value = node.id
  try {
    const response = await $fetch<{ data: WingsNodeConfiguration }>(`/api/admin/wings/nodes/${node.id}/configuration`)
    const serialized = JSON.stringify(response.data, null, 2)
    const blob = new Blob([serialized], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    const slug = node.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || node.id
    anchor.href = url
    anchor.download = `wings-node-${slug}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)

    toast.add({ title: 'Configuration downloaded', color: 'primary' })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to download configuration'
    toast.add({ title: 'Download failed', description: message, color: 'error' })
  }
  finally {
    loadingConfigFor.value = null
  }
}

watch(
  () => systemModal.visible,
  (open) => {
    if (!open) {
      resetSystemModal()
    }
  },
)
</script>

<template>
  <div>
    <UPage>
      <UPageBody>
        <section class="space-y-6">
          <header class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 class="text-xl font-semibold">Registered nodes</h1>
              <p class="text-xs text-muted-foreground">Link Wings daemons to manage infrastructure.</p>
            </div>
            <UButton icon="i-lucide-plus" color="primary" variant="soft" @click="showCreate = true">
              Add node
            </UButton>
          </header>

          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Node inventory</h2>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <UIcon name="i-lucide-server" />
                  <span>{{ nodes.length }} linked</span>
                </div>
              </div>
            </template>

            <div v-if="pending" class="flex flex-col gap-3">
              <USkeleton class="h-16" repeat="3" />
            </div>
            <div v-else-if="error"
              class="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              Unable to load nodes: {{ (error as Error).message || 'unknown error' }}
            </div>
            <div v-else>
              <div v-if="nodes.length === 0"
                class="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted-foreground">
                No nodes linked yet. Add one to start syncing with Wings.
              </div>
              <div v-else class="overflow-hidden rounded-lg border border-default">
                <div
                  class="grid grid-cols-12 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span class="col-span-4">Name</span>
                  <span class="col-span-4">Endpoint</span>
                  <span class="col-span-2">Token</span>
                  <span class="col-span-2 text-right">Actions</span>
                </div>
                <div class="divide-y divide-default">
                  <div v-for="node in nodes" :key="node.id"
                    class="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
                    <div class="col-span-4 space-y-1">
                      <NuxtLink :to="`/admin/nodes/${node.id}`"
                        class="text-sm font-semibold text-primary hover:underline">
                        {{ node.name }}
                      </NuxtLink>
                      <p class="text-xs text-muted-foreground">ID: {{ node.id }}</p>
                      <p v-if="node.description" class="text-xs text-muted-foreground">{{ node.description }}</p>
                    </div>
                    <div class="col-span-4 space-y-1 text-xs text-muted-foreground">
                      <code class="block truncate">{{ node.baseURL }}</code>
                      <span>{{ node.allowInsecure ? 'TLS verification disabled' : 'TLS verification enforced' }}</span>
                      <span>Updated {{ formatUpdatedAt(node.updatedAt) }}</span>
                    </div>
                    <div class="col-span-2">
                      <UBadge :color="node.hasToken ? 'primary' : 'warning'" size="xs">
                        {{ node.hasToken ? 'Configured' : 'Missing token' }}
                      </UBadge>
                    </div>
                    <div class="col-span-2 flex justify-end gap-2">
                      <UButton icon="i-lucide-activity" size="xs" variant="ghost"
                        :loading="systemModal.loading && systemModal.nodeId === node.id"
                        @click="handleViewSystemInfo(node)" />
                      <UButton icon="i-lucide-download" size="xs" variant="ghost"
                        :loading="loadingConfigFor === node.id" @click="handleDownloadConfiguration(node)" />
                      <UButton icon="i-lucide-terminal" size="xs" color="primary" variant="ghost"
                        :loading="issuingFor === node.id" @click="handleIssueToken(node)" />
                      <UButton icon="i-lucide-trash" size="xs" color="error" variant="ghost"
                        @click="handleDeleteNode(node.id)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UPageBody>

      <template #right />
    </UPage>

    <UModal v-model:open="showCreate" title="Register Wings node"
      description="Store the connection details required to reach your Wings daemon." :ui="{ footer: 'justify-end' }">
      <template #body>
        <UForm :state="createState" class="space-y-4" @submit.prevent="handleCreateNode">
          <UFormField label="Name" name="name" required>
            <UInput v-model="createState.name" placeholder="Ashburn node" required class="w-full" />
          </UFormField>
          <UFormField label="Description" name="description">
            <UTextarea v-model="createState.description" placeholder="Optional description" class="w-full" />
          </UFormField>
          <UFormField label="Base URL" name="baseURL" required help="Example: https://node.example.com:8080">
            <UInput v-model="createState.baseURL" type="url" required class="w-full" />
          </UFormField>
          <UFormField label="API token" name="apiToken" help="Leave blank to generate a deployment token automatically">
            <UInput v-model="createState.apiToken" type="password" class="w-full" />
          </UFormField>
          <UFormField name="allowInsecure">
            <label class="flex items-center justify-between gap-2 text-sm">
              <span>Allow insecure TLS (self-signed)</span>
              <USwitch v-model="createState.allowInsecure" />
            </label>
          </UFormField>
        </UForm>
      </template>

      <template #footer>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton type="submit" color="primary" :loading="isSubmitting" @click="handleCreateNode">Save node</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="tokenModal.visible" title="Wings deployment command"
      :description="`Run this on the Wings host to link ${tokenModal.nodeName} (ID ${tokenModal.nodeId}) to the panel.`"
      :ui="{ footer: 'justify-between items-center' }">
      <template #body>
        <div class="space-y-4">
          <div v-if="tokenModal.error"
            class="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {{ tokenModal.error }}
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Command</label>
            <UTextarea :model-value="tokenModal.command" readonly autoresize class="font-mono text-sm w-full" />
          </div>
          <div class="space-y-1 text-xs text-muted-foreground">
            <p>Includes <code>wings configure</code> flags:</p>
            <ul class="list-disc pl-5">
              <li><code>--panel-url</code> set to {{ panelOrigin }}</li>
              <li><code>--node</code> set to {{ tokenModal.nodeId }}</li>
              <li><code>--token</code> set to the freshly issued deployment token</li>
              <li v-if="tokenModal.allowInsecure"><code>--allow-insecure</code> to disable TLS verification</li>
            </ul>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
          <span>Token: <code class="break-all">{{ tokenModal.token }}</code></span>
        </div>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="tokenModal.visible = false">Close</UButton>
          <UButton color="primary" icon="i-lucide-clipboard" @click="copyInstallCommand">Copy command</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="systemModal.visible" :title="`System information — ${systemModal.nodeName || 'Wings node'}`"
      :ui="{ footer: 'justify-between items-center flex-wrap gap-3' }">
      <template #body>
        <div class="space-y-4">
          <div v-if="systemModal.loading" class="space-y-2">
            <USkeleton class="h-4" repeat="4" />
          </div>
          <UAlert v-else-if="systemModal.error" color="error" icon="i-lucide-alert-triangle">
            <template #title>Unable to retrieve system information</template>
            <template #description>{{ systemModal.error }}</template>
          </UAlert>
          <div v-else class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest snapshot</label>
            <pre class="max-h-[420px] overflow-auto rounded bg-muted/40 p-3 text-xs leading-relaxed">
      {{ JSON.stringify(systemModal.info, null, 2) }}
    </pre>
          </div>
        </div>
      </template>

      <template #footer>
        <span class="text-xs text-muted-foreground">Fetched directly from the Wings node API.</span>
        <div class="flex items-center gap-2">
          <UButton variant="ghost" @click="systemModal.visible = false">Close</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
