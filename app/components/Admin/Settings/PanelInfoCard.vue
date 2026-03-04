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
const releaseVersions = ref<Array<{ title: string; content: string; badge?: any; date?: string; }>>([]);
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
    const { marked } = await import('marked');
    const fetchExternal = $fetch as (
      input: string,
      init?: Record<string, unknown>,
    ) => Promise<unknown>;
    
    let fetchUrl = url.trim();
    if (fetchUrl.startsWith('https://github.com/')) {
      fetchUrl = fetchUrl.replace('https://github.com/', 'https://api.github.com/repos/');
    }

    let releasePayload: ReleaseData | ReleaseData[] | string | null = null;
    try {
      releasePayload = normalizeReleasePayload(await fetchExternal(fetchUrl));
    } catch (err) {
      if (fetchUrl.includes('/releases') && !fetchUrl.includes('/latest')) {
        const latestUrl = fetchUrl.endsWith('/') ? `${fetchUrl}latest` : `${fetchUrl}/latest`;
        releasePayload = normalizeReleasePayload(await fetchExternal(latestUrl));
      } else {
        throw err;
      }
    }

    if (Array.isArray(releasePayload) && releasePayload.length > 0) {
      const parsedVersions = [];
      const currentVersion = info.value?.panelVersion;
      
      const latestRelease = releasePayload[0];
      const currentRelease = releasePayload.find(
        (r: ReleaseData) => (r.tag_name === currentVersion || r.name === currentVersion || r.tag === currentVersion)
      );

      const targetReleases = [latestRelease as ReleaseData];
      if (currentRelease && currentRelease !== latestRelease) {
        targetReleases.push(currentRelease as ReleaseData);
      }

      for (const release of targetReleases) {
         if (!release) continue;
         let rawMarkdown = release.markdown || release.body || release.description || '';
         rawMarkdown = rawMarkdown.replace(/\[compare changes\]\([^)]+\)/gi, '').replace(/compare changes/gi, '').trim();
         
         parsedVersions.push({
           title: release.name || release.tag_name || release.tag || 'Release',
           date: release.publishedAt || release.createdAt,
           badge: { label: 'Release', color: 'primary', variant: 'outline' },
           content: (await marked.parse(rawMarkdown)).replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" '),
         });
      }
      releaseVersions.value = parsedVersions;
    } else if (
      releasePayload &&
      typeof releasePayload === 'object' &&
      !Array.isArray(releasePayload) &&
      ('name' in releasePayload || 'tag_name' in releasePayload || 'tag' in releasePayload)
    ) {
      const release = releasePayload as ReleaseData;
      let rawMarkdown = release.markdown || release.body || release.description || '';
      rawMarkdown = rawMarkdown.replace(/\[compare changes\]\([^)]+\)/gi, '').replace(/compare changes/gi, '').trim();
      releaseVersions.value = [
        {
          title: release.name || release.tag_name || release.tag || 'Release',
          date: release.publishedAt || release.createdAt,
          badge: { label: 'Release', color: 'primary', variant: 'outline' },
          content: (await marked.parse(rawMarkdown)).replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" '),
        },
      ];
    } else if (typeof releasePayload === 'string') {
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
            <UChangelogVersions v-else-if="releaseVersions.length" :versions="releaseVersions" :indicator="false">
              <template #body="{ version }">
                <div class="text-[13px] text-muted-foreground [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-[var(--ui-primary)] [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_a]:text-[var(--ui-primary)] [&_a]:font-medium hover:[&_a]:opacity-80 [&_p]:my-1" v-html="version.content" />
              </template>
            </UChangelogVersions>
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
