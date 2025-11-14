<script setup lang="ts">
const route = useRoute()
const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the authentication configuration. Please contact support.',
  AccessDenied: 'Access to this application is currently restricted for your account.',
  Verification: 'The verification link has expired or was already used. Request a new one to continue.',
}

const errorCode = computed(() => {
  const code = route.query.error
  return typeof code === 'string' ? code : 'Default'
})

const errorDescription = computed(() => errorMessages[errorCode.value] ?? 'An unexpected error occurred while signing you in.')

definePageMeta({
  layout: 'auth',
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: '/',
  },
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-alert-circle" class="size-5 text-destructive" />
        <h2 class="text-lg font-semibold">
          Authentication Error
        </h2>
      </div>
    </template>

    <p class="text-sm text-muted-foreground">
      {{ errorDescription }}
    </p>

    <template #footer>
      <UButton
        to="/auth/login"
        icon="i-lucide-arrow-left"
        color="primary"
        block
      >
        Return to Login
      </UButton>
    </template>
  </UCard>
</template>
