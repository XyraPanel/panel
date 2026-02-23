<script setup lang="ts">
import type { PanelInformation } from '#shared/types/admin';

const { t } = useI18n();

const { data, pending, error } = await useFetch<{ data: PanelInformation } | null>(
  '/api/admin/panel/information',
  {
    key: 'admin-panel-information',
  },
);

const info = computed<PanelInformation | null>(() => data.value?.data ?? null);

const releaseNotesOpen = ref(false);
const releaseNotesLoading = ref(false);
const releaseVersions = ref<Array<{ title: string; description: string; date?: string }>>([]);
const releaseNotesError = ref(false);
type ReleaseData = {
  name?: string;
  tag_name?: string;
  body?: string;
  description?: string;
  markdown?: string;
  tag?: string;
  publishedAt?: string;
  createdAt?: string;
};

function isReleaseData(value: unknown): value is ReleaseData {
  return Boolean(value) && typeof value === 'object';
}

function isReleaseDataArray(value: unknown): value is ReleaseData[] {
  return Array.isArray(value) && value.every(isReleaseData);
}

function normalizeReleasePayload(value: unknown): ReleaseData | ReleaseData[] | string | null {
  if (typeof value === 'string' || value === null) {
    return value;
  }
  if (isReleaseDataArray(value)) {
    return value;
  }
  if (isReleaseData(value)) {
    return value;
  }
  return null;
}

const detailRows = computed(() => {
  const panelInfo = info.value;
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
  ];
});

const resourceLinks = computed(() => {
  const panelInfo = info.value;
  if (!panelInfo) {
    return [];
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
  ].filter(Boolean) as { key: string; label: string; icon: string; url: string }[];
});

async function openReleaseNotes(url: string) {
  releaseNotesOpen.value = true;
  releaseNotesLoading.value = true;
  releaseVersions.value = [];
  releaseNotesError.value = false;
  try {
    const fetchExternal = $fetch as (
      input: string,
      init?: Record<string, unknown>,
    ) => Promise<unknown>;
    let data: ReleaseData | ReleaseData[] | string | null = null;
    try {
      data = normalizeReleasePayload(await fetchExternal(url));
    } catch (err) {
      if (url.includes('/releases') && !url.includes('/latest')) {
        const latestUrl = url.endsWith('/') ? `${url}latest` : `${url}/latest`;
        data = normalizeReleasePayload(await fetchExternal(latestUrl));
      } else {
        throw err;
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      releaseVersions.value = data.map((release: ReleaseData) => ({
        title: release.name || release.tag_name || release.tag || 'Release',
        description: release.markdown || release.body || release.description || '',
        date: release.publishedAt || release.createdAt,
      }));
    } else if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      ('name' in data || 'tag_name' in data || 'tag' in data)
    ) {
      const release = data as ReleaseData;
      releaseVersions.value = [
        {
          title: release.name || release.tag_name || release.tag || 'Release',
          description: release.markdown || release.body || release.description || '',
          date: release.publishedAt || release.createdAt,
        },
      ];
    } else if (typeof data === 'string') {
      releaseNotesError.value = true;
    } else {
      releaseNotesError.value = true;
    }
  } catch (err) {
    console.error('Failed to load release notes:', err);
    releaseNotesError.value = true;
  } finally {
    releaseNotesLoading.value = false;
  }
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-5' }">
    <template #header>
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('admin.settings.panelInfo.title') }}
        </p>
      </div>
    </template>

    <div v-if="pending" class="grid gap-4 md:grid-cols-2">
      <USkeleton v-for="i in 2" :key="`panel-info-skeleton-${i}`" class="h-16 rounded-lg" />
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
      <div class="grid gap-4 md:grid-cols-2">
        <div
          v-for="row in detailRows"
          :key="row.key"
          class="rounded-lg border border-default bg-muted/30 p-4"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ row.label }}
          </p>
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
          :to="link.key === 'releaseNotes' ? undefined : link.url"
          :target="link.key === 'releaseNotes' ? undefined : '_blank'"
          :rel="link.key === 'releaseNotes' ? undefined : 'noopener'"
          :loading="link.key === 'releaseNotes' && releaseNotesLoading"
          @click="link.key === 'releaseNotes' ? openReleaseNotes(link.url) : undefined"
        />
      </div>

      <UModal
        v-model:open="releaseNotesOpen"
        :title="t('admin.settings.panelInfo.releaseNotes')"
        scrollable
      >
        <template #body>
          <div class="p-4">
            <div v-if="releaseNotesLoading" class="text-muted-foreground text-center py-8">
              {{ t('common.loading') }}
            </div>
            <div v-else-if="releaseNotesError" class="text-muted-foreground text-center py-8">
              {{ t('admin.settings.panelInfo.releaseNotesUnavailable') }}
            </div>
            <UChangelogVersions v-else-if="releaseVersions.length" :versions="releaseVersions" />
            <div v-else class="text-muted-foreground text-center py-8">
              {{ t('admin.settings.panelInfo.releaseNotesUnavailable') }}
            </div>
          </div>
        </template>
      </UModal>

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
