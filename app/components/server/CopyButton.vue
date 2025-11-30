<script setup lang="ts">
const props = defineProps<{
  text: string
  label?: string
}>()

const { t } = useI18n()
const copied = ref(false)
const toast = useToast()

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true

    toast.add({
      title: t('common.copied'),
      description: props.label ? t('common.copiedToClipboard') : t('common.copiedToClipboard'),
      color: 'success',
    })

    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    toast.add({
      title: t('common.error'),
      description: t('common.failedToCopy'),
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
    {{ copied ? t('common.copied') : t('common.copy') }}
  </UButton>
</template>
