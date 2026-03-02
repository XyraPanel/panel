<script setup lang="ts">
import { computed } from 'vue';

const { t } = useI18n();
const maintenance = useMaintenanceStatus();
const { locale, uiLocales, handleLocaleChange } = useLocaleSwitcher();

const { data: maintenanceStatus } = maintenance;

const isMaintenanceMode = computed(() => maintenanceStatus.value?.maintenanceMode ?? false);
const maintenanceMessage = computed(
  () =>
    maintenanceStatus.value?.maintenanceMessage?.trim() || t('layout.defaultMaintenanceMessage'),
);

const currentYear = computed(() => new Date().getFullYear());
</script>

<template>
  <div class="relative min-h-screen">
    <UContainer class="min-h-screen flex items-center justify-center py-12">
      <div class="w-full max-w-md space-y-4">
        <UAlert
          v-if="isMaintenanceMode"
          color="warning"
          variant="subtle"
          icon="i-lucide-construction"
        >
          <template #title>{{ t('layout.underMaintenance') }}</template>
          <template #description>
            <span class="whitespace-pre-wrap">{{ maintenanceMessage }}</span>
          </template>
        </UAlert>

        <UCard
          :ui="{
            body: 'space-y-6',
            header: 'text-center space-y-2',
          }"
        >
          <slot />
          <p class="text-center text-xs text-muted-foreground">
            {{ t('layout.copyright', { year: currentYear }) }}
            <ULink to="https://xyrapanel.com/" target="_blank">XyraPanel</ULink>
          </p>
        </UCard>
      </div>
    </UContainer>

    <div class="fixed bottom-6 right-6 z-30">
      <ULocaleSelect
        :model-value="locale"
        :locales="uiLocales"
        size="sm"
        variant="soft"
        class="w-40 shadow-lg"
        @update:model-value="handleLocaleChange($event)"
      />
    </div>
  </div>
</template>
