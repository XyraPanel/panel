<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)
const route = useRoute()
const { t } = useI18n()

const passwordCompromised = computed(() => {
  if (!isAuthenticated.value || !user.value) return false
  return Boolean((user.value as { passwordCompromised?: boolean }).passwordCompromised)
})

const showModal = computed(() => {
  if (!isAuthenticated.value || !passwordCompromised.value) return false
  const path = String(route.path)
  return path !== '/account/security' && !path.startsWith('/auth/')
})
</script>

<template>
  <UModal
    v-model:open="showModal"
    :dismissible="false"
    modal
    :title="t('account.security.password.passwordMarkedCompromised')"
    :close="false"
  >
    <template #body>
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-shield-alert" class="size-6 text-error shrink-0 mt-0.5" />
        <p class="text-sm text-foreground">
          {{ t('account.security.password.passwordPreviouslyCompromised') }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end w-full">
        <UButton
          color="error"
          :label="t('auth.forcePasswordChange')"
          to="/account/security"
          size="lg"
        />
      </div>
    </template>
  </UModal>
</template>

