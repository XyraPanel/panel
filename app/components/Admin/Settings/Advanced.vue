<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdvancedSettings } from '#shared/types/admin'

const { t } = useI18n()
const toast = useToast()
const isSubmitting = ref(false)

const schema = z.object({
  telemetryEnabled: z.boolean(),
  debugMode: z.boolean(),
  recaptchaEnabled: z.boolean(),
  recaptchaSiteKey: z.string().trim().max(255),
  recaptchaSecretKey: z.string().trim().max(255),
  sessionTimeoutMinutes: z.number(t('admin.settings.advancedSettings.sessionTimeoutRequired'))
    .int(t('admin.settings.advancedSettings.sessionTimeoutInt'))
    .min(5, t('admin.settings.advancedSettings.sessionTimeoutMin'))
    .max(1440, t('admin.settings.advancedSettings.sessionTimeoutMax')),
  queueConcurrency: z.number(t('admin.settings.advancedSettings.queueConcurrencyRequired'))
    .int(t('admin.settings.advancedSettings.queueConcurrencyInt'))
    .min(1, t('admin.settings.advancedSettings.queueConcurrencyMin'))
    .max(32, t('admin.settings.advancedSettings.queueConcurrencyMax')),
  queueRetryLimit: z.number(t('admin.settings.advancedSettings.queueRetryLimitRequired'))
    .int(t('admin.settings.advancedSettings.queueRetryLimitInt'))
    .min(1, t('admin.settings.advancedSettings.queueRetryLimitMin'))
    .max(50, t('admin.settings.advancedSettings.queueRetryLimitMax')),
  paginationLimit: z.number(t('admin.settings.advancedSettings.paginationLimitRequired'))
    .int(t('admin.settings.advancedSettings.paginationLimitInt'))
    .min(10, t('admin.settings.advancedSettings.paginationLimitMin'))
    .max(100, t('admin.settings.advancedSettings.paginationLimitMax')),
}).superRefine((data, ctx) => {
  if (data.recaptchaEnabled) {
    if (data.recaptchaSiteKey.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recaptchaSiteKey'],
        message: t('admin.settings.advancedSettings.siteKeyRequired'),
      })
    }
    if (data.recaptchaSecretKey.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recaptchaSecretKey'],
        message: t('admin.settings.advancedSettings.secretKeyRequired'),
      })
    }
  }
})

type FormSchema = z.infer<typeof schema>

function createFormState(source?: AdvancedSettings | null): FormSchema {
  return {
    telemetryEnabled: source?.telemetryEnabled ?? true,
    debugMode: source?.debugMode ?? false,
    recaptchaEnabled: source?.recaptchaEnabled ?? false,
    recaptchaSiteKey: source?.recaptchaSiteKey ?? '',
    recaptchaSecretKey: source?.recaptchaSecretKey ?? '',
    sessionTimeoutMinutes: source?.sessionTimeoutMinutes ?? 60,
    queueConcurrency: source?.queueConcurrency ?? 4,
    queueRetryLimit: source?.queueRetryLimit ?? 5,
    paginationLimit: source?.paginationLimit ?? 25,
  }
}

async function fetchAdvancedSettings(): Promise<AdvancedSettings> {
  const response = await fetch('/api/admin/settings/advanced')
  if (!response.ok) {
    throw new Error(`Failed to fetch advanced settings: ${response.statusText}`)
  }
  return await response.json()
}

const { data: settings, refresh } = await useLazyAsyncData('admin-settings-advanced', fetchAdvancedSettings)

const form = reactive<FormSchema>(createFormState(settings.value))

const showRecaptchaFields = computed(() => form.recaptchaEnabled)

watch(settings, (newSettings) => {
  if (!newSettings)
    return

  Object.assign(form, createFormState(newSettings))
})

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value)
    return

  isSubmitting.value = true

  const payload: FormSchema = {
    ...event.data,
    recaptchaSiteKey: event.data.recaptchaEnabled ? event.data.recaptchaSiteKey : '',
    recaptchaSecretKey: event.data.recaptchaEnabled ? event.data.recaptchaSecretKey : '',
  }

  try {
    const response = await fetch('/api/admin/settings/advanced', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Failed to update settings: ${response.statusText}`)
    }

    Object.assign(form, payload)

    toast.add({
      title: t('admin.settings.advancedSettings.settingsUpdated'),
      description: t('admin.settings.advancedSettings.settingsUpdatedDescription'),
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('admin.settings.advancedSettings.updateFailed'),
      description: err.data?.message || t('admin.settings.advancedSettings.updateFailed'),
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">{{ t('admin.settings.advancedSettings.title') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('admin.settings.advancedSettings.description') }}</p>
    </template>

    <UForm
      :schema="schema"
      :state="form"
      class="space-y-6"
      :disabled="isSubmitting"
      :validate-on="['input']"
      @submit="handleSubmit"
    >

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">{{ t('admin.settings.advancedSettings.system') }}</h3>

        <UFormField name="telemetryEnabled">
          <USwitch v-model="form.telemetryEnabled" :label="t('admin.settings.advancedSettings.enableTelemetry')" :disabled="isSubmitting" />
        </UFormField>

        <UFormField name="debugMode">
          <USwitch v-model="form.debugMode" :label="t('admin.settings.advancedSettings.enableDebugMode')" :description="t('admin.settings.advancedSettings.debugModeDescription')" :disabled="isSubmitting" />
        </UFormField>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">{{ t('admin.settings.advancedSettings.recaptcha') }}</h3>

        <UFormField name="recaptchaEnabled">
          <USwitch
            v-model="form.recaptchaEnabled"
            :label="t('admin.settings.advancedSettings.enableRecaptcha')"
            :description="t('admin.settings.advancedSettings.recaptchaDescription')"
            :disabled="isSubmitting"
          />
        </UFormField>

        <div v-if="showRecaptchaFields" class="space-y-4">
          <UFormField :label="t('admin.settings.advancedSettings.siteKey')" name="recaptchaSiteKey" required>
            <UInput v-model="form.recaptchaSiteKey" :placeholder="t('admin.settings.advancedSettings.siteKeyPlaceholder')" :disabled="isSubmitting" class="w-full" />
            <template #help>
              {{ t('admin.settings.advancedSettings.getKeysFrom') }} <a href="https://www.google.com/recaptcha/admin" target="_blank"
                class="text-primary hover:underline">Google reCAPTCHA</a>
            </template>
          </UFormField>

          <UFormField :label="t('admin.settings.advancedSettings.secretKey')" name="recaptchaSecretKey" required>
            <UInput v-model="form.recaptchaSecretKey" type="password" :placeholder="t('admin.settings.advancedSettings.secretKeyPlaceholder')" :disabled="isSubmitting" class="w-full" />
          </UFormField>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">{{ t('admin.settings.advancedSettings.sessionsQueue') }}</h3>
        <div class="grid gap-4 md:grid-cols-3">
          <UFormField :label="t('admin.settings.advancedSettings.sessionTimeout')" name="sessionTimeoutMinutes" required>
            <UInput v-model.number="form.sessionTimeoutMinutes" type="number" min="5" max="1440"
              suffix="min" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground">{{ t('admin.settings.advancedSettings.sessionTimeoutDescription') }}</span>
            </template>
          </UFormField>

          <UFormField :label="t('admin.settings.advancedSettings.queueConcurrency')" name="queueConcurrency" required>
            <UInput v-model.number="form.queueConcurrency" type="number" min="1" max="32" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground">{{ t('admin.settings.advancedSettings.queueConcurrencyDescription') }}</span>
            </template>
          </UFormField>

          <UFormField :label="t('admin.settings.advancedSettings.queueRetryLimit')" name="queueRetryLimit" required>
            <UInput v-model.number="form.queueRetryLimit" type="number" min="1" max="50" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground">{{ t('admin.settings.advancedSettings.queueRetryLimitDescription') }}</span>
            </template>
          </UFormField>

          <UFormField :label="t('admin.settings.advancedSettings.paginationLimit')" name="paginationLimit" required>
            <UInput v-model.number="form.paginationLimit" type="number" min="10" max="100" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground">{{ t('admin.settings.advancedSettings.paginationLimitDescription') }}</span>
            </template>
          </UFormField>
        </div>
      </div>

      <div class="flex justify-end">
        <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
          {{ t('admin.settings.advancedSettings.saveChanges') }}
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>
