<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import type { StoredWingsNode } from '#shared/types/wings';
import { nodeSettingsFormSchema } from '#shared/schema/admin/infrastructure';
import type { NodeSettingsFormInput } from '#shared/schema/admin/infrastructure';

const props = defineProps<{
  node: StoredWingsNode;
}>();

const { t } = useI18n();
const toast = useToast();
const isSubmitting = ref(false);

type SchemeOption = 'http' | 'https';
const schemeOptions: { label: string; value: SchemeOption }[] = [
  { label: 'HTTP', value: 'http' },
  { label: 'HTTPS', value: 'https' },
];

const schema = nodeSettingsFormSchema;

type FormSchema = NodeSettingsFormInput;

function createFormState(node: StoredWingsNode): FormSchema {
  return {
    name: node.name,
    description: node.description ?? '',
    fqdn: node.fqdn,
    scheme: (node.scheme as SchemeOption) ?? 'https',
    public: node.public,
    maintenanceMode: node.maintenanceMode,
    behindProxy: node.behindProxy,
    memory: Number(node.memory),
    memoryOverallocate: Number(node.memoryOverallocate),
    disk: Number(node.disk),
    diskOverallocate: Number(node.diskOverallocate),
    uploadSize: Number(node.uploadSize),
    daemonListen: Number(node.daemonListen),
    daemonSftp: Number(node.daemonSftp),
    daemonBase: node.daemonBase,
  };
}

const form = reactive(createFormState(props.node));

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    await ($fetch as (input: string, init?: Record<string, unknown>) => Promise<unknown>)(
      `/api/admin/wings/nodes/${props.node.id}`,
      {
        method: 'patch',
        body: event.data,
      },
    );

    Object.assign(form, event.data);

    toast.add({
      title: 'Node updated',
      description: 'Node settings have been saved successfully',
      color: 'success',
    });
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update node settings',
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="form"
    class="space-y-6"
    :disabled="isSubmitting"
    :validate-on="['input']"
    @submit="handleSubmit"
  >
    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Basic Information</h3>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.nodes.settings.nodeName')" name="name" required>
          <UInput
            v-model="form.name"
            :placeholder="t('admin.nodes.settings.nodeNamePlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.nodes.settings.fqdn')" name="fqdn" required>
          <UInput v-model="form.fqdn" placeholder="node1.example.com" class="w-full" />
        </UFormField>
      </div>

      <UFormField :label="t('admin.nodes.settings.description')" name="description">
        <UTextarea
          v-model="form.description"
          :placeholder="t('admin.nodes.settings.descriptionPlaceholder')"
          :rows="3"
          class="w-full"
        />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.nodes.settings.scheme')" name="scheme" required>
          <USelect v-model="form.scheme" :items="schemeOptions" value-key="value" class="w-full" />
        </UFormField>

        <UFormField :label="t('admin.nodes.settings.uploadSizeLimit')" name="uploadSize">
          <UInput
            v-model.number="form.uploadSize"
            type="number"
            placeholder="100"
            min="1"
            max="1024"
            class="w-full"
          />
          <template #help> Maximum file upload size in megabytes (1-1024 MB) </template>
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Node Flags</h3>

      <div class="space-y-3">
        <UFormField name="public">
          <USwitch
            v-model="form.public"
            :label="t('admin.nodes.settings.publicNode')"
            :description="t('admin.nodes.settings.publicNodeDescription')"
          />
        </UFormField>

        <UFormField name="maintenanceMode">
          <USwitch
            v-model="form.maintenanceMode"
            :label="t('admin.nodes.settings.maintenanceMode')"
            :description="t('admin.nodes.settings.maintenanceModeDescription')"
          />
        </UFormField>

        <UFormField name="behindProxy">
          <USwitch
            v-model="form.behindProxy"
            :label="t('admin.nodes.settings.behindProxy')"
            :description="t('admin.nodes.settings.behindProxyDescription')"
          />
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Resource Limits</h3>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('admin.nodes.settings.totalMemory')" name="memory" required>
          <UInput
            v-model.number="form.memory"
            type="number"
            placeholder="8192"
            min="1"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.nodes.settings.memoryOverallocate')" name="memoryOverallocate">
          <UInput
            v-model.number="form.memoryOverallocate"
            type="number"
            placeholder="0"
            min="-1"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.nodes.settings.totalDisk')" name="disk" required>
          <UInput
            v-model.number="form.disk"
            type="number"
            placeholder="102400"
            min="1"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.nodes.settings.diskOverallocate')" name="diskOverallocate">
          <UInput
            v-model.number="form.diskOverallocate"
            type="number"
            placeholder="0"
            min="-1"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Daemon Configuration</h3>

      <div class="grid gap-4 md:grid-cols-3">
        <UFormField :label="t('admin.nodes.settings.daemonPort')" name="daemonListen" required>
          <UInput
            v-model.number="form.daemonListen"
            type="number"
            placeholder="8080"
            min="1"
            max="65535"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('admin.nodes.settings.sftpPort')" name="daemonSftp" required>
          <UInput
            v-model.number="form.daemonSftp"
            type="number"
            placeholder="2022"
            min="1"
            max="65535"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('admin.nodes.settings.daemonBaseDirectory')"
          name="daemonBase"
          required
        >
          <UInput v-model="form.daemonBase" placeholder="/var/lib/pterodactyl" class="w-full" />
        </UFormField>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        variant="subtle"
        :loading="isSubmitting"
        :disabled="isSubmitting"
      >
        Save Changes
      </UButton>
    </div>
  </UForm>
</template>
