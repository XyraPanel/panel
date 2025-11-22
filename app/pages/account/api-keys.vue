<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  auth: true,
  layout: 'default',
})

const toast = useToast()
const showCreateModal = ref(false)
const newKeyToken = ref<string | null>(null)
const isCreating = ref(false)
const copySuccess = ref(false)
const createError = ref<string | null>(null)

const keySchema = z.object({
  memo: z.string().trim().max(255, 'Memo must be under 255 characters').optional().default(''),
  allowedIps: z.string().trim().optional().default('')
    .refine(value => {
      if (!value)
        return true

      return value.split(',').every((ip) => {
        const trimmed = ip.trim()
        if (!trimmed)
          return false

        const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/
        return ipv4Regex.test(trimmed)
      })
    }, 'Enter valid IPv4 addresses separated by commas.'),
})

type KeyFormSchema = z.output<typeof keySchema>

const createForm = reactive<KeyFormSchema>(keySchema.parse({}))

const {
  data: keysData,
  pending: keysPending,
  refresh: refreshKeys,
  error: keysError,
} = await useAsyncData('account-api-keys', () => $fetch('/api/account/api-keys'), {
  server: false,
})

const apiKeys = computed(() => keysData.value?.data ?? [])
const showSkeleton = computed(() => keysPending.value && apiKeys.value.length === 0)
const loadError = computed(() => {
  const err = keysError.value
  if (!err)
    return null

  if (err instanceof Error)
    return err.message

  return 'Unable to load API keys. Try refreshing the page.'
})

function resetCreateState() {
  createError.value = null
  copySuccess.value = false
  newKeyToken.value = null
  Object.assign(createForm, keySchema.parse({}))
}

watch(showCreateModal, (open) => {
  if (!open)
    resetCreateState()
})

async function createApiKey(event: FormSubmitEvent<KeyFormSchema>) {
  if (isCreating.value)
    return

  isCreating.value = true
  createError.value = null
  newKeyToken.value = null
  copySuccess.value = false

  try {
    const payload = event.data
    const allowedIps = payload.allowedIps
      .split(',')
      .map(ip => ip.trim())
      .filter(Boolean)

    const formattedIps = allowedIps.length > 0 ? allowedIps : null

    const response = await $fetch('/api/account/api-keys', {
      method: 'POST',
      body: {
        memo: payload.memo && payload.memo.length > 0 ? payload.memo : null,
        allowedIps: formattedIps,
      },
    })

    newKeyToken.value = response.meta.secret_token
    Object.assign(createForm, keySchema.parse({}))

    await refreshKeys()

    toast.add({
      title: 'API Key Created',
      description: 'Copy your API key now – it will not be shown again.',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    const message = err.data?.message || 'Failed to create API key'
    createError.value = message

    toast.add({
      title: 'Error',
      description: message,
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

    await refreshKeys()

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

async function copyToken() {
  if (!newKeyToken.value)
    return

  try {
    await navigator.clipboard.writeText(newKeyToken.value)
    copySuccess.value = true
    toast.add({
      title: 'Copied',
      description: 'API key copied to clipboard',
      color: 'success',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to copy token'
    toast.add({
      title: 'Copy failed',
      description: message,
      color: 'error',
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
    <UContainer>
      <UPageHeader title="API Keys" description="Manage your API keys for programmatic access">
        <template #links>
          <UButton variant="subtle" icon="i-lucide-plus" @click="showCreateModal = true">
            Create API Key
          </UButton>
        </template>
      </UPageHeader>
    </UContainer>

    <UModal
      v-model:open="showCreateModal"
      title="Create API Key"
      description="Generate a personal API key for programmatic access"
      :ui="{ body: 'space-y-4', footer: 'flex justify-end gap-2' }"
    >
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
                class="flex-1 font-mono text-sm"
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

        <div v-else class="space-y-4">
          <UAlert v-if="createError" color="error" icon="i-lucide-alert-triangle">
            <template #title>Unable to create key</template>
            <template #description>{{ createError }}</template>
          </UAlert>

          <UForm
            :schema="keySchema"
            :state="createForm"
            class="space-y-4"
            :disabled="isCreating"
            @submit="createApiKey"
          >
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
              <UTextarea
                v-model="createForm.allowedIps"
                icon="i-lucide-shield"
                placeholder="192.168.1.1, 10.0.0.1"
                class="w-full"
                :rows="3"
              />
              <template #help>
                Comma-separated list of IPv4 addresses. Leave empty to allow all IPs.
              </template>
            </UFormField>
          </UForm>
        </div>
      </template>

      <template #footer="{ close }">
        <template v-if="!newKeyToken">
          <UButton
            variant="ghost"
            color="neutral"
            :disabled="isCreating"
            @click="() => {
              showCreateModal = false
              close()
            }"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            form=""
            icon="i-lucide-plus"
            color="primary"
            variant="subtle"
            :loading="isCreating"
            :disabled="isCreating"
            @click="() => createApiKey({ data: createForm } as unknown as FormSubmitEvent<KeyFormSchema>)"
          >
            Create Key
          </UButton>
        </template>
        <template v-else>
          <UButton @click="() => {
            showCreateModal = false
            close()
          }">
            Done
          </UButton>
        </template>
      </template>
    </UModal>

    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">Active API Keys</h2>
              <p class="text-sm text-muted-foreground">Manage existing keys or create new ones for API access.</p>
            </div>
          </template>
          <UAlert v-if="loadError" color="error" icon="i-lucide-alert-triangle" class="mb-4">
            <template #title>Unable to load keys</template>
            <template #description>{{ loadError }}</template>
          </UAlert>

          <div v-if="showSkeleton" class="space-y-3">
            <USkeleton class="h-16 w-full rounded-md" />
            <USkeleton class="h-16 w-full rounded-md" />
          </div>

          <UEmpty
            v-else-if="apiKeys.length === 0"
            icon="i-lucide-key"
            title="No API keys yet"
            description="Create an API key to access the panel programmatically"
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
      </UContainer>
    </UPageBody>
  </UPage>
</template>

