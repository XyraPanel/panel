<script setup lang="ts">
import type { PanelInformation } from '#shared/types/admin'

const { t } = useI18n()

const {
  data,
  pending,
  error,
} = await useFetch('/api/admin/panel/information', {
  key: 'admin-panel-information',
  server: false,
})

const info = computed(() => (data.value as PanelInformation | null) ?? null)

const detailRows = computed(() => {
  const panelInfo = info.value
  return [
    {
      key: 'panelVersion',
      label: t('admin.settings.panelInfo.panelVersion'),
      value: panelInfo?.panelVersion ?? t('common.unknown'),
      highlight: true,
    },
    {
      key: 'latestPanelVersion',
      label: t('admin.settings.panelInfo.latestPanelVersion'),
      value: panelInfo?.latestPanelVersion ?? t('admin.settings.panelInfo.versionUnavailable'),
      highlight: true,
    },
  ]
})

const resourceLinks = computed(() => {
  const panelInfo = info.value
  if (!panelInfo) {
    return []
  }

  return [
    panelInfo.releaseNotesUrl && {
      key: 'releaseNotes',
      label: t('admin.settings.panelInfo.releaseNotes'),
      icon: 'i-lucide-newspaper',
      url: panelInfo.releaseNotesUrl,
    },
    panelInfo.documentationUrl && {
      key: 'documentation',
      label: t('admin.settings.panelInfo.documentation'),
      icon: 'i-lucide-book-open-text',
      url: panelInfo.documentationUrl,
    },
    panelInfo.supportUrl && {
      key: 'support',
      label: t('admin.settings.panelInfo.support'),
      icon: 'i-lucide-message-square',
      url: panelInfo.supportUrl,
    },
    panelInfo.repositoryUrl && {
      key: 'repository',
      label: t('admin.settings.panelInfo.github'),
      icon: 'i-lucide-github',
      url: panelInfo.repositoryUrl,
    },
    panelInfo.donationsUrl && {
      key: 'donate',
      label: t('admin.settings.panelInfo.donate'),
      icon: 'i-lucide-heart-handshake',
      url: panelInfo.donationsUrl,
    },
  ].filter(Boolean) as { key: string; label: string; icon: string; url: string }[]
})
</script>

<template>
  <UCard :ui="{ body: 'space-y-5' }">
    <template #header>
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('admin.settings.panelInfo.title') }}</p>
      </div>
    </template>

    <div v-if="pending" class="grid gap-4 md:grid-cols-3">
      <USkeleton v-for="i in 3" :key="`panel-info-skeleton-${i}`" class="h-16 rounded-lg" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-alert-circle"
      :title="t('admin.settings.panelInfo.failedToLoad')"
    >
      {{ (error as Error).message }}
    </UAlert>

    <div v-else class="space-y-5">
      <div class="grid gap-4 md:grid-cols-3">
        <div
          v-for="row in detailRows"
          :key="row.key"
          class="rounded-lg border border-default bg-muted/30 p-4"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ row.label }}</p>
          <p
            class="mt-1 font-mono text-sm"
            :class="row.highlight ? 'text-primary' : 'text-foreground'"
          >
            {{ row.value }}
          </p>
        </div>
      </div>

      <div v-if="resourceLinks.length" class="flex flex-wrap gap-2">
        <UButton
          v-for="link in resourceLinks"
          :key="link.key"
          size="sm"
          variant="outline"
          color="neutral"
          :icon="link.icon"
          :label="link.label"
          :to="link.url"
          target="_blank"
          rel="noopener"
        />
      </div>

      <div class="text-xs text-muted-foreground flex items-center gap-1">
        <span>{{ t('admin.settings.panelInfo.lastChecked') }}</span>
        <NuxtTime
          v-if="info?.lastCheckedAt"
          :datetime="info.lastCheckedAt"
          class="font-mono text-foreground"
          :seconds="false"
        />
        <span v-else>{{ t('common.unknown') }}</span>
      </div>
    </div>
  </UCard>
</template>
