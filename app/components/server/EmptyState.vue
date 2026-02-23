<script setup lang="ts">
defineProps<{
  icon?: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="rounded-lg border border-dashed border-default p-12 text-center">
    <UIcon :name="icon || 'i-lucide-inbox'" class="mx-auto size-16 text-muted-foreground/30" />
    <h3 class="mt-4 text-lg font-semibold">{{ title }}</h3>
    <p v-if="description" class="mt-2 text-sm text-muted-foreground">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-6">
      <slot />
    </div>
  </div>
</template>
