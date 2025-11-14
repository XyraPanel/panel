<template>
  <UContainer class="min-h-screen flex items-center justify-center py-12">
    <div class="w-full max-w-md space-y-4">
      <UCard :ui="{
        body: 'space-y-6',
        header: 'text-center space-y-2',
      }">
        <slot />
      </UCard>

      <p class="text-center text-xs text-muted-foreground">
        Copyright © 2025 XyraPanel
      </p>
    </div>
  </UContainer>
</template>