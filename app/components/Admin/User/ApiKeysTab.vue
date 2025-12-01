<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminUserApiKeySummary, PaginatedApiKeysResponse } from '#shared/types/admin'

interface Props {
  userId: string
  itemsPerPage: number
}

const props = defineProps<Props>()

const { t } = useI18n()
const toast = useToast()
const apiKeysPage = ref(1)
const expandedApiKeys = ref<Set<string>>(new Set())
const showApiKeyDeleteModal = ref(false)
const apiKeyToDelete = ref<AdminUserApiKeySummary | null>(null)
const isDeletingApiKey = ref(false)

const {
  data: apiKeysData,
  refresh: refreshApiKeys,
} = await useFetch<PaginatedApiKeysResponse>(
  () => `/api/admin/users/${props.userId}/api-keys`,
  {
    key: `admin-user-api-keys-${props.userId}`,
    query: computed(() => ({
      page: apiKeysPage.value,
      limit: props.itemsPerPage,
    })),
    default: () => ({ data: [], pagination: { page: 1, perPage: props.itemsPerPage, total: 0, totalPages: 0 } }),
    watch: [apiKeysPage, () => props.itemsPerPage],
  },
)

const apiKeys = computed<AdminUserApiKeySummary[]>(() => apiKeysData.value?.data ?? [])
const apiKeysPagination = computed(() => apiKeysData.value?.pagination)

function toggleApiKey(identifier: string) {
  if (expandedApiKeys.value.has(identifier)) {
    expandedApiKeys.value.delete(identifier)
  } else {
    expandedApiKeys.value.add(identifier)
  }
}

function formatApiKeyJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2)
}

function getFullApiKeyData(key: AdminUserApiKeySummary) {
  return {
    id: key.id,
    identifier: key.identifier,
    memo: key.memo,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
  }
}

async function copyApiKeyJson(key: AdminUserApiKeySummary) {
  const json = formatApiKeyJson(getFullApiKeyData(key))
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json)
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = json
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    toast.add({
      title: t('common.copiedToClipboard'),
      description: t('admin.users.apiKeys.apiKeyDataJsonCopied'),
    })
  } catch (error) {
    toast.add({
      title: t('common.failedToCopy'),
      description: error instanceof Error ? error.message : t('admin.users.apiKeys.unableToCopyToClipboard'),
      color: 'error',
    })
  }
}

function openApiKeyDeleteModal(key: AdminUserApiKeySummary) {
  apiKeyToDelete.value = key
  showApiKeyDeleteModal.value = true
}

async function confirmApiKeyDelete() {
  if (!apiKeyToDelete.value) return

  isDeletingApiKey.value = true
  try {
    await $fetch(`/api/admin/users/${props.userId}/api-keys/${apiKeyToDelete.value.identifier}`, {
      method: 'DELETE',
    })

    await refreshApiKeys()
    showApiKeyDeleteModal.value = false
    apiKeyToDelete.value = null

    toast.add({
      title: t('admin.users.apiKeys.apiKeyDeleted'),
      description: t('admin.users.apiKeys.apiKeyRemoved'),
      color: 'success',
    })
  } catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.users.apiKeys.failedToDeleteApiKey'),
      color: 'error',
    })
  } finally {
    isDeletingApiKey.value = false
  }
}
</script>

<template>
  <div>
    <UCard :ui="{ body: 'space-y-3' }">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ t('admin.users.tabs.apiKeys') }}</h2>
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{{ apiKeysPagination?.total ?? 0 }} {{ t('common.all') }}</span>
          </div>
        </div>
      </template>

      <UEmpty
        v-if="apiKeys.length === 0"
        icon="i-lucide-key"
        :title="t('admin.users.apiKeys.noApiKeysYet')"
        :description="t('admin.users.apiKeys.noApiKeysYetDescription')"
        variant="subtle"
      />
      <div v-else class="space-y-3">
        <div
          v-for="key in apiKeys"
          :key="key.id"
          class="rounded-lg border border-default overflow-hidden"
          :class="{ 'opacity-70': key.expiresAt && new Date(key.expiresAt) <= new Date() }"
        >
          <button
            class="w-full flex items-center gap-3 p-3 text-left hover:bg-elevated/50 transition-colors"
            @click="toggleApiKey(key.identifier)"
          >
            <UIcon
              name="i-lucide-key"
              class="size-5 shrink-0 text-primary"
            />
            
            <div class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <div class="flex items-center gap-2 min-w-0">
                  <code class="text-sm font-medium font-mono">{{ key.identifier }}</code>
                  <UIcon
                    :name="expandedApiKeys.has(key.identifier) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-4 text-muted-foreground shrink-0"
                  />
                </div>
                <p v-if="key.memo" class="text-sm text-muted-foreground">
                  {{ key.memo }}
                </p>
                <UBadge
                  v-if="key.expiresAt && new Date(key.expiresAt) <= new Date()"
                  color="neutral"
                  variant="soft"
                  size="xs"
                >
                  {{ t('admin.apiKeys.expired') }}
                </UBadge>
              </div>

              <div class="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <span class="truncate">
                  {{ t('common.created') }}:
                  <NuxtTime :datetime="key.createdAt" class="font-medium" />
                </span>
                <span v-if="key.lastUsedAt" class="hidden sm:inline">•</span>
                <span v-if="key.lastUsedAt" class="truncate">
                  {{ t('admin.apiKeys.lastUsed') }}:
                  <NuxtTime :datetime="key.lastUsedAt" class="font-medium" />
                </span>
                <span v-if="key.expiresAt" class="hidden sm:inline">•</span>
                <span v-if="key.expiresAt" class="truncate">
                  {{ t('admin.apiKeys.expires') }}:
                  <NuxtTime :datetime="key.expiresAt" class="font-medium" />
                </span>
              </div>
            </div>
          </button>
          
          <div
            v-if="expandedApiKeys.has(key.identifier)"
            class="border-t border-default bg-muted/30 p-4 space-y-3"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('admin.users.apiKeys.apiKeyData') }}</p>
                <UButton
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-copy"
                  @click.stop="copyApiKeyJson(key)"
                >
                  {{ t('admin.users.apiKeys.copyJson') }}
                </UButton>
              </div>
              <pre class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"><code>{{ formatApiKeyJson(getFullApiKeyData(key)) }}</code></pre>
            </div>
            <div class="flex justify-end">
              <UButton
                color="error"
                icon="i-lucide-trash-2"
                variant="ghost"
                size="sm"
                :loading="isDeletingApiKey && apiKeyToDelete?.id === key.id"
                :disabled="isDeletingApiKey"
                :aria-label="t('admin.users.apiKeys.deleteApiKey')"
                @click.stop="openApiKeyDeleteModal(key)"
              >
                {{ t('admin.users.apiKeys.deleteKey') }}
              </UButton>
            </div>
          </div>
        </div>
        <div v-if="apiKeysPagination && apiKeysPagination.totalPages > 1" class="flex items-center justify-between border-t border-default pt-4">
          <div class="text-sm text-muted-foreground">
            {{ t('admin.users.apiKeys.showingApiKeys', { 
              start: ((apiKeysPagination.page - 1) * apiKeysPagination.perPage) + 1,
              end: Math.min(apiKeysPagination.page * apiKeysPagination.perPage, apiKeysPagination.total),
              total: apiKeysPagination.total
            }) }}
          </div>
          <UPagination
            v-model:page="apiKeysPage"
            :total="apiKeysPagination.total"
            :items-per-page="apiKeysPagination.perPage"
            size="sm"
          />
        </div>
      </div>
    </UCard>

    <UModal
      v-model:open="showApiKeyDeleteModal"
      :title="t('admin.users.apiKeys.deleteApiKey')"
      :description="t('admin.users.apiKeys.deleteApiKeyDescription')"
      :ui="{ footer: 'flex justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle">
            <template #title>{{ t('common.warning') }}</template>
            <template #description>
              {{ t('admin.users.apiKeys.confirmDeleteApiKeyDescription') }}
            </template>
          </UAlert>
          <div v-if="apiKeyToDelete" class="rounded-md bg-muted p-3">
            <p class="text-sm font-medium">{{ t('admin.users.apiKeys.keyIdentifier') }}:</p>
            <code class="text-sm font-mono mt-1">{{ apiKeyToDelete.identifier }}</code>
            <p v-if="apiKeyToDelete.memo" class="text-sm text-muted-foreground mt-2">
              {{ t('common.description') }}: {{ apiKeyToDelete.memo }}
            </p>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="isDeletingApiKey"
          @click="() => {
            showApiKeyDeleteModal = false
            apiKeyToDelete = null
            close()
          }"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          :loading="isDeletingApiKey"
          :disabled="isDeletingApiKey"
          @click="confirmApiKeyDelete"
        >
          {{ t('admin.users.apiKeys.deleteKey') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
