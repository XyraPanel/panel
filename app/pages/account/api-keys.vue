<script setup lang="ts">
import { ref, computed } from 'vue'

definePageMeta({
  auth: true,
  layout: 'default',
})

const toast = useToast()
const isCreating = ref(false)
const showCreateModal = ref(false)
const newKeyToken = ref<string | null>(null)

const createForm = reactive({
  memo: '',
  allowedIps: '',
})

const { data: keysData, refresh } = await useFetch('/api/account/api-keys', {
  key: 'account-api-keys',
})

const apiKeys = computed(() => keysData.value?.data || [])

async function createApiKey() {
  isCreating.value = true
  try {
    const allowedIps = createForm.allowedIps
      .split(',')
      .map(ip => ip.trim())
      .filter(Boolean)

    const response = await $fetch('/api/account/api-keys', {
      method: 'POST',
      body: {
        memo: createForm.memo || null,
        allowedIps: allowedIps.length > 0 ? allowedIps : null,
      },
    })

    newKeyToken.value = response.meta.secret_token
    createForm.memo = ''
    createForm.allowedIps = ''

    await refresh()

    toast.add({
      title: 'API Key Created',
      description: 'Copy your API key now - it will not be shown again',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to create API key',
      color: 'error',
    })
  }
  finally {
    isCreating.value = false
  }
}

async function deleteKey(identifier: string) {
  if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
    return
  }

  try {
    await $fetch(`/api/account/api-keys/${identifier}`, {
      method: 'DELETE',
    })

    await refresh()

    toast.add({
      title: 'API Key Deleted',
      description: 'The API key has been removed',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to delete API key',
      color: 'error',
    })
  }
}

function copyToken() {
  if (newKeyToken.value) {
    navigator.clipboard.writeText(newKeyToken.value)
    toast.add({
      title: 'Copied',
      description: 'API key copied to clipboard',
      color: 'success',
    })
  }
}

function formatDate(date: Date | string | number | null | undefined) {
  if (!date) return 'Never'
  return new Date(date).toLocaleString()
}
</script>

<template>
  <UPage>
    <UPageHeader title="API Keys" description="Manage your API keys for programmatic access">
      <template #actions>
        <UButton icon="i-lucide-plus" @click="showCreateModal = true">
          Create API Key
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <UCard>
        <UEmpty
          v-if="apiKeys.length === 0"
          icon="i-lucide-key"
          title="No API keys yet"
          description="Create an API key to access the panel programmatically"
          :actions="[{
            label: 'Create Your First API Key',
            icon: 'i-lucide-plus',
            onClick: () => { showCreateModal = true }
          }]"
        />

        <div v-else class="divide-y">
          <div v-for="key in apiKeys" :key="key.identifier" class="py-4 flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <code class="text-sm font-mono">{{ key.identifier }}</code>
                <UBadge v-if="(key as any).allowed_ips?.length" color="primary" variant="soft">
                  IP Restricted
                </UBadge>
              </div>
              <p v-if="key.description" class="text-sm text-muted-foreground mt-1">
                {{ key.description }}
              </p>
              <div class="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>Created: {{ formatDate(key.created_at) }}</span>
                <span v-if="key.last_used_at">Last used: {{ formatDate(key.last_used_at) }}</span>
              </div>
              <div v-if="(key as any).allowed_ips?.length" class="mt-2">
                <p class="text-xs text-muted-foreground">Allowed IPs:</p>
                <div class="flex flex-wrap gap-1 mt-1">
                  <UBadge v-for="ip in (key as any).allowed_ips" :key="ip" size="xs" variant="soft">
                    {{ ip }}
                  </UBadge>
                </div>
              </div>
            </div>
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              aria-label="Delete API key"
              @click="deleteKey(key.identifier)"
            />
          </div>
        </div>
      </UCard>
    </UPageBody>

    <UModal v-model:open="showCreateModal" title="Create API Key">
      <template #body>
        <div v-if="newKeyToken" class="space-y-4">
          <UAlert color="warning" variant="soft" icon="i-lucide-alert-triangle">
            <template #title>Save this token now!</template>
            <template #description>
              You won't be able to see it again after closing this dialog.
            </template>
          </UAlert>

          <div class="space-y-2">
            <label class="text-sm font-medium">Your API Key</label>
            <div class="flex gap-2">
              <UInput
                :model-value="newKeyToken"
                readonly
                icon="i-lucide-key"
                class="flex-1 font-mono text-sm w-full"
              />
              <UButton
                icon="i-lucide-copy"
                variant="soft"
                @click="copyToken"
              >
                Copy
              </UButton>
            </div>
          </div>
        </div>

        <form v-else class="space-y-4" @submit.prevent="createApiKey">
          <UFormField label="Description (optional)" name="memo">
            <UInput
              v-model="createForm.memo"
              icon="i-lucide-file-text"
              placeholder="My API Key"
              class="w-full"
            />
            <template #help>
              A friendly name to help identify this key
            </template>
          </UFormField>

          <UFormField
            label="Allowed IPs (optional)"
            name="allowedIps"
          >
            <UInput
              v-model="createForm.allowedIps"
              icon="i-lucide-shield"
              placeholder="192.168.1.1, 10.0.0.1"
              class="w-full"
            />
            <template #help>
              Comma-separated list of IP addresses. Leave empty to allow all IPs.
            </template>
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div v-if="!newKeyToken" class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            :disabled="isCreating"
            @click="showCreateModal = false"
          >
            Cancel
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            :loading="isCreating"
            :disabled="isCreating"
            @click="createApiKey"
          >
            Create Key
          </UButton>
        </div>
        <div v-else class="flex justify-end">
          <UButton
            @click="() => { showCreateModal = false; newKeyToken = null }"
          >
            Done
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
