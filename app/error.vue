<script setup lang="ts">
import { clearError, useRequestURL } from '#app';
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();
const requestURL = useRequestURL();
const { t } = useI18n();

const headline = computed(() => {
  if (props.error.statusCode === 404) return t('errors.pageNotFound');
  return t('errors.unexpectedPanelError');
});

const description = computed(() => {
  if (props.error.statusCode === 404) {
    const url = requestURL.href;
    if (url.includes('/api/')) {
      return t('errors.apiEndpointNotFound');
    }
    if (url.includes('/server/')) {
      return t('errors.serverPageNotFound');
    }
    return t('errors.pageNotFoundDescription');
  }
  if (props.error.statusCode === 401) {
    return t('errors.authenticationRequired');
  }
  if (props.error.statusCode === 500) {
    return t('errors.internalServerError');
  }
  return props.error.statusMessage || t('errors.noAdditionalContext');
});

const requestedUrl = computed(() => {
  const dataUrl = (props.error.data as { url?: string } | undefined)?.url;
  return dataUrl ?? requestURL.href;
});

interface QuickLink {
  label: string;
  icon: string;
  to?: string;
  action?: () => void;
}

const quickLinks = computed<QuickLink[]>(() => [
  {
    label: t('errors.goBack'),
    icon: 'i-lucide-arrow-left',
    action: () => {
      if (import.meta.client && window.history.length > 1) {
        window.history.back();
      } else {
        clearError({ redirect: '/' });
      }
    },
  },
  { label: t('errors.adminDashboard'), icon: 'i-lucide-layout-dashboard', to: '/admin' },
  { label: t('errors.home'), icon: 'i-lucide-home', to: '/' },
]);

const handleReset = () => clearError({ redirect: '/' });
</script>

<template>
  <UPage>
    <UContainer class="min-h-screen flex items-center justify-center py-12">
      <section class="mx-auto max-w-xl text-center">
        <UCard :ui="{ body: 'space-y-4' }">
          <div class="flex flex-col items-center gap-2">
            <h1 class="text-2xl font-semibold">{{ headline }}</h1>
            <p class="text-sm text-muted-foreground">{{ description }}</p>
          </div>
          <div
            class="rounded-md border border-default bg-muted/40 px-4 py-3 text-xs text-muted-foreground"
          >
            {{ t('errors.requestedResource') }} <code>{{ requestedUrl }}</code>
          </div>
          <div class="flex flex-wrap justify-center gap-2">
            <UButton
              v-for="link in quickLinks"
              :key="link.label"
              :icon="link.icon"
              :to="link.to"
              color="primary"
              variant="subtle"
              @click="link.action ? link.action() : undefined"
            >
              {{ link.label }}
            </UButton>
            <UButton
              icon="i-lucide-refresh-ccw"
              variant="ghost"
              color="neutral"
              @click="handleReset"
            >
              {{ t('errors.tryAgain') }}
            </UButton>
          </div>
        </UCard>
      </section>
    </UContainer>
  </UPage>
</template>
