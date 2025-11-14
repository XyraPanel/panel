<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Settings',
  adminSubtitle: 'Configure panel settings and preferences',
})

const route = useRoute()
const router = useRouter()
const { data: sessionData } = useAuth()

const baseTabs: AdminSettingsTabDefinition[] = [
  {
    label: 'General',
    value: 'general',
    icon: 'i-lucide-settings',
    component: 'AdminSettingsGeneral',
    order: 0,
  },
  {
    label: 'Security',
    value: 'security',
    icon: 'i-lucide-shield-check',
    component: 'AdminSettingsSecurity',
    order: 10,
  },
  {
    label: 'Mail',
    value: 'mail',
    icon: 'i-lucide-mail',
    component: 'AdminSettingsMail',
    order: 20,
  },
  {
    label: 'Advanced',
    value: 'advanced',
    icon: 'i-lucide-sparkles',
    component: 'AdminSettingsAdvanced',
    order: 30,
  },
]

const availableTabs = computed(() => {
  const permissions = sessionData.value?.user?.permissions ?? []

  return baseTabs
    .filter(tab => !tab.permission || permissions.includes(tab.permission))
    .sort((a, b) => a.order - b.order)
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
      <section class="space-y-6">
        <header>
          <h1 class="text-xl font-semibold">Settings</h1>
          <p class="text-xs text-muted-foreground">Configure panel settings and preferences</p>
        </header>

        <div class="space-y-4">
          <UTabs v-model="activeTab" :items="tabItems" class="w-full" />

          <div v-if="currentTabComponent" key="settings-tab">
            <component :is="currentTabComponent" />
          </div>

          <UAlert v-else color="warning" variant="soft" icon="i-lucide-alert-triangle">
            <template #title>No settings available</template>
            <template #description>
              There are no settings sections available for your account. Contact an administrator if you believe this is an error.
            </template>
          </UAlert>
        </div>
      </section>
    </UPageBody>

    <template #right />
  </UPage>
</template>
