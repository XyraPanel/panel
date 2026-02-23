<script setup lang="ts">
import { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import type { GeneralSettings } from '#shared/types/admin';
import * as uiLocales from '@nuxt/ui/locale';
import { generalSettingsFormSchema } from '#shared/schema/admin/settings';
import type { GeneralSettingsFormInput } from '#shared/schema/admin/settings';

const { t } = useI18n();
const toast = useToast();
const requestFetch = useRequestFetch();
const isSubmitting = ref(false);

const availableLocales = computed(() => {
  try {
    return Object.values(uiLocales) || [];
  } catch {
    return [];
  }
});
type LocaleValue = string;

const timezoneEnumValues = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
];
type TimezoneValue = string;
const timezoneOptions = timezoneEnumValues.map((value) => ({ label: value, value }));

const schema = computed(() =>
  generalSettingsFormSchema.extend({
    locale: z
      .string()
      .refine((val) => availableLocales.value.some((locale) => locale.code === val), {
        message: t('admin.settings.generalSettings.languageInvalid'),
      }),
    timezone: z.string().refine((val) => timezoneEnumValues.includes(val as TimezoneValue), {
      message: t('admin.settings.generalSettings.timezoneInvalid'),
    }),
  }),
);

type FormSchema = GeneralSettingsFormInput;

const { data: settings, refresh } = await useAsyncData('admin-settings-general-form', async () => {
  return await requestFetch<GeneralSettings>('/api/admin/settings/general');
});

function resolveLocale(value: string | null | undefined): LocaleValue {
  const defaultLocale =
    availableLocales.value.find((locale) => locale.code === 'en')?.code ||
    availableLocales.value[0]?.code ||
    'en';
  return (
    availableLocales.value.some((locale) => locale.code === value) ? value : defaultLocale
  ) as LocaleValue;
}

function resolveTimezone(value: string | null | undefined): TimezoneValue {
  return (
    timezoneEnumValues.includes(value as TimezoneValue) ? value : timezoneEnumValues[0]
  ) as TimezoneValue;
}

function createFormState(source?: GeneralSettings | null): FormSchema {
  return {
    locale: resolveLocale(source?.locale),
    timezone: resolveTimezone(source?.timezone),
    showBrandLogo: source?.showBrandLogo ?? false,
    brandLogoUrl: source?.brandLogoUrl ?? null,
    paginationLimit: source?.paginationLimit ?? 25,
    telemetryEnabled: source?.telemetryEnabled ?? true,
  };
}

const form = reactive<FormSchema>(createFormState(settings.value));

const logoFile = ref<File | null>(null);
const logoUploading = ref(false);

watch(settings, (newSettings) => {
  Object.assign(form, createFormState(newSettings ?? null));
});

watch(logoFile, async (file) => {
  if (!file) return;

  logoUploading.value = true;
  try {
    const body = new FormData();
    body.append('logo', file);

    const response = await fetch('/api/admin/settings/branding/logo', {
      method: 'POST',
      body,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }

    const data = (await response.json()) as { url: string };
    form.brandLogoUrl = data.url;
    form.showBrandLogo = true;

    toast.add({
      title: t('admin.settings.generalSettings.logoUploaded'),
      description: t('admin.settings.generalSettings.logoUploadedDescription'),
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t('admin.settings.generalSettings.uploadFailedDescription');
    toast.add({
      title: t('admin.settings.generalSettings.uploadFailed'),
      description: message,
      color: 'error',
    });
  } finally {
    logoUploading.value = false;
    logoFile.value = null;
  }
});

async function removeLogo() {
  try {
    await fetch('/api/admin/settings/general', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brandLogoUrl: null,
        showBrandLogo: false,
      }),
    });

    form.brandLogoUrl = null;
    form.showBrandLogo = false;

    toast.add({
      title: t('admin.settings.generalSettings.logoRemoved'),
      description: t('admin.settings.generalSettings.logoRemovedDescription'),
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('admin.settings.generalSettings.logoRemoveFailed'),
      description: err.data?.message || t('admin.settings.generalSettings.logoRemoveFailed'),
      color: 'error',
    });
  }
}

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    const payload = {
      ...event.data,
      brandLogoUrl: event.data.brandLogoUrl ?? null,
    };

    await $fetch('/api/admin/settings/general', {
      method: 'PATCH',
      body: payload as Record<string, unknown>,
    });

    Object.assign(form, payload);

    toast.add({
      title: t('admin.settings.generalSettings.settingsUpdated'),
      description: t('admin.settings.generalSettings.settingsUpdatedDescription'),
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('admin.settings.generalSettings.updateFailed'),
      description: err.data?.message || t('admin.settings.generalSettings.updateFailed'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <UForm
    ref="generalSettingsForm"
    :schema="schema"
    :state="form"
    class="space-y-4"
    :disabled="isSubmitting"
    :validate-on="['input']"
    @submit="handleSubmit"
  >
    <UFormField :label="t('admin.settings.generalSettings.language')" name="locale" required>
      <ULocaleSelect
        v-model="form.locale"
        :locales="availableLocales"
        :disabled="isSubmitting"
        class="w-full"
      />
    </UFormField>

    <UFormField :label="t('admin.settings.generalSettings.timezone')" name="timezone" required>
      <USelect
        v-model="form.timezone"
        :items="timezoneOptions"
        value-key="value"
        :disabled="isSubmitting"
      />
    </UFormField>

    <UFormField
      :label="t('admin.settings.generalSettings.paginationLimit')"
      name="paginationLimit"
      required
    >
      <UInput
        v-model.number="form.paginationLimit"
        type="number"
        min="10"
        max="100"
        :disabled="isSubmitting"
        class="w-full max-w-32"
      />
      <template #description>
        <span class="text-xs text-muted-foreground">{{
          t('admin.settings.generalSettings.paginationLimitDescription')
        }}</span>
      </template>
    </UFormField>

    <USeparator />

    <div class="space-y-4">
      <div>
        <h3 class="text-sm font-medium">{{ t('admin.settings.generalSettings.branding') }}</h3>
        <p class="text-xs text-muted-foreground">
          {{ t('admin.settings.generalSettings.brandingDescription') }}
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.settings.generalSettings.showBrandLogo')" name="showBrandLogo">
          <div class="flex items-center justify-between rounded-lg border border-default p-3">
            <p class="text-sm text-muted-foreground">
              {{ t('admin.settings.generalSettings.showBrandLogoDescription') }}
            </p>
            <USwitch
              v-model="form.showBrandLogo"
              :label="t('admin.settings.generalSettings.showBrandLogo')"
            />
          </div>
        </UFormField>

        <div class="space-y-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {{ t('admin.settings.generalSettings.logo') }}
          </p>
          <div class="flex items-center gap-3">
            <UAvatar :src="form.brandLogoUrl || undefined" icon="i-lucide-image" size="xl" />
            <div class="text-xs text-muted-foreground">
              <p v-if="form.brandLogoUrl" class="font-medium">
                {{ t('admin.settings.generalSettings.currentLogo') }}
              </p>
              <p v-else class="font-medium">
                {{ t('admin.settings.generalSettings.noLogoUploaded') }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <UFileUpload
          v-model="logoFile"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
          class="w-full"
          :label="t('admin.settings.generalSettings.uploadLogo')"
          :description="t('admin.settings.generalSettings.logoDescription')"
          :disabled="logoUploading"
        />
        <div class="flex items-center justify-between">
          <p class="text-[11px] text-muted-foreground">
            {{ t('admin.settings.generalSettings.logoStoredAt') }}
          </p>
          <UButton
            v-if="form.brandLogoUrl"
            variant="ghost"
            color="error"
            size="sm"
            icon="i-lucide-trash"
            @click="removeLogo"
          >
            {{ t('admin.settings.generalSettings.removeLogo') }}
          </UButton>
        </div>
      </div>
    </div>

    <USeparator />

    <div class="space-y-4">
      <div>
        <h3 class="text-sm font-medium">{{ t('admin.settings.generalSettings.system') }}</h3>
      </div>

      <UFormField
        :label="t('admin.settings.generalSettings.enableTelemetry')"
        name="telemetryEnabled"
      >
        <USwitch
          v-model="form.telemetryEnabled"
          :label="t('admin.settings.generalSettings.enableTelemetry')"
          :disabled="isSubmitting"
        />
      </UFormField>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        variant="subtle"
        :loading="isSubmitting"
        :disabled="isSubmitting"
      >
        {{ t('admin.settings.generalSettings.saveChanges') }}
      </UButton>
    </div>
  </UForm>
</template>
