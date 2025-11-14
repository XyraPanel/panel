<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTimeAgo } from '@vueuse/core'
import type { AccountActivityItem, AccountActivityResponse } from '#shared/types/activity'

definePageMeta({
  auth: true,
})

const entries = ref<AccountActivityItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const generatedAt = ref<string | null>(null)

const requestFetch = useRequestFetch()

const generatedAgo = useTimeAgo(() => (generatedAt.value ? new Date(generatedAt.value) : new Date(0)))
const generatedAgoText = computed(() => (generatedAt.value ? generatedAgo.value : 'Not generated yet'))

async function fetchActivity() {
  loading.value = true
  error.value = null
  try {
    const response = await requestFetch<AccountActivityResponse>('/api/account/activity')
    entries.value = response.data
    generatedAt.value = response.generatedAt
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load account activity.'
  }
  finally {
    loading.value = false
  }
}

fetchActivity()

function formatTarget(target: string | null) {
  return target ?? 'No target recorded'
}

function timeAgoFor(entry: AccountActivityItem) {
  return useTimeAgo(() => new Date(entry.occurredAt)).value
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Account activity"
      :description="`Personal actions you've taken across XyraPanel. Use this log to verify recent changes and sign-ins. Updated ${generatedAgoText}`"
    >
      <template #actions>
        <UButton variant="soft" color="neutral" :loading="loading" @click="fetchActivity">
          Refresh
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <UCard :ui="{ body: 'space-y-3' }">
        <template #header>
          <h2 class="text-lg font-semibold">Recent activity</h2>
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
          title="No activity yet"
          description="Your account activity will appear here"
          variant="subtle"
        />
        <template v-else>
          <div class="space-y-3">
            <div
              v-for="entry in entries"
              :key="entry.id"
              class="flex flex-col gap-2 rounded-lg border border-default p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p class="text-sm font-medium">{{ entry.action }}</p>
                <p class="text-xs text-muted-foreground">{{ formatTarget(entry.target) }}</p>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ timeAgoFor(entry) }}
              </div>
            </div>
          </div>
        </template>
      </UCard>
    </UPageBody>
  </UPage>
</template>
