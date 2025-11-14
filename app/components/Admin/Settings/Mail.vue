<script setup lang="ts">
import type { MailSettings } from '#shared/types/admin-settings'

const toast = useToast()
const isSubmitting = ref(false)
const isTesting = ref(false)

const { data: settings, refresh } = await useFetch<MailSettings>('/api/admin/settings/mail', {
  key: 'admin-settings-mail',
})

const form = reactive({
  driver: settings.value?.driver || 'smtp',
  host: settings.value?.host || '',
  port: settings.value?.port || '587',
  username: settings.value?.username || '',
  password: settings.value?.password || '',
  encryption: settings.value?.encryption || 'tls',
  fromAddress: settings.value?.fromAddress || '',
  fromName: settings.value?.fromName || '',
})

watch(settings, (newSettings) => {
  if (newSettings) {
    Object.assign(form, newSettings)
  }
})

async function handleSubmit() {
  isSubmitting.value = true

  try {
    await $fetch('/api/admin/settings/mail', {
      method: 'PATCH',
      body: form,
    })

    toast.add({
      title: 'Settings updated',
      description: 'Mail settings have been saved successfully',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update settings',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}

async function handleTestEmail() {
  isTesting.value = true

  try {
    await $fetch('/api/admin/settings/mail/test', {
      method: 'POST',
    })

    toast.add({
      title: 'Test email sent',
      description: 'Check your inbox for the test email',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to send test email',
      color: 'error',
    })
  }
  finally {
    isTesting.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold">Mail Settings</h2>
          <p class="text-sm text-muted-foreground">Configure SMTP settings for email notifications</p>
        </div>
        <UButton icon="i-lucide-mail" color="primary" variant="soft" :loading="isTesting"
          :disabled="isTesting || isSubmitting" @click="handleTestEmail">
          Send Test Email
        </UButton>
      </div>
    </template>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Mail Driver" name="driver" required>
          <USelect v-model="form.driver" :items="[
            { label: 'SMTP', value: 'smtp' },
            { label: 'Sendmail', value: 'sendmail' },
            { label: 'Mailgun', value: 'mailgun' },
          ]" value-key="value" :disabled="isSubmitting" />
        </UFormField>

        <UFormField label="Encryption" name="encryption" required>
          <USelect v-model="form.encryption" :items="[
            { label: 'TLS', value: 'tls' },
            { label: 'SSL', value: 'ssl' },
            { label: 'None', value: 'none' },
          ]" value-key="value" :disabled="isSubmitting" />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="SMTP Host" name="host" required>
          <UInput v-model="form.host" placeholder="smtp.gmail.com" :disabled="isSubmitting" class="w-full" />
        </UFormField>

        <UFormField label="SMTP Port" name="port" required>
          <UInput v-model="form.port" type="number" placeholder="587" :disabled="isSubmitting" class="w-full" />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Username" name="username">
          <UInput v-model="form.username" placeholder="user@example.com" :disabled="isSubmitting" class="w-full" />
        </UFormField>

        <UFormField label="Password" name="password">
          <UInput v-model="form.password" type="password" placeholder="••••••••" :disabled="isSubmitting" class="w-full" />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="From Address" name="fromAddress" required>
          <UInput v-model="form.fromAddress" type="email" placeholder="noreply@example.com" :disabled="isSubmitting" class="w-full" />
        </UFormField>

        <UFormField label="From Name" name="fromName" required>
          <UInput v-model="form.fromName" placeholder="XyraPanel" :disabled="isSubmitting" class="w-full" />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting || isTesting">
          Save Changes
        </UButton>
      </div>
    </form>
  </UCard>
</template>
