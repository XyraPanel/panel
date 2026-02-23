<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  value: string;
  loading: boolean;
  currentDirectoryLabel: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:value', value: string): void;
  (e: 'submit'): void;
}>();

const { t } = useI18n();

function close() {
  emit('update:modelValue', false);
}

function updateValue(value: string) {
  emit('update:value', value);
}

function handleSubmit() {
  emit('submit');
}
</script>

<template>
  <UModal
    :open="modelValue"
    :title="t('server.files.pullFile')"
    :description="t('server.files.pullFileDescription')"
    :ui="{ footer: 'justify-end gap-2' }"
    @update:open="emit('update:modelValue', $event)"
  >
    <template #body>
      <UForm class="space-y-4" @submit.prevent="handleSubmit">
        <UFormField
          :label="t('server.files.pullFileUrl')"
          name="fileUrl"
          :help="t('server.files.pullFileUrlHelp')"
          required
        >
          <UInput
            :model-value="value"
            type="url"
            placeholder="https://example.com/file.zip"
            :disabled="loading"
            autofocus
            class="w-full"
            @update:model-value="updateValue"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <UButton variant="ghost" color="neutral" :disabled="loading" @click="close">
        {{ t('common.cancel') }}
      </UButton>
      <UButton color="primary" :loading="loading" :disabled="!value.trim()" @click="handleSubmit">
        {{ t('server.files.pullFile') }}
      </UButton>
    </template>
  </UModal>
</template>
