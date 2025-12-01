<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { storeToRefs } from 'pinia'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { user: sessionUser, permissions } = storeToRefs(authStore)

const baseTabs = computed<AdminSettingsTabDefinition[]>(() => [
  {
    label: t('admin.settings.general'),
    value: 'general',
    icon: 'i-lucide-settings',
    component: 'AdminSettingsGeneral',
    order: 0,
  },
  {
    label: t('admin.settings.security'),
    value: 'security',
    icon: 'i-lucide-shield-check',
    component: 'AdminSettingsSecurity',
    order: 10,
  },
  {
    label: t('admin.settings.mail'),
    value: 'mail',
    icon: 'i-lucide-mail',
    component: 'AdminSettingsMail',
    order: 20,
  },
  {
    label: t('admin.settings.advanced'),
    value: 'advanced',
    icon: 'i-lucide-sparkles',
    component: 'AdminSettingsAdvanced',
    order: 30,
  },
])

const availableTabs = computed(() => {
  const userPermissions = permissions.value ?? sessionUser.value?.permissions ?? []

  return baseTabs.value
    .filter(tab => !tab.permission || userPermissions.includes(tab.permission))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
})

const tabItems = computed(() => availableTabs.value.map(tab => ({
  label: tab.label,
  value: tab.value,
  icon: tab.icon,
})))

const activeTab = computed<string>({
  get: () => {
    const fallback = availableTabs.value[0]?.value ?? ''
    const value = (route.query.tab as string | undefined) ?? fallback
    if (value && availableTabs.value.some(tab => tab.value === value))
      return value
    return fallback
  },
  set: (value) => {
    router.push({ query: { tab: value || undefined } })
  },
})

const currentTab = computed<AdminSettingsTabDefinition | null>(() =>
  availableTabs.value.find(tab => tab.value === activeTab.value) ?? null,
)

const tabComponents = {
  general: defineAsyncComponent(() => import('~/components/Admin/Settings/General.vue')),
  security: defineAsyncComponent(() => import('~/components/Admin/Settings/Security.vue')),
  mail: defineAsyncComponent(() => import('~/components/Admin/Settings/Mail.vue')),
  advanced: defineAsyncComponent(() => import('~/components/Admin/Settings/Advanced.vue')),
} as const

const currentTabComponent = computed(() => {
  if (!currentTab.value)
    return null

  const key = currentTab.value.value as keyof typeof tabComponents
  return tabComponents[key] ?? null
})
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div class="space-y-4">
          <UTabs v-model="activeTab" variant="link" :items="tabItems" class="w-full" />
          <div v-if="currentTabComponent" key="settings-tab">
            <component :is="currentTabComponent" />
          </div>
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-alert-triangle">
            <template #title>{{ t('admin.settings.noSettingsAvailable') }}</template>
            <template #description>
              {{ t('admin.settings.noSettingsAvailableDescription') }}
            </template>
          </UAlert>
        </div>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
