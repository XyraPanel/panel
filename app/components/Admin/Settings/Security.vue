<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { SecuritySettings } from '#shared/types/admin'

const { t } = useI18n()
const toast = useToast()
const isSubmitting = ref(false)

const rawSchema = z.object({
  enforceTwoFactor: z.boolean(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().trim().max(500, t('admin.settings.securitySettings.maintenanceMessageMaxLength')),
  announcementEnabled: z.boolean(),
  announcementMessage: z.string().trim().max(500, t('admin.settings.securitySettings.announcementMessageMaxLength')),
})

const schema = rawSchema.superRefine((data, ctx) => {
  if (data.maintenanceMode && data.maintenanceMessage.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maintenanceMessage'],
      message: t('admin.settings.securitySettings.maintenanceMessageRequired'),
    })
  }

  if (data.announcementEnabled && data.announcementMessage.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['announcementMessage'],
      message: t('admin.settings.securitySettings.announcementMessageRequired'),
    })
  }
})

type FormSchema = z.infer<typeof schema>

function createFormState(source?: SecuritySettings | null): FormSchema {
  return {
    enforceTwoFactor: source?.enforceTwoFactor ?? false,
    maintenanceMode: source?.maintenanceMode ?? false,
    maintenanceMessage: source?.maintenanceMessage ?? '',
    announcementEnabled: source?.announcementEnabled ?? false,
    announcementMessage: source?.announcementMessage ?? '',
  }
}

const { data: settings, refresh } = await useFetch<SecuritySettings>('/api/admin/settings/security', {
  key: 'admin-settings-security',
})

const form = reactive<FormSchema>(createFormState(settings.value))

watch(settings, (value) => {
  if (!value)
    return

  Object.assign(form, createFormState(value))
})

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value)
    return

  isSubmitting.value = true

  const payload: FormSchema = {
    ...event.data,
    maintenanceMessage: event.data.maintenanceMode ? event.data.maintenanceMessage : event.data.maintenanceMessage || '',
    announcementMessage: event.data.announcementEnabled ? event.data.announcementMessage : event.data.announcementMessage || '',
  }

  try {
    await $fetch('/api/admin/settings/security', {
      method: 'patch',
      body: payload,
    })

    Object.assign(form, payload)

    toast.add({
      title: t('admin.settings.securitySettings.settingsSaved'),
      description: t('admin.settings.securitySettings.settingsSavedDescription'),
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('admin.settings.securitySettings.updateFailed'),
      description: err.data?.message || t('admin.settings.securitySettings.updateFailedDescription'),
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
      <h2 class="text-lg font-semibold">{{ t('admin.settings.securitySettings.title') }}</h2>
    </template>

    <UForm
      :schema="schema"
      :state="form"
      class="space-y-6"
      :disabled="isSubmitting"
      :validate-on="['input']"
      @submit="handleSubmit"
    >
      <div class="space-y-3">
        <UFormField name="enforceTwoFactor">
          <USwitch v-model="form.enforceTwoFactor" :label="t('admin.settings.securitySettings.enforceTwoFactor')" :disabled="isSubmitting" />
        </UFormField>
      </div>

      <div class="space-y-3">
        <UFormField name="maintenanceMode">
          <USwitch v-model="form.maintenanceMode" :label="t('admin.settings.securitySettings.maintenanceMode')" :disabled="isSubmitting" />
        </UFormField>

        <transition name="fade">
          <UFormField v-if="form.maintenanceMode" :label="t('admin.settings.securitySettings.maintenanceMessage')" name="maintenanceMessage">
            <UTextarea v-model="form.maintenanceMessage" :placeholder="t('admin.settings.securitySettings.maintenanceMessagePlaceholder')" :rows="3"
              :disabled="isSubmitting" class="w-full" />
          </UFormField>
        </transition>
      </div>

      <div class="space-y-3">
        <UFormField name="announcementEnabled">
          <USwitch v-model="form.announcementEnabled" :label="t('admin.settings.securitySettings.announcementEnabled')" :disabled="isSubmitting" />
        </UFormField>

        <transition name="fade">
          <UFormField v-if="form.announcementEnabled" :label="t('admin.settings.securitySettings.announcementMessage')" name="announcementMessage">
            <UTextarea v-model="form.announcementMessage" :placeholder="t('admin.settings.securitySettings.announcementMessagePlaceholder')" :rows="3"
              :disabled="isSubmitting" class="w-full" />
          </UFormField>
        </transition>
      </div>

      <div class="flex justify-end">
        <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
          {{ t('admin.settings.securitySettings.saveChanges') }}
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>
