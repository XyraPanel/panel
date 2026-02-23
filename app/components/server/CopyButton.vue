<script setup lang="ts">
const props = defineProps<{
  text: string;
  label?: string;
}>();

const { t } = useI18n();
const copied = ref(false);
const toast = useToast();

async function copyToClipboard() {
  const attemptNativeCopy = async () => {
    if (!navigator?.clipboard?.writeText) {
      throw new Error('Clipboard API unavailable');
    }
    await navigator.clipboard.writeText(props.text);
  };

  const attemptLegacyCopy = () => {
    const textarea = document.createElement('textarea');
    textarea.value = props.text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    textarea.remove();
    if (!success) {
      throw new Error('execCommand copy failed');
    }
  };

  try {
    try {
      await attemptNativeCopy();
    } catch {
      attemptLegacyCopy();
    }

    copied.value = true;

    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
      color: 'success',
    });

    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    toast.add({
      title: t('common.error'),
      description: t('common.failedToCopy'),
      color: 'error',
    });
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
