<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import type { SecuritySettings } from '#shared/types/admin';
import { securitySettingsFormSchema } from '#shared/schema/admin/settings';
import type { SecuritySettingsFormInput } from '#shared/schema/admin/settings';

const { t } = useI18n();
const toast = useToast();
const isSubmitting = ref(false);

const schema = securitySettingsFormSchema.superRefine((data, ctx) => {
  if (data.maintenanceMode && data.maintenanceMessage.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['maintenanceMessage'],
      message: t('admin.settings.securitySettings.maintenanceMessageRequired'),
    });
  }

  if (data.announcementEnabled && data.announcementMessage.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['announcementMessage'],
      message: t('admin.settings.securitySettings.announcementMessageRequired'),
    });
  }
});

type FormSchema = SecuritySettingsFormInput;

function createFormState(source?: SecuritySettings | null): FormSchema {
  return {
    enforceTwoFactor: source?.enforceTwoFactor ?? false,
    maintenanceMode: source?.maintenanceMode ?? false,
    maintenanceMessage: source?.maintenanceMessage ?? '',
    announcementEnabled: source?.announcementEnabled ?? false,
    announcementMessage: source?.announcementMessage ?? '',
    sessionTimeoutMinutes: source?.sessionTimeoutMinutes ?? 60,
    queueConcurrency: source?.queueConcurrency ?? 4,
    queueRetryLimit: source?.queueRetryLimit ?? 5,
  };
}

const { data: settings, refresh } = await useFetch<SecuritySettings>(
  '/api/admin/settings/security',
  {
    key: 'admin-settings-security',
  },
);

const form = reactive<FormSchema>(createFormState(settings.value));

watch(settings, (value) => {
  if (!value) return;

  Object.assign(form, createFormState(value));
});

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  const payload: FormSchema = {
    ...event.data,
    maintenanceMessage: event.data.maintenanceMode
      ? event.data.maintenanceMessage
      : event.data.maintenanceMessage || '',
    announcementMessage: event.data.announcementEnabled
      ? event.data.announcementMessage
      : event.data.announcementMessage || '',
  };

  try {
    await $fetch('/api/admin/settings/security', {
      method: 'patch',
      body: payload,
    });

    Object.assign(form, payload);

    toast.add({
      title: t('admin.settings.securitySettings.settingsSaved'),
      description: t('admin.settings.securitySettings.settingsSavedDescription'),
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('admin.settings.securitySettings.updateFailed'),
      description:
        err.data?.message || t('admin.settings.securitySettings.updateFailedDescription'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="form"
    class="space-y-6"
    :disabled="isSubmitting"
    :validate-on="['input']"
    @submit="handleSubmit"
  >
    <div class="space-y-3">
      <UFormField
        :label="t('admin.settings.securitySettings.enforceTwoFactor')"
        name="enforceTwoFactor"
      >
        <USwitch
          v-model="form.enforceTwoFactor"
          :label="t('admin.settings.securitySettings.enforceTwoFactor')"
          :disabled="isSubmitting"
        />
      </UFormField>
    </div>

    <div class="space-y-3">
      <UFormField
        :label="t('admin.settings.securitySettings.maintenanceMode')"
        name="maintenanceMode"
      >
        <USwitch
          v-model="form.maintenanceMode"
          :label="t('admin.settings.securitySettings.maintenanceMode')"
          :disabled="isSubmitting"
        />
      </UFormField>

      <transition name="fade">
        <UFormField
          v-if="form.maintenanceMode"
          :label="t('admin.settings.securitySettings.maintenanceMessage')"
          name="maintenanceMessage"
        >
          <UTextarea
            v-model="form.maintenanceMessage"
            :placeholder="t('admin.settings.securitySettings.maintenanceMessagePlaceholder')"
            :rows="3"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>
      </transition>
    </div>

    <div class="space-y-3">
      <UFormField
        :label="t('admin.settings.securitySettings.announcementEnabled')"
        name="announcementEnabled"
      >
        <USwitch
          v-model="form.announcementEnabled"
          :label="t('admin.settings.securitySettings.announcementEnabled')"
          :disabled="isSubmitting"
        />
      </UFormField>

      <transition name="fade">
        <UFormField
          v-if="form.announcementEnabled"
          :label="t('admin.settings.securitySettings.announcementMessage')"
          name="announcementMessage"
        >
          <UTextarea
            v-model="form.announcementMessage"
            :placeholder="t('admin.settings.securitySettings.announcementMessagePlaceholder')"
            :rows="3"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>
      </transition>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">
        {{ t('admin.settings.securitySettings.sessionsQueue') }}
      </h3>
      <div class="grid gap-4 md:grid-cols-3">
        <UFormField
          :label="t('admin.settings.securitySettings.sessionTimeout')"
          name="sessionTimeoutMinutes"
          required
        >
          <UInput
            v-model.number="form.sessionTimeoutMinutes"
            type="number"
            min="5"
            max="1440"
            suffix="min"
            :disabled="isSubmitting"
            class="w-full"
          />
          <template #description>
            <span class="text-xs text-muted-foreground">{{
              t('admin.settings.securitySettings.sessionTimeoutDescription')
            }}</span>
          </template>
        </UFormField>

        <UFormField
          :label="t('admin.settings.securitySettings.queueConcurrency')"
          name="queueConcurrency"
          required
        >
          <UInput
            v-model.number="form.queueConcurrency"
            type="number"
            min="1"
            max="32"
            :disabled="isSubmitting"
            class="w-full"
          />
          <template #description>
            <span class="text-xs text-muted-foreground">{{
              t('admin.settings.securitySettings.queueConcurrencyDescription')
            }}</span>
          </template>
        </UFormField>

        <UFormField
          :label="t('admin.settings.securitySettings.queueRetryLimit')"
          name="queueRetryLimit"
          required
        >
          <UInput
            v-model.number="form.queueRetryLimit"
            type="number"
            min="1"
            max="50"
            :disabled="isSubmitting"
            class="w-full"
          />
          <template #description>
            <span class="text-xs text-muted-foreground">{{
              t('admin.settings.securitySettings.queueRetryLimitDescription')
            }}</span>
          </template>
        </UFormField>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        variant="subtle"
        :loading="isSubmitting"
        :disabled="isSubmitting"
      >
        {{ t('admin.settings.securitySettings.saveChanges') }}
      </UButton>
    </div>
  </UForm>
</template>
