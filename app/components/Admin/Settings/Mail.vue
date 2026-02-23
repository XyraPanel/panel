<script setup lang="ts">
import type { FormSubmitEvent, SelectItem } from '@nuxt/ui';
import type { MailSettings } from '#shared/types/admin';
import { mailSettingsFormSchema } from '#shared/schema/admin/settings';
import type { MailSettingsFormInput } from '#shared/schema/admin/settings';

const { t } = useI18n();
const toast = useToast();
const isSubmitting = ref(false);
const isTesting = ref(false);

const driverEnumValues = ['smtp', 'sendmail', 'mailgun'] as const;
type DriverValue = (typeof driverEnumValues)[number];
const driverOptions = [
  { label: 'SMTP', value: driverEnumValues[0] },
  { label: 'Sendmail', value: driverEnumValues[1] },
  { label: 'Mailgun', value: driverEnumValues[2] },
] satisfies { label: string; value: DriverValue }[];

const encryptionEnumValues = ['tls', 'ssl', 'none'] as const;
type EncryptionValue = (typeof encryptionEnumValues)[number];
const encryptionOptions = [
  { label: 'TLS', value: encryptionEnumValues[0] },
  { label: 'SSL', value: encryptionEnumValues[1] },
  { label: 'None', value: encryptionEnumValues[2] },
] satisfies { label: string; value: EncryptionValue }[];

const CUSTOM_SERVICE_VALUE = 'custom';
const serviceEnumValues = [
  CUSTOM_SERVICE_VALUE,
  'gmail',
  'outlook365',
  'yahoo',
  'zoho',
  'ses',
  'sendgrid',
  'mailgun',
  'postmark',
  'sendinblue',
  'mailjet',
  'mailtrap',
  'proton',
] as const;

const schema = mailSettingsFormSchema.superRefine((data, ctx) => {
  const usingService = data.service !== CUSTOM_SERVICE_VALUE;

  if (data.driver !== 'sendmail' && !usingService) {
    if (data.host.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['host'],
        message: t('admin.settings.mailSettings.smtpHostRequired'),
      });
    }

    if (data.port.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['port'],
        message: t('admin.settings.mailSettings.smtpPortRequired'),
      });
    }
  }

  if (data.port.length > 0 && !usingService) {
    if (!/^\d+$/.test(data.port)) {
      ctx.addIssue({
        code: 'custom',
        path: ['port'],
        message: t('admin.settings.mailSettings.smtpPortNumeric'),
      });
    } else {
      const port = Number.parseInt(data.port, 10);
      if (Number.isNaN(port) || port <= 0 || port > 65535) {
        ctx.addIssue({
          code: 'custom',
          path: ['port'],
          message: t('admin.settings.mailSettings.smtpPortRange'),
        });
      }
    }
  }
});

type FormSchema = MailSettingsFormInput;

function createFormState(source?: MailSettings | null): FormSchema {
  const normalizedService =
    source?.service && (serviceEnumValues as readonly string[]).includes(source.service)
      ? (source.service as (typeof serviceEnumValues)[number])
      : CUSTOM_SERVICE_VALUE;

  return {
    driver: (source?.driver as DriverValue | undefined) ?? 'smtp',
    service: normalizedService,
    host: source?.host ?? '',
    port: source?.port ?? '587',
    username: source?.username ?? '',
    password: source?.password ?? '',
    encryption: (source?.encryption as EncryptionValue | undefined) ?? 'tls',
    fromAddress: source?.fromAddress ?? '',
    fromName: source?.fromName ?? '',
  };
}

const { data: settings, refresh } = await useFetch<MailSettings>('/api/admin/settings/mail', {
  key: 'admin-settings-mail',
});

const form = reactive<FormSchema>(createFormState(settings.value));
const serviceOptions: SelectItem[] = [
  { label: t('admin.settings.mailSettings.customService'), value: CUSTOM_SERVICE_VALUE },
  { label: 'Gmail / Google Workspace', value: 'gmail' },
  { label: 'Microsoft 365 / Outlook', value: 'outlook365' },
  { label: 'Yahoo Mail', value: 'yahoo' },
  { label: 'Zoho Mail', value: 'zoho' },
  { label: 'Amazon SES', value: 'ses' },
  { label: 'SendGrid', value: 'sendgrid' },
  { label: 'Mailgun', value: 'mailgun' },
  { label: 'Postmark', value: 'postmark' },
  { label: 'Brevo (Sendinblue)', value: 'sendinblue' },
  { label: 'Mailjet', value: 'mailjet' },
  { label: 'Mailtrap', value: 'mailtrap' },
  { label: 'Proton Mail', value: 'proton' },
];

const disableSmtpFields = computed(
  () => form.driver === 'sendmail' || form.service !== CUSTOM_SERVICE_VALUE,
);

watch(settings, (newSettings) => {
  if (!newSettings) return;

  Object.assign(form, createFormState(newSettings));
});

watch(
  () => form.driver,
  (driver) => {
    if (driver !== 'smtp') form.service = CUSTOM_SERVICE_VALUE;
  },
);

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  const isPresetService = event.data.service !== CUSTOM_SERVICE_VALUE;
  const payload: FormSchema = {
    ...event.data,
    service: isPresetService ? event.data.service : CUSTOM_SERVICE_VALUE,
    host: event.data.driver === 'sendmail' || isPresetService ? '' : event.data.host,
    port: event.data.driver === 'sendmail' || isPresetService ? '' : event.data.port,
  };

  const persistedService = isPresetService ? event.data.service : '';

  try {
    await $fetch('/api/admin/settings/mail', {
      method: 'patch',
      body: {
        ...payload,
        service: persistedService,
      },
    });

    Object.assign(form, {
      ...payload,
      service: isPresetService ? event.data.service : CUSTOM_SERVICE_VALUE,
    });

    toast.add({
      title: t('admin.settings.mailSettings.settingsUpdated'),
      description: t('admin.settings.mailSettings.settingsUpdatedDescription'),
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('admin.settings.mailSettings.updateFailed'),
      description: err.data?.message || t('admin.settings.mailSettings.updateFailed'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleTestEmail() {
  if (isTesting.value || isSubmitting.value) return;

  isTesting.value = true;

  try {
    await $fetch('/api/admin/settings/mail/test', {
      method: 'POST',
    });

    toast.add({
      title: t('admin.settings.mailSettings.testEmailSent'),
      description: t('admin.settings.mailSettings.testEmailSentDescription'),
      color: 'success',
    });
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('admin.settings.mailSettings.testEmailFailed'),
      description: err.data?.message || t('admin.settings.mailSettings.testEmailFailed'),
      color: 'error',
    });
  } finally {
    isTesting.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex justify-end mb-4">
      <UButton
        icon="i-lucide-mail"
        color="primary"
        variant="soft"
        :loading="isTesting"
        :disabled="isTesting || isSubmitting"
        @click="handleTestEmail"
      >
        {{ t('admin.settings.mailSettings.sendTestEmail') }}
      </UButton>
    </div>

    <UForm
      :schema="schema"
      :state="form"
      class="space-y-4"
      :disabled="isSubmitting"
      :validate-on="['input']"
      @submit="handleSubmit"
    >
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.settings.mailSettings.mailDriver')" name="driver" required>
          <USelect
            v-model="form.driver"
            :items="driverOptions"
            value-key="value"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.settings.mailSettings.encryption')" name="encryption" required>
          <USelect
            v-model="form.encryption"
            :items="encryptionOptions"
            value-key="value"
            :disabled="isSubmitting || disableSmtpFields"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField
          :label="t('admin.settings.mailSettings.service')"
          name="service"
          class="md:col-span-2"
        >
          <USelect
            v-model="form.service"
            :items="serviceOptions"
            value-key="value"
            :disabled="isSubmitting || form.driver !== 'smtp'"
            class="w-full"
            :ui="{
              content: 'min-w-[20rem]',
              itemLabel: 'whitespace-normal',
              item: 'items-start whitespace-normal',
            }"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.settings.mailSettings.smtpHost')" name="host" required>
          <UInput
            v-model="form.host"
            :placeholder="t('admin.settings.mailSettings.smtpHostPlaceholder')"
            :disabled="isSubmitting || disableSmtpFields"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.settings.mailSettings.smtpPort')" name="port" required>
          <UInput
            v-model="form.port"
            type="number"
            :placeholder="t('admin.settings.mailSettings.smtpPortPlaceholder')"
            :disabled="isSubmitting || disableSmtpFields"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.settings.mailSettings.username')" name="username">
          <UInput
            v-model="form.username"
            :placeholder="t('admin.settings.mailSettings.usernamePlaceholder')"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.settings.mailSettings.password')" name="password">
          <UInput
            v-model="form.password"
            type="password"
            :placeholder="t('auth.password')"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField
          :label="t('admin.settings.mailSettings.fromAddress')"
          name="fromAddress"
          required
        >
          <UInput
            v-model="form.fromAddress"
            type="email"
            :placeholder="t('admin.settings.mailSettings.fromAddressPlaceholder')"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.settings.mailSettings.fromName')" name="fromName" required>
          <UInput
            v-model="form.fromName"
            :placeholder="t('admin.settings.mailSettings.fromNamePlaceholder')"
            :disabled="isSubmitting"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          type="submit"
          color="primary"
          variant="subtle"
          :loading="isSubmitting"
          :disabled="isSubmitting || isTesting"
        >
          {{ t('admin.settings.mailSettings.saveChanges') }}
        </UButton>
      </div>
    </UForm>
  </div>
</template>
