<script setup lang="ts">
import type { SecuritySettings } from '#shared/types/admin-settings'

const toast = useToast()
const isSubmitting = ref(false)

const { data: settings, refresh } = await useFetch<SecuritySettings>('/api/admin/settings/security', {
  key: 'admin-settings-security',
})

const form = reactive({
  enforceTwoFactor: settings.value?.enforceTwoFactor ?? false,
  maintenanceMode: settings.value?.maintenanceMode ?? false,
  maintenanceMessage: settings.value?.maintenanceMessage ?? '',
  announcementEnabled: settings.value?.announcementEnabled ?? false,
  announcementMessage: settings.value?.announcementMessage ?? '',
})

watch(settings, (value) => {
  if (!value)
    return

  Object.assign(form, value)
})

async function handleSubmit() {
  isSubmitting.value = true

  try {
    await $fetch('/api/admin/settings/security', {
      method: 'PATCH',
      body: form,
    })

    toast.add({
      title: 'Security settings saved',
      description: 'Safety and maintenance preferences were updated successfully.',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Update failed',
      description: err.data?.message || 'Unable to save security settings. Try again.',
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
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-lg font-semibold">Security & Maintenance</h2>
          <p class="text-sm text-muted-foreground">Enforce two-factor auth, toggle maintenance, and broadcast announcements.</p>
        </div>
      </div>
    </template>

    <form class="space-y-6" @submit.prevent="handleSubmit">
      <div class="space-y-4">
        <h3 class="text-sm font-semibold">Authentication</h3>
        <UFormField label="Require two-factor authentication" name="enforceTwoFactor">
          <div class="flex items-center justify-between rounded-lg border border-default bg-muted/20 p-4">
            <div class="space-y-0.5">
              <p class="text-sm font-medium">Enforce TOTP for admin accounts</p>
              <p class="text-xs text-muted-foreground">Admins without 2FA will be prompted to configure it at next sign-in.</p>
            </div>
            <UToggle v-model="form.enforceTwoFactor" :disabled="isSubmitting" />
          </div>
        </UFormField>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">Maintenance mode</h3>
        <UFormField label="Enable maintenance" name="maintenanceMode">
          <div class="flex items-center justify-between rounded-lg border border-default bg-muted/20 p-4">
            <div class="space-y-0.5">
              <p class="text-sm font-medium">Restrict panel access to administrators</p>
              <p class="text-xs text-muted-foreground">Regular users will see the maintenance message until disabled.</p>
            </div>
            <UToggle v-model="form.maintenanceMode" :disabled="isSubmitting" />
          </div>
        </UFormField>

        <transition name="fade">
          <UFormField v-if="form.maintenanceMode" label="Maintenance message" name="maintenanceMessage">
            <UTextarea v-model="form.maintenanceMessage" placeholder="We are performing scheduled updates..." :rows="3"
              :disabled="isSubmitting" class="w-full" />
          </UFormField>
        </transition>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-semibold">Announcements</h3>
        <UFormField label="Display announcement banner" name="announcementEnabled">
          <div class="flex items-center justify-between rounded-lg border border-default bg-muted/20 p-4">
            <div class="space-y-0.5">
              <p class="text-sm font-medium">Enable global announcement banner</p>
              <p class="text-xs text-muted-foreground">Shows a dismissible alert to all panel users.</p>
            </div>
            <UToggle v-model="form.announcementEnabled" :disabled="isSubmitting" />
          </div>
        </UFormField>

        <transition name="fade">
          <UFormField v-if="form.announcementEnabled" label="Announcement message" name="announcementMessage">
            <UTextarea v-model="form.announcementMessage" placeholder="We have rolled out new features..." :rows="3"
              :disabled="isSubmitting" class="w-full" />
            <template #help>
              Markdown supported. Keep it concise—long messages will wrap across the top of the panel.
            </template>
          </UFormField>
        </transition>
      </div>

      <div class="flex justify-end">
        <UButton type="submit" color="primary" :loading="isSubmitting" :disabled="isSubmitting">
          Save changes
        </UButton>
      </div>
    </form>
  </UCard>
</template>
