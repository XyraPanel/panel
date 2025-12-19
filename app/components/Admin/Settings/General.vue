<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { GeneralSettings } from '#shared/types/admin'
import * as uiLocales from '@nuxt/ui/locale'

const { t } = useI18n()
const toast = useToast()
const isSubmitting = ref(false)

const availableLocales = computed(() => {
  try {
    return Object.values(uiLocales) || []
  }
  catch {
    return []
  }
})
type LocaleValue = string

const timezoneEnumValues = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
] as const
type TimezoneValue = (typeof timezoneEnumValues)[number]
const timezoneOptions = [
  { label: 'UTC', value: timezoneEnumValues[0] },
  { label: 'America/New_York', value: timezoneEnumValues[1] },
  { label: 'America/Los_Angeles', value: timezoneEnumValues[2] },
  { label: 'Europe/London', value: timezoneEnumValues[3] },
  { label: 'Europe/Paris', value: timezoneEnumValues[4] },
  { label: 'Asia/Tokyo', value: timezoneEnumValues[5] },
] satisfies { label: string; value: TimezoneValue }[]

const baseSchema = z.object({
  locale: z.string(),
  timezone: z.enum(timezoneEnumValues, { message: t('admin.settings.generalSettings.timezoneInvalid') }),
  showBrandLogo: z.boolean(),
  brandLogoUrl: z.preprocess(
    (value) => {
      if (value === '' || value === undefined)
        return null
      return value
    },
    z.string().trim().pipe(z.url(t('validation.invalidUrl'))).nullable(),
  ),
  paginationLimit: z.number()
    .int(t('admin.settings.generalSettings.paginationLimitInt'))
    .min(10, t('admin.settings.generalSettings.paginationLimitMin'))
    .max(100, t('admin.settings.generalSettings.paginationLimitMax')),
  telemetryEnabled: z.boolean(),
})

const schema = computed(() => {
  return baseSchema.extend({
    locale: z.string().refine(
      (val) => availableLocales.value.some(locale => locale.code === val),
      { message: t('admin.settings.generalSettings.languageInvalid') }
    ),
  })
})

type FormSchema = z.infer<typeof baseSchema> & {
  locale: string
}

const { data: settings, refresh } = await useAsyncData(
  'admin-settings-general',
  async () => {
    const response = await fetch('/api/admin/settings/general')
    if (!response.ok) {
      throw new Error(`Failed to fetch general settings: ${response.statusText}`)
    }
    return await response.json() as GeneralSettings
  },
)

function resolveLocale(value: string | null | undefined): LocaleValue {
  const defaultLocale = availableLocales.value.find(locale => locale.code === 'en')?.code || availableLocales.value[0]?.code || 'en'
  return (availableLocales.value.some(locale => locale.code === value) ? value : defaultLocale) as LocaleValue
}

function resolveTimezone(value: string | null | undefined): TimezoneValue {
  return (timezoneEnumValues.includes(value as TimezoneValue) ? value : timezoneEnumValues[0]) as TimezoneValue
}

function createFormState(source?: GeneralSettings | null): FormSchema {
  return {
    locale: resolveLocale(source?.locale),
    timezone: resolveTimezone(source?.timezone),
    showBrandLogo: source?.showBrandLogo ?? false,
    brandLogoUrl: source?.brandLogoUrl ?? null,
    paginationLimit: source?.paginationLimit ?? 25,
    telemetryEnabled: source?.telemetryEnabled ?? true,
  }
}

const form = reactive<FormSchema>(createFormState(settings.value))

const logoFile = ref<File | null>(null)
const logoUploading = ref(false)

watch(settings, (newSettings) => {
  Object.assign(form, createFormState(newSettings ?? null))
})

watch(logoFile, async (file) => {
  if (!file)
    return

  logoUploading.value = true
  try {
    const body = new FormData()
    body.append('logo', file)

    const response = await $fetch<{ url: string }>('/api/admin/settings/branding/logo', {
      method: 'POST',
      body,
    })

    form.brandLogoUrl = response.url
    form.showBrandLogo = true

    toast.add({
      title: t('admin.settings.generalSettings.logoUploaded'),
      description: t('admin.settings.generalSettings.logoUploadedDescription'),
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('admin.settings.generalSettings.uploadFailed'),
      description: err.data?.message || t('admin.settings.generalSettings.uploadFailedDescription'),
      color: 'error',
    })
  }
  finally {
    logoUploading.value = false
    logoFile.value = null
  }
})

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
    })

    form.brandLogoUrl = null
    form.showBrandLogo = false

    toast.add({
      title: t('admin.settings.generalSettings.logoRemoved'),
      description: t('admin.settings.generalSettings.logoRemovedDescription'),
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('admin.settings.generalSettings.logoRemoveFailed'),
      description: err.data?.message || t('admin.settings.generalSettings.logoRemoveFailed'),
      color: 'error',
    })
  }
}

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value)
    return

  isSubmitting.value = true

  try {
    const payload = {
      ...event.data,
      brandLogoUrl: event.data.brandLogoUrl ?? null,
    }

    await $fetch('/api/admin/settings/general', {
      method: 'PATCH',
      body: payload as Record<string, unknown>,
    })

    Object.assign(form, payload)

    toast.add({
      title: t('admin.settings.generalSettings.settingsUpdated'),
      description: t('admin.settings.generalSettings.settingsUpdatedDescription'),
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('admin.settings.generalSettings.updateFailed'),
      description: err.data?.message || t('admin.settings.generalSettings.updateFailed'),
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
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
        <USelect v-model="form.timezone" :items="timezoneOptions" value-key="value" :disabled="isSubmitting" />
      </UFormField>

      <UFormField :label="t('admin.settings.generalSettings.paginationLimit')" name="paginationLimit" required>
        <UInput v-model.number="form.paginationLimit" type="number" min="10" max="100" :disabled="isSubmitting" class="w-full max-w-32" />
        <template #description>
          <span class="text-xs text-muted-foreground">{{ t('admin.settings.generalSettings.paginationLimitDescription') }}</span>
        </template>
      </UFormField>

      <USeparator />

      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-medium">{{ t('admin.settings.generalSettings.branding') }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('admin.settings.generalSettings.brandingDescription') }}</p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('admin.settings.generalSettings.showBrandLogo')" name="showBrandLogo">
            <div class="flex items-center justify-between rounded-lg border border-default p-3">
              <p class="text-sm text-muted-foreground">{{ t('admin.settings.generalSettings.showBrandLogoDescription') }}</p>
              <USwitch v-model="form.showBrandLogo" />
            </div>
          </UFormField>
        </div>

        <div class="space-y-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">{{ t('admin.settings.generalSettings.logo') }}</p>
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-3">
              <UAvatar :src="form.brandLogoUrl || undefined" icon="i-lucide-image" size="lg" />
              <div class="text-xs text-muted-foreground">
                <p v-if="form.brandLogoUrl">{{ t('admin.settings.generalSettings.currentLogo') }}</p>
                <p v-else>{{ t('admin.settings.generalSettings.noLogoUploaded') }}</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UFileUpload v-model="logoFile" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                class="w-56" :label="t('admin.settings.generalSettings.uploadLogo')" :description="t('admin.settings.generalSettings.logoDescription')"
                :disabled="logoUploading" />
              <UButton v-if="form.brandLogoUrl" variant="ghost" color="error" size="sm" icon="i-lucide-trash"
                @click="removeLogo">
                {{ t('admin.settings.generalSettings.removeLogo') }}
              </UButton>
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground">{{ t('admin.settings.generalSettings.logoStoredAt') }}</p>
        </div>
      </div>

      <USeparator />

      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-medium">{{ t('admin.settings.generalSettings.system') }}</h3>
        </div>

        <UFormField name="telemetryEnabled">
          <USwitch v-model="form.telemetryEnabled" :label="t('admin.settings.generalSettings.enableTelemetry')" :disabled="isSubmitting" />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton type="submit" color="primary" variant="subtle" :loading="isSubmitting" :disabled="isSubmitting">
          {{ t('admin.settings.generalSettings.saveChanges') }}
        </UButton>
      </div>
  </UForm>
</template>
