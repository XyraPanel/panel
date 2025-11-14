<script setup lang="ts">
import type { GeneralSettings } from '#shared/types/admin-settings'

const toast = useToast()
const isSubmitting = ref(false)

const { data: settings, refresh } = await useFetch<GeneralSettings>('/api/admin/settings/general', {
  key: 'admin-settings-general',
})

const form = reactive({
  name: settings.value?.name || '',
  url: settings.value?.url || '',
  locale: settings.value?.locale || 'en',
  timezone: settings.value?.timezone || 'UTC',
  brandText: settings.value?.brandText || settings.value?.name || 'XyraPanel',
  showBrandText: settings.value?.showBrandText ?? true,
  showBrandLogo: settings.value?.showBrandLogo ?? false,
  brandLogoUrl: settings.value?.brandLogoUrl ?? null,
})

const logoFile = ref<File | null>(null)
const logoUploading = ref(false)

watch(settings, (newSettings) => {
  if (newSettings) {
    form.name = newSettings.name
    form.url = newSettings.url
    form.locale = newSettings.locale
    form.timezone = newSettings.timezone
    form.brandText = newSettings.brandText
    form.showBrandText = newSettings.showBrandText
    form.showBrandLogo = newSettings.showBrandLogo
    form.brandLogoUrl = newSettings.brandLogoUrl
  }
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
      title: 'Logo uploaded',
      description: 'Brand logo has been updated',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Upload failed',
      description: err.data?.message || 'Unable to upload logo. Please try again.',
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
    await $fetch('/api/admin/settings/general', {
      method: 'PATCH',
      body: {
        brandLogoUrl: null,
        showBrandLogo: false,
      },
    })

    form.brandLogoUrl = null
    form.showBrandLogo = false

    toast.add({
      title: 'Logo removed',
      description: 'Brand logo has been cleared',
      color: 'success',
    })

    await refresh()
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to remove logo',
      color: 'error',
    })
  }
}

async function handleSubmit() {
  isSubmitting.value = true

  try {
    await $fetch('/api/admin/settings/general', {
      method: 'PATCH',
      body: form,
    })

    toast.add({
      title: 'Settings updated',
      description: 'General settings have been saved successfully',
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
      <h2 class="text-lg font-semibold">General Settings</h2>
      <p class="text-sm text-muted-foreground">Configure basic panel information</p>
    </template>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <UFormField label="Panel Name" name="name" required>
        <UInput v-model="form.name" placeholder="XyraPanel" :disabled="isSubmitting" class="w-full" />
      </UFormField>

      <UFormField label="Panel URL" name="url" required>
        <UInput v-model="form.url" type="url" placeholder="https://panel.example.com" :disabled="isSubmitting" class="w-full" />
      </UFormField>

      <UFormField label="Language" name="locale" required>
        <USelect v-model="form.locale" :items="[
          { label: 'English', value: 'en' },
          { label: 'German', value: 'de' },
          { label: 'French', value: 'fr' },
          { label: 'Spanish', value: 'es' },
        ]" value-key="value" :disabled="isSubmitting" />
      </UFormField>

      <UFormField label="Timezone" name="timezone" required>
        <USelect v-model="form.timezone" :items="[
          { label: 'UTC', value: 'UTC' },
          { label: 'America/New_York', value: 'America/New_York' },
          { label: 'America/Los_Angeles', value: 'America/Los_Angeles' },
          { label: 'Europe/London', value: 'Europe/London' },
          { label: 'Europe/Paris', value: 'Europe/Paris' },
          { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
        ]" value-key="value" :disabled="isSubmitting" />
      </UFormField>

      <USeparator />

      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-medium">Branding</h3>
          <p class="text-xs text-muted-foreground">Control how the panel brand appears in the dashboard.</p>
        </div>

        <UFormField label="Brand text" name="brandText">
          <UInput v-model="form.brandText" placeholder="XyraPanel" :disabled="isSubmitting" class="w-full" />
        </UFormField>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Show brand text" name="showBrandText">
            <div class="flex items-center justify-between rounded-lg border border-default p-3">
              <p class="text-sm text-muted-foreground">Display the brand text in the sidebar.</p>
              <USwitch v-model="form.showBrandText" />
            </div>
          </UFormField>

          <UFormField label="Show brand logo" name="showBrandLogo">
            <div class="flex items-center justify-between rounded-lg border border-default p-3">
              <p class="text-sm text-muted-foreground">Display the uploaded logo in the sidebar.</p>
              <USwitch v-model="form.showBrandLogo" />
            </div>
          </UFormField>
        </div>

        <div class="space-y-3">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Logo</p>
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-3">
              <UAvatar :src="form.brandLogoUrl || undefined" icon="i-lucide-image" size="lg" />
              <div class="text-xs text-muted-foreground">
                <p v-if="form.brandLogoUrl">Current logo</p>
                <p v-else>No logo uploaded</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UFileUpload v-model="logoFile" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                class="w-56" label="Upload logo" description="PNG, JPG, SVG, WEBP up to 2MB"
                :disabled="logoUploading" />
              <UButton v-if="form.brandLogoUrl" variant="ghost" color="error" size="sm" icon="i-lucide-trash"
                @click="removeLogo">
                Remove logo
              </UButton>
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground">Logos are stored at 256px width (max 2MB).</p>
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
