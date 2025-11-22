<script setup lang="ts">
import type { ApiKey, ApiKeyWithToken, CreateApiKeyPayload } from '#shared/types/admin-api-keys'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'API Keys',
  adminSubtitle: 'Manage existing keys or create new ones for API access.',
})

const toast = useToast()
const showCreateModal = ref(false)
const showKeyModal = ref(false)
const createdKey = ref<ApiKeyWithToken | null>(null)
const isSubmitting = ref(false)

const { data, refresh } = await useFetch<{ data: ApiKey[] }>('/api/admin/api-keys', {
  key: 'admin-api-keys',
})

const apiKeys = computed(() => data.value?.data ?? [])

const form = reactive({
  memo: '',
  expiresAt: '',
  allowedIps: '',
})

function resetForm() {
  form.memo = ''
  form.expiresAt = ''
  form.allowedIps = ''
}

async function handleCreate() {
  isSubmitting.value = true

  try {
    const payload: CreateApiKeyPayload = {
      memo: form.memo || undefined,
      expiresAt: form.expiresAt || undefined,
      allowedIps: form.allowedIps ? form.allowedIps.split(',').map(ip => ip.trim()).filter(Boolean) : undefined,
    }

    const result = await $fetch<ApiKeyWithToken>('/api/admin/api-keys', {
      method: 'POST',
      body: payload,
    })

    createdKey.value = result
    showCreateModal.value = false
    showKeyModal.value = true
    resetForm()
    await refresh()
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
    isSubmitting.value = false
  }
}

async function handleDelete(key: ApiKey) {
  if (!confirm(`Are you sure you want to revoke the API key "${key.memo || key.identifier}"?`)) {
    return
  }

  try {
    await $fetch(`/api/admin/api-keys/${key.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: 'API key revoked',
      description: 'The API key has been deleted successfully',
      color: 'success',
    })

    await refresh()
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

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  toast.add({
    title: 'Copied',
    description: 'API key copied to clipboard',
    color: 'success',
  })
}

</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-semibold">Active keys</h2>
                  <p class="text-xs text-muted-foreground">Existing API keys issued for programmatic access.</p>
                </div>
                <UButton icon="i-lucide-plus" color="primary" variant="subtle" @click="showCreateModal = true">
                  Create API key
                </UButton>
              </div>
            </template>

            <UEmpty v-if="apiKeys.length === 0" icon="i-lucide-key" title="No API keys"
              description="Create an API key for external integrations" variant="subtle" />

            <div v-else class="divide-y divide-default">
              <div v-for="key in apiKeys" :key="key.id" class="flex items-center justify-between gap-4 py-4">
                <div class="flex-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <code class="text-sm font-mono">{{ key.identifier }}</code>
                    <UBadge v-if="key.expiresAt" :color="new Date(key.expiresAt) < new Date() ? 'error' : 'neutral'"
                      size="xs" variant="soft">
                      {{ new Date(key.expiresAt) < new Date() ? 'Expired' : 'Active' }}
                    </UBadge>
                  </div>
                  <p v-if="key.memo" class="text-sm text-muted-foreground">{{ key.memo }}</p>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Created:
                      <NuxtTime v-if="key.createdAt" :datetime="key.createdAt" relative class="font-medium" />
                      <span v-else>Unknown</span>
                    </span>
                    <span>
                      Last used:
                      <NuxtTime v-if="key.lastUsedAt" :datetime="key.lastUsedAt" relative class="font-medium" />
                      <span v-else>Never used</span>
                    </span>
                    <span v-if="key.expiresAt">
                      Expires:
                      <NuxtTime :datetime="key.expiresAt" relative class="font-medium" />
                    </span>
                  </div>
                </div>

                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="handleDelete(key)">
                  Revoke
                </UButton>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateModal" title="Create API Key">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <UFormField label="Description" name="memo">
            <UInput v-model="form.memo" placeholder="My API Key" :disabled="isSubmitting" class="w-full" />
            <template #help>
              Optional description to help you identify this key
            </template>
          </UFormField>

          <UFormField label="Allowed IPs" name="allowedIps">
            <UInput v-model="form.allowedIps" placeholder="192.168.1.1, 10.0.0.1" :disabled="isSubmitting"
              class="w-full" />
            <template #help>
              Comma-separated list of IP addresses. Leave empty to allow all IPs.
            </template>
          </UFormField>

          <UFormField label="Expires At" name="expiresAt">
            <UInput v-model="form.expiresAt" type="datetime-local" :disabled="isSubmitting" class="w-full" />
            <template #help>
              Optional expiration date. Leave empty for no expiration.
            </template>
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="error" variant="ghost" :disabled="isSubmitting" @click="showCreateModal = false">
            Cancel
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleCreate">
            Create Key
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showKeyModal" :dismissible="false" title="API Key Created">
      <template #body>
        <div class="space-y-4">
          <UAlert color="warning" icon="i-lucide-alert-triangle">
            <template #title>Save this key now!</template>
            <template #description>
              This is the only time you will see the full API key. Make sure to copy it now.
            </template>
          </UAlert>

          <div class="space-y-2">
            <label class="text-sm font-medium">API Key</label>
            <div class="flex gap-2">
              <UInput :model-value="createdKey?.apiKey" readonly class="flex-1 font-mono" />
              <UButton icon="i-lucide-copy" variant="soft" @click="copyToClipboard(createdKey?.apiKey || '')">
                Copy
              </UButton>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="primary" @click="showKeyModal = false">
            I've saved the key
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
