<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { AccountActivityResponse } from '#shared/types/account'

definePageMeta({
  auth: true,
})

const { t } = useI18n()
const {
  data: activityResponse,
  pending: loading,
  error: fetchError,
  refresh: refreshActivity,
} = await useFetch<AccountActivityResponse>('/api/account/activity', {
  key: 'account-activity',
})

let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refreshInterval = setInterval(() => {
    refreshActivity()
  }, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

const entries = computed(() => activityResponse.value?.data ?? [])
const generatedAt = computed(() => activityResponse.value?.generatedAt ?? null)
const generatedAtDate = computed(() => (generatedAt.value ? new Date(generatedAt.value) : null))
const error = computed(() => {
  if (!fetchError.value) return null
  return fetchError.value instanceof Error ? fetchError.value.message : t('account.activity.failedToLoad')
})

const expandedEntries = ref<Set<string>>(new Set())
const toast = useToast()

function toggleEntry(id: string) {
  if (expandedEntries.value.has(id)) {
    expandedEntries.value.delete(id)
  } else {
    expandedEntries.value.add(id)
  }
}

function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return 'null'
  return JSON.stringify(data, null, 2)
}

function getFullAuditData(entry: typeof entries.value[0]) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    metadata: entry.metadata,
  }
}

async function copyJson(entry: typeof entries.value[0]) {
  const json = formatJson(getFullAuditData(entry))
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
      title: t('account.activity.copiedToClipboard'),
      description: t('account.activity.copiedToClipboardDescription'),
    })
  } catch (error) {
    toast.add({
      title: t('account.activity.failedToCopy'),
      description: error instanceof Error ? error.message : t('account.activity.failedToCopyDescription'),
      color: 'error',
    })
  }
}

</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader :title="t('account.activity.title')">
        <template #description>
          <span>
            {{ t('account.activity.descriptionWithTime') }}
            <NuxtTime
              v-if="generatedAtDate"
              :datetime="generatedAtDate"
              relative
              class="font-medium"
            />
            <span v-else>{{ t('account.activity.recently') }}</span>
          </span>
        </template>
      </UPageHeader>
    </UContainer>

    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <h2 class="text-lg font-semibold">{{ t('account.activity.recentActivity') }}</h2>
          </template>

          <template v-if="loading">
            <div class="space-y-2">
              <USkeleton v-for="i in 5" :key="`activity-skeleton-${i}`" class="h-14 w-full" />
            </div>
          </template>
          <template v-else-if="error">
            <div class="rounded-lg border border-dashed border-default p-4 text-sm text-destructive">
              {{ error }}
            </div>
          </template>
          <UEmpty
            v-else-if="entries.length === 0"
            icon="i-lucide-activity"
            :title="t('account.activity.noActivity')"
            :description="t('account.activity.noActivityDescription')"
            variant="subtle"
          />
          <template v-else>
            <div class="space-y-3">
              <div
                v-for="entry in entries"
                :key="entry.id"
                class="rounded-lg border border-default overflow-hidden"
              >
                <button
                  class="w-full flex flex-col gap-2 p-3 text-left hover:bg-elevated/50 transition-colors md:flex-row md:items-center md:justify-between"
                  @click="toggleEntry(entry.id)"
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium font-mono">{{ entry.action }}</p>
                      <UIcon
                        :name="expandedEntries.has(entry.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                        class="size-4 text-muted-foreground shrink-0"
                      />
                    </div>
                    <p v-if="entry.target && !entry.target.startsWith('user#')" class="text-xs text-muted-foreground mt-1">
                      {{ entry.target }}
                    </p>
                  </div>
                  <div class="text-xs text-muted-foreground shrink-0">
                    <NuxtTime :datetime="entry.occurredAt" relative />
                  </div>
                </button>
                
                <div
                  v-if="expandedEntries.has(entry.id)"
                  class="border-t border-default bg-muted/30 p-4"
                >
                  <div class="space-y-2">
                    <div class="flex items-center justify-between mb-2">
                      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('account.activity.auditLogEntry') }}</p>
                      <UButton
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-copy"
                        @click.stop="copyJson(entry)"
                      >
                        {{ t('account.activity.copyJSON') }}
                      </UButton>
                    </div>
                    <pre class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"><code>{{ formatJson(getFullAuditData(entry)) }}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
