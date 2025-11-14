<script setup lang="ts">
import { clearError, useRequestURL } from '#app'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const requestURL = useRequestURL()

const headline = computed(() => {
  if (props.error.statusCode === 404) return 'Page not found'
  return 'Unexpected panel error'
})

const description = computed(() => {
  if (props.error.statusCode === 404) {
    return 'We asked Wings for this resource but the daemon could not map it to any known route.'
  }
  if (props.error.statusCode === 401) {
    return 'Authentication is required. Ensure your panel token is valid before retrying.'
  }
  if (props.error.statusCode === 500) {
    return 'Wings returned a server error. Check node logs and retry the operation.'
  }
  return props.error.statusMessage || 'No additional error context was provided.'
})

const requestedUrl = computed(() => {
  const dataUrl = (props.error.data as { url?: string } | undefined)?.url
  return dataUrl ?? requestURL.href
})

interface QuickLink {
  label: string
  icon: string
  to?: string
  action?: () => void
}

const quickLinks: QuickLink[] = [
  {
    label: 'Go back',
    icon: 'i-lucide-arrow-left',
    action: () => {
      if (import.meta.client && window.history.length > 1) {
        window.history.back()
      } else {
        clearError({ redirect: '/' })
      }
    },
  },
  { label: 'Admin dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' },
  { label: 'Home', icon: 'i-lucide-home', to: '/' },
]

const handleReset = () => clearError({ redirect: '/' })
</script>

<template>
  <UPage>
    <UPageBody>
      <section class="mx-auto flex max-w-3xl flex-col gap-6 text-center">
        <UCard :ui="{ body: 'space-y-4' }">
          <div class="flex flex-col items-center gap-2">
            <UBadge size="xs" color="neutral">{{ props.error.statusCode || 'ERR' }}</UBadge>
            <h1 class="text-2xl font-semibold">{{ headline }}</h1>
            <p class="text-sm text-muted-foreground">{{ description }}</p>
          </div>
          <div class="rounded-md border border-default bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            Requested resource: <code>{{ requestedUrl }}</code>
          </div>
          <div class="flex flex-wrap justify-center gap-2">
            <UButton v-for="link in quickLinks" :key="link.label" :icon="link.icon" :to="link.to" color="primary"
              variant="soft" @click="link.action ? link.action() : undefined">
              {{ link.label }}
            </UButton>
            <UButton icon="i-lucide-refresh-ccw" variant="ghost" color="neutral" @click="handleReset">
              Try again
            </UButton>
          </div>
        </UCard>
      </section>
    </UPageBody>
  </UPage>
</template>
