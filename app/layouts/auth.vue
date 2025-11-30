<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <UContainer class="min-h-screen flex items-center justify-center py-12">
    <div class="w-full max-w-md space-y-4">
      <UCard :ui="{
        body: 'space-y-6',
        header: 'text-center space-y-2',
      }">
        <slot />
        <p class="text-center text-xs text-muted-foreground">
          {{ t('layout.copyright', { year: new Date().getFullYear() }) }} <ULink to="https://xyrapanel.com/" target="_blank">XyraPanel</ULink>
        </p>
      </UCard>
    </div>
  </UContainer>
</template>