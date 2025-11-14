<script setup lang="ts">
import type { AdvancedSettings } from '#shared/types/admin-settings'

const toast = useToast()
const isSubmitting = ref(false)

const { data: settings, refresh } = await useFetch<AdvancedSettings>('/api/admin/settings/advanced', {
  key: 'admin-settings-advanced',
})

const form = reactive({
  telemetryEnabled: settings.value?.telemetryEnabled ?? true,
  debugMode: settings.value?.debugMode ?? false,
  recaptchaEnabled: settings.value?.recaptchaEnabled ?? false,
  recaptchaSiteKey: settings.value?.recaptchaSiteKey || '',
  recaptchaSecretKey: settings.value?.recaptchaSecretKey || '',
  sessionTimeoutMinutes: settings.value?.sessionTimeoutMinutes ?? 60,
  queueConcurrency: settings.value?.queueConcurrency ?? 4,
  queueRetryLimit: settings.value?.queueRetryLimit ?? 5,
})

watch(settings, (newSettings) => {
  if (newSettings) {
    Object.assign(form, newSettings)
    form.sessionTimeoutMinutes = newSettings.sessionTimeoutMinutes
    form.queueConcurrency = newSettings.queueConcurrency
    form.queueRetryLimit = newSettings.queueRetryLimit
  }
})

async function handleSubmit() {
  isSubmitting.value = true

  try {
    await $fetch('/api/admin/settings/advanced', {
      method: 'PATCH',
      body: {
        telemetryEnabled: form.telemetryEnabled,
        debugMode: form.debugMode,
        recaptchaEnabled: form.recaptchaEnabled,
        recaptchaSiteKey: form.recaptchaSiteKey,
        recaptchaSecretKey: form.recaptchaSecretKey,
        sessionTimeoutMinutes: Number(form.sessionTimeoutMinutes),
        queueConcurrency: Number(form.queueConcurrency),
        queueRetryLimit: Number(form.queueRetryLimit),
      },
    })

    toast.add({
      title: 'Settings updated',
      description: 'Advanced settings have been saved successfully',
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
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Advanced Settings</h2>
      <p class="text-sm text-muted-foreground">Configure advanced panel features and integrations</p>
    </template>

    <form class="space-y-6" @submit.prevent="handleSubmit">

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">System</h3>

        <UFormField label="Telemetry" name="telemetryEnabled">
          <div class="flex items-center justify-between rounded-lg border border-default p-4">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">Enable Telemetry</div>
              <div class="text-xs text-muted-foreground">
                Help improve XyraPanel by sending anonymous usage statistics
              </div>
            </div>
            <UToggle v-model="form.telemetryEnabled" :disabled="isSubmitting" />
          </div>
        </UFormField>

        <UFormField label="Debug Mode" name="debugMode">
          <div class="flex items-center justify-between rounded-lg border border-default p-4">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">Debug Mode</div>
              <div class="text-xs text-muted-foreground">
                Enable detailed error messages and logging (not recommended for production)
              </div>
            </div>
            <UToggle v-model="form.debugMode" :disabled="isSubmitting" />
          </div>
        </UFormField>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">reCAPTCHA</h3>

        <UFormField label="Enable reCAPTCHA" name="recaptchaEnabled">
          <div class="flex items-center justify-between rounded-lg border border-default p-4">
            <div class="space-y-0.5">
              <div class="text-sm font-medium">Enable reCAPTCHA</div>
              <div class="text-xs text-muted-foreground">
                Protect login and registration forms with Google reCAPTCHA
              </div>
            </div>
            <UToggle v-model="form.recaptchaEnabled" :disabled="isSubmitting" />
          </div>
        </UFormField>

        <div v-if="form.recaptchaEnabled" class="space-y-4">
          <UFormField label="Site Key" name="recaptchaSiteKey" required>
            <UInput v-model="form.recaptchaSiteKey" placeholder="6Lc..." :disabled="isSubmitting" class="w-full" />
            <template #help>
              Get your keys from <a href="https://www.google.com/recaptcha/admin" target="_blank"
                class="text-primary hover:underline">Google reCAPTCHA</a>
            </template>
          </UFormField>

          <UFormField label="Secret Key" name="recaptchaSecretKey" required>
            <UInput v-model="form.recaptchaSecretKey" type="password" placeholder="6Lc..." :disabled="isSubmitting" class="w-full" />
          </UFormField>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">Sessions & Queue</h3>
        <div class="grid gap-4 md:grid-cols-3">
          <UFormField label="Session timeout" name="sessionTimeoutMinutes" required>
            <UInput v-model.number="form.sessionTimeoutMinutes" type="number" min="5" max="1440"
              suffix="min" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground">After this period of inactivity users are signed out.</span>
            </template>
          </UFormField>

          <UFormField label="Queue concurrency" name="queueConcurrency" required>
            <UInput v-model.number="form.queueConcurrency" type="number" min="1" max="32" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground"># of jobs that can run in parallel.</span>
            </template>
          </UFormField>

          <UFormField label="Queue retry limit" name="queueRetryLimit" required>
            <UInput v-model.number="form.queueRetryLimit" type="number" min="1" max="50" :disabled="isSubmitting" class="w-full" />
            <template #description>
              <span class="text-xs text-muted-foreground">Max attempts before a job is marked failed.</span>
            </template>
          </UFormField>
        </div>
      </div>

      <div class="flex justify-end">
        <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
          Save Changes
        </UButton>
      </div>
    </form>
  </UCard>
</template>
