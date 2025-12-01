<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminActivityEntry, AuditEventsPayload } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Audit log',
  adminSubtitle: 'Track panel-wide events mirrored from Wings',
})

const limit = ref(100)
const page = ref(1)
const allActivities = ref<AdminActivityEntry[]>([])
const loadedPages = ref<Set<number>>(new Set())

const {
  data,
  pending,
  error: fetchError,
  refresh,
} = await useFetch<AuditEventsPayload>('/api/admin/audit', {
  query: computed(() => ({ limit: limit.value, page: page.value })),
  key: 'admin-activity',
})

watch(data, (newData: AuditEventsPayload | null) => {
  if (newData?.data) {
    if (page.value === 1) {
      allActivities.value = newData.data
      loadedPages.value = new Set([1])
    } else if (!loadedPages.value.has(page.value)) {
      allActivities.value = [...allActivities.value, ...newData.data]
      loadedPages.value.add(page.value)
    } else {
      const startIndex = (page.value - 1) * limit.value
      allActivities.value.splice(startIndex, newData.data.length, ...newData.data)
    }
  }
}, { immediate: true })

const activities = computed<AdminActivityEntry[]>(() => allActivities.value)
const pagination = computed(() => data.value?.pagination)
const hasMore = computed(() => Boolean(pagination.value?.hasMore))

async function loadMore() {
  if (!hasMore.value || pending.value) return
  page.value += 1
  await refresh()
}

const { t } = useI18n()
const error = computed(() => {
  if (!fetchError.value) return null
  return fetchError.value instanceof Error ? fetchError.value.message : t('admin.activity.failedToLoadAuditEvents')
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

function getFullAuditData(entry: typeof activities.value[0]) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    details: entry.details,
  }
}

async function copyJson(entry: typeof activities.value[0]) {
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
      title: t('admin.activity.copiedToClipboard'),
      description: t('admin.activity.auditLogJsonCopied'),
    })
  } catch (error) {
    toast.add({
      title: t('admin.activity.failedToCopy'),
      description: error instanceof Error ? error.message : t('common.failedToCopy'),
      color: 'error',
    })
  }
}

function convertToCsv(data: AdminActivityEntry[]) {
  if (!data.length) return ''

  const rows = data.map(entry => ({
    id: entry.id,
    occurredAt: entry.occurredAt,
    actor: entry.actorDisplay || entry.actor,
    actorUserId: entry.actorUserId || '',
    actorEmail: entry.actorEmail || '',
    action: entry.action,
    target: entry.target,
    details: JSON.stringify(entry.details),
  }))

  const headers = rows.length > 0 && rows[0] ? Object.keys(rows[0]).join(',') : ''
  const values = rows
    .map(row =>
      Object.values(row)
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n')

  return headers + '\n' + values
}

function exportCsv() {
  if (activities.value.length === 0) {
    toast.add({
      title: 'No data to export',
      description: 'There are no audit events to export.',
      color: 'warning',
    })
    return
  }

  try {
    const csv = convertToCsv(activities.value)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    const timestamp = new Date().toISOString().split('T')[0]
    link.setAttribute('download', `audit-log-${timestamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.add({
      title: 'Export successful',
      description: `Exported ${activities.value.length} audit events to CSV.`,
    })
  } catch (error) {
    toast.add({
      title: 'Export failed',
      description: error instanceof Error ? error.message : 'Unable to export CSV.',
      color: 'error',
    })
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="space-y-1">
                  <h2 class="text-lg font-semibold">Recent activity</h2>
                  <p v-if="pagination" class="text-xs text-muted-foreground">
                    Showing {{ activities.length }} of {{ pagination.total }} events
                    <span v-if="hasMore">{{ t('admin.activity.loadMoreToSeeAdditional') }}</span>
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge v-if="pending" color="primary" variant="soft">Loading</UBadge>
                  <UButton
                    icon="i-lucide-download"
                    color="primary"
                    variant="subtle"
                    :disabled="pending || activities.length === 0"
                    @click="exportCsv"
                  >
                    Export CSV
                  </UButton>
                </div>
              </div>
            </template>

            <template v-if="pending">
              <div class="space-y-2">
                <USkeleton v-for="i in 5" :key="`activity-skeleton-${i}`" class="h-14 w-full" />
              </div>
            </template>
            <template v-else-if="error">
              <UAlert color="error" icon="i-lucide-alert-triangle">
                <template #title>Unable to load audit events</template>
                <template #description>{{ error }}</template>
              </UAlert>
            </template>
            <UEmpty
              v-else-if="activities.length === 0"
              icon="i-lucide-activity"
              :title="t('admin.activity.noActivityYet')"
              :description="t('admin.activity.noActivityYetDescription')"
              variant="subtle"
            />
            <template v-else>
              <div class="space-y-3">
                <div
                  v-for="entry in activities"
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
                      <div class="mt-1 flex flex-wrap items-center gap-2">
                        <span class="text-xs text-muted-foreground">
                          {{ t('admin.activity.actor') }}: 
                          <NuxtLink
                            v-if="entry.actorUserId"
                            :to="`/admin/users/${entry.actorUserId}`"
                            class="font-medium text-primary hover:underline"
                            @click.stop
                          >
                            {{ entry.actorDisplay || entry.actor }}
                          </NuxtLink>
                          <span v-else class="font-medium">{{ entry.actorDisplay || entry.actor }}</span>
                        </span>
                        <span v-if="entry.target && !entry.target.startsWith('user#')" class="text-xs text-muted-foreground">
                          {{ t('admin.activity.target') }}: <span class="font-medium">{{ entry.target }}</span>
                        </span>
                      </div>
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
                        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('admin.activity.auditLogEntry') }}</p>
                        <UButton
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-copy"
                          @click.stop="copyJson(entry)"
                        >
                          {{ t('admin.activity.copyJson') }}
                        </UButton>
                      </div>
                      <pre class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"><code>{{ formatJson(getFullAuditData(entry)) }}</code></pre>
                    </div>
                  </div>
                </div>
              </div>
              
              <div v-if="hasMore" class="flex justify-center pt-4">
                <UButton
                  variant="outline"
                  color="primary"
                  :loading="pending"
                  :disabled="pending"
                  @click="loadMore"
                >
                  {{ t('admin.activity.loadMore') }}
                </UButton>
              </div>
            </template>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
