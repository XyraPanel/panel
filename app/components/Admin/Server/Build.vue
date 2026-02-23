<script setup lang="ts">
import { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import type { Server, ServerLimits } from '#shared/types/server';
import { serverBuildFormSchema } from '#shared/schema/admin/server';

const props = defineProps<{
  server: Server;
}>();

const toast = useToast();
const isSubmitting = ref(false);
const skipNextUpdate = ref(false);

const {
  data: limitsData,
  pending: limitsPending,
  refresh: refreshLimits,
} = await useFetch<{
  data?: {
    limits?: ServerLimits | null;
    allocationLimit?: number | null;
    databaseLimit?: number | null;
    backupLimit?: number | null;
  } | null;
}>(() => `/api/admin/servers/${props.server.id}`, {
  key: () => `server-limits-${props.server.id}`,
  watch: [() => props.server.id],
});

const limits = computed<ServerLimits | null>(() => {
  const serverData = limitsData.value?.data;
  if (!serverData) {
    return null;
  }

  return {
    cpu: serverData.limits?.cpu ?? 0,
    memory: serverData.limits?.memory ?? 0,
    disk: serverData.limits?.disk ?? 0,
    swap: serverData.limits?.swap ?? 0,
    io: serverData.limits?.io ?? 500,
    threads: serverData.limits?.threads ?? null,
    oomDisabled: serverData.limits?.oomDisabled ?? true,
    allocationLimit: serverData.allocationLimit ?? null,
    databaseLimit: serverData.databaseLimit ?? null,
    backupLimit: serverData.backupLimit ?? null,
  };
});

const schema = serverBuildFormSchema.extend({
  cpu: z.coerce.number().min(0, 'CPU limit cannot be negative'),
  memory: z.coerce.number().min(0, 'Memory limit cannot be negative'),
  swap: z.coerce.number().min(-1, 'Swap must be -1 or greater'),
  disk: z.coerce.number().min(0, 'Disk limit cannot be negative'),
  io: z.coerce
    .number()
    .min(10, 'Block I/O must be at least 10')
    .max(1000, 'Block I/O cannot exceed 1000'),
  oomDisabled: z.boolean().optional(),
  databaseLimit: z.coerce
    .number()
    .min(0, 'Database limit cannot be negative')
    .nullable()
    .optional(),
  allocationLimit: z.coerce
    .number()
    .min(0, 'Allocation limit cannot be negative')
    .nullable()
    .optional(),
  backupLimit: z.coerce.number().min(0, 'Backup limit cannot be negative').nullable().optional(),
});

type FormSchema = z.infer<typeof schema>;

function createFormState(payload: ServerLimits | null): FormSchema {
  return {
    cpu: Number(payload?.cpu ?? 0),
    threads: payload?.threads ?? null,
    memory: Number(payload?.memory ?? 0),
    swap: Number(payload?.swap ?? 0),
    disk: Number(payload?.disk ?? 0),
    io: Number(payload?.io ?? 500),
    oomDisabled: payload?.oomDisabled ?? true,
    databaseLimit: payload?.databaseLimit ?? null,
    allocationLimit: payload?.allocationLimit ?? null,
    backupLimit: payload?.backupLimit ?? null,
  };
}

const form = reactive<FormSchema>(createFormState(limits.value ?? null));

watch(
  limits,
  (value) => {
    if (skipNextUpdate.value) {
      skipNextUpdate.value = false;
      return;
    }

    if (value) {
      const newState = createFormState(value);
      Object.assign(form, newState);
    } else {
      const defaultState = createFormState(null);
      Object.assign(form, defaultState);
    }
  },
  { immediate: true, deep: true },
);

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    const payload = {
      cpu: event.data.cpu ?? 0,
      memory: event.data.memory ?? 0,
      swap: event.data.swap ?? 0,
      disk: event.data.disk ?? 0,
      io: event.data.io ?? 500,
      threads: event.data.threads ?? null,
      oomDisabled: event.data.oomDisabled ?? true,
      databaseLimit: event.data.databaseLimit ?? null,
      allocationLimit: event.data.allocationLimit ?? null,
      backupLimit: event.data.backupLimit ?? null,
    };

    await $fetch(`/api/admin/servers/${props.server.id}/build`, {
      method: 'PATCH',
      body: payload,
    });

    skipNextUpdate.value = true;
    await refreshLimits();

    toast.add({
      title: 'Build updated',
      description: 'Server resource limits have been saved and synced with Wings',
      color: 'success',
    });
  } catch (error) {
    console.error('[Build Form] Failed to update build configuration:', error);
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update build configuration',
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
    <UAlert icon="i-lucide-info" variant="subtle">
      <template #title>Resource Limits</template>
      <template #description>
        Configure CPU, memory, disk, and I/O limits for this server. Set to 0 for unlimited.
      </template>
    </UAlert>

    <div v-if="limitsPending" class="grid gap-4 md:grid-cols-2">
      <UCard v-for="i in 4" :key="`build-skeleton-${i}`" class="space-y-3">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-10 w-full" />
      </UCard>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2">
      <UFormField label="CPU Limit (%)" name="cpu" required>
        <UInput v-model.number="form.cpu" type="number" placeholder="100" class="w-full" />
        <template #help> Percentage of CPU (100 = 1 core, 200 = 2 cores). 0 = unlimited. </template>
      </UFormField>

      <UFormField label="CPU Threads" name="threads">
        <UInput v-model="form.threads" placeholder="Leave empty for all threads" class="w-full" />
        <template #help>
          Specific CPU threads to use (e.g., "0,1,2" or "0-3"). Leave empty to use all.
        </template>
      </UFormField>

      <UFormField label="Memory Limit (MB)" name="memory" required>
        <UInput v-model.number="form.memory" type="number" placeholder="2048" class="w-full" />
        <template #help> Maximum memory in megabytes. 0 = unlimited. </template>
      </UFormField>

      <UFormField label="Swap (MB)" name="swap" required>
        <UInput v-model.number="form.swap" type="number" placeholder="0" class="w-full" />
        <template #help> Swap memory in megabytes. -1 = unlimited, 0 = disabled. </template>
      </UFormField>

      <UFormField label="Disk Space (MB)" name="disk" required>
        <UInput v-model.number="form.disk" type="number" placeholder="10240" class="w-full" />
        <template #help> Maximum disk space in megabytes. 0 = unlimited. </template>
      </UFormField>

      <UFormField label="Block I/O Weight" name="io" required>
        <UInput
          v-model.number="form.io"
          type="number"
          min="10"
          max="1000"
          placeholder="500"
          class="w-full"
        />
        <template #help> I/O performance (10-1000). Higher = better performance. </template>
      </UFormField>

      <UFormField label="OOM Killer" name="oomDisabled">
        <USwitch
          v-model="form.oomDisabled"
          :label="`${form.oomDisabled ? 'Disabled' : 'Enabled'}`"
          description="Enabling OOM killer may cause server processes to exit unexpectedly."
          checked-icon="i-lucide-check"
          unchecked-icon="i-lucide-x"
        />
      </UFormField>
    </div>

    <UAlert icon="i-lucide-info" variant="subtle" class="mt-6">
      <template #title>Application Feature Limits</template>
      <template #description>
        Configure limits for databases, allocations, and backups that users can create for this
        server.
      </template>
    </UAlert>

    <div class="grid gap-4 md:grid-cols-3">
      <UFormField label="Database Limit" name="databaseLimit">
        <UInput v-model.number="form.databaseLimit" type="number" placeholder="0" class="w-full" />
        <template #help> Maximum databases users can create. Leave empty for unlimited. </template>
      </UFormField>

      <UFormField label="Allocation Limit" name="allocationLimit">
        <UInput
          v-model.number="form.allocationLimit"
          type="number"
          placeholder="0"
          class="w-full"
        />
        <template #help> Maximum ports users can create. Leave empty for unlimited. </template>
      </UFormField>

      <UFormField label="Backup Limit" name="backupLimit">
        <UInput v-model.number="form.backupLimit" type="number" placeholder="0" class="w-full" />
        <template #help> Maximum backups that can be created. Leave empty for unlimited. </template>
      </UFormField>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        variant="subtle"
        :loading="isSubmitting"
        :disabled="isSubmitting"
      >
        Save Build Configuration
      </UButton>
    </div>
  </UForm>
</template>
