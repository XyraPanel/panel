<script setup lang="ts">
const props = defineProps<{
  actions: Array<{ label: string; icon: string; disabled?: boolean; handler: () => void }>;
  showLoadingBadge?: boolean;
}>();
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UButton
      v-for="action in props.actions"
      :key="action.label"
      :icon="action.icon"
      color="neutral"
      variant="soft"
      :disabled="action.disabled"
      @click="action.handler()"
    >
      {{ action.label }}
    </UButton>
    <slot />
    <UBadge v-if="props.showLoadingBadge" color="neutral" variant="soft">
      <slot name="loadingLabel" />
    </UBadge>
  </div>
</template>
