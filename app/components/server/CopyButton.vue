<script setup lang="ts">
const props = defineProps<{
  text: string
  label?: string
}>()

const copied = ref(false)
const toast = useToast()

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true

    toast.add({
      title: 'Copied',
      description: props.label ? `${props.label} copied to clipboard` : 'Copied to clipboard',
      color: 'success',
    })

    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    toast.add({
      title: 'Error',
      description: 'Failed to copy to clipboard',
      color: 'error',
    })
  }
}
</script>

<template>
  <UButton
    :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
    size="xs"
    variant="ghost"
    color="neutral"
    @click="copyToClipboard"
  >
    {{ copied ? 'Copied!' : 'Copy' }}
  </UButton>
</template>
