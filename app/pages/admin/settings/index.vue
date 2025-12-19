<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { storeToRefs } from 'pinia'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const { t } = useI18n()
const authStore = useAuthStore()
const { user: sessionUser, permissions } = storeToRefs(authStore)

interface SettingsSection {
  id: string
  label: string
  description: string
  icon: string
  component: ReturnType<typeof defineAsyncComponent>
  permission?: string
  order: number
}

const baseSections = computed<SettingsSection[]>(() => [
  {
    id: 'general',
    label: t('admin.settings.general'),
    description: t('admin.settings.generalSettings.description'),
    icon: 'i-lucide-settings',
    component: defineAsyncComponent(() => import('~/components/Admin/Settings/General.vue')),
    order: 0,
  },
  {
    id: 'security',
    label: t('admin.settings.security'),
    description: t('admin.settings.securitySettings.description'),
    icon: 'i-lucide-shield-check',
    component: defineAsyncComponent(() => import('~/components/Admin/Settings/Security.vue')),
    order: 10,
  },
  {
    id: 'mail',
    label: t('admin.settings.mail'),
    description: t('admin.settings.mailSettings.description'),
    icon: 'i-lucide-mail',
    component: defineAsyncComponent(() => import('~/components/Admin/Settings/Mail.vue')),
    order: 20,
  },
])

const availableSections = computed(() => {
  const userPermissions = permissions.value ?? sessionUser.value?.permissions ?? []

  return baseSections.value
    .filter(section => !section.permission || userPermissions.includes(section.permission))
    .sort((a, b) => a.order - b.order)
})

const openSections = ref<Record<string, boolean>>({
  general: true,
})
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <UCard v-if="availableSections.length > 0" :ui="{ body: 'p-0 divide-y divide-default' }">
          <div
            v-for="section in availableSections"
            :key="section.id"
          >
            <UCollapsible v-model:open="openSections[section.id]" :unmount-on-hide="false">
              <template #default>
                <div
                  class="flex w-full items-center justify-between p-4 cursor-pointer"
                >
                  <div class="flex items-center gap-3">
                    <UIcon :name="section.icon" class="size-5 text-primary" />
                    <div>
                      <h3 class="text-base font-semibold">{{ section.label }}</h3>
                      <p class="text-sm text-muted-foreground">{{ section.description }}</p>
                    </div>
                  </div>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-5 text-muted-foreground transition-transform duration-200"
                    :class="{ 'rotate-180': openSections[section.id] }"
                  />
                </div>
              </template>

              <template #content>
                <div class="border-t border-default p-4">
                  <component :is="section.component" />
                </div>
              </template>
            </UCollapsible>
          </div>
        </UCard>
        <UAlert v-else color="warning" variant="soft" icon="i-lucide-alert-triangle">
          <template #title>{{ t('admin.settings.noSettingsAvailable') }}</template>
          <template #description>
            {{ t('admin.settings.noSettingsAvailableDescription') }}
          </template>
        </UAlert>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
