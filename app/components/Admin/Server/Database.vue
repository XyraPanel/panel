<script setup lang="ts">
import type { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import type { AdminServerDatabaseListResponse, AdminServerDatabase } from '#shared/types/admin';
import { serverDatabaseCreateSchema } from '#shared/schema/admin/server';

const props = defineProps<{
  serverId: string;
}>();

const toast = useToast();
const showCreateModal = ref(false);
const isSubmitting = ref(false);

const {
  data: databasesData,
  refresh,
  pending: databasesPending,
} = await useFetch<{ data?: { databases?: AdminServerDatabase[] } }>(
  () => `/api/admin/servers/${props.serverId}`,
  {
    key: () => `server-databases-${props.serverId}`,
    watch: [() => props.serverId],
  },
);
const databases = computed<AdminServerDatabase[]>(() => databasesData.value?.data?.databases ?? []);

const createSchema = serverDatabaseCreateSchema;

type CreateFormSchema = z.infer<typeof createSchema>;

const form = reactive<CreateFormSchema>({
  database: '',
  remote: '%',
});

function resetForm() {
  form.database = '';
  form.remote = '%';
}

async function handleCreate(event: FormSubmitEvent<CreateFormSchema>) {
  if (isSubmitting.value) return;

  isSubmitting.value = true;

  try {
    await $fetch<unknown>(`/api/admin/servers/${props.serverId}/databases`, {
      method: 'POST',
      body: event.data,
    });

    toast.add({
      title: 'Database created',
      description: 'Server database has been created successfully',
      color: 'success',
    });

    showCreateModal.value = false;
    resetForm();
    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to create database',
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete(databaseId: string, databaseName: string) {
  if (!confirm(`Are you sure you want to delete the database "${databaseName}"?`)) {
    return;
  }

  try {
    await $fetch(`/api/admin/servers/${props.serverId}/databases/${databaseId}`, {
      method: 'delete',
    });

    toast.add({
      title: 'Database deleted',
      description: 'The database has been removed',
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to delete database',
      color: 'error',
    });
  }
}

async function rotatePassword(databaseId: string) {
  try {
    await $fetch<unknown>(
      `/api/admin/servers/${props.serverId}/databases/${databaseId}/rotate-password`,
      {
        method: 'POST',
      },
    );

    toast.add({
      title: 'Password rotated',
      description: 'Database password has been changed',
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to rotate password',
      color: 'error',
    });
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted-foreground">Manage MySQL databases for this server</p>
      <UButton icon="i-lucide-plus" color="primary" @click="showCreateModal = true">
        Create Database
      </UButton>
    </div>

    <div v-if="databasesPending" class="space-y-3">
      <UCard v-for="i in 3" :key="`database-skeleton-${i}`" class="space-y-2">
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-3 w-1/2" />
      </UCard>
    </div>

    <div
      v-else-if="databases.length === 0"
      class="rounded-lg border border-default p-8 text-center"
    >
      <UIcon name="i-lucide-database" class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-2 text-sm text-muted-foreground">No databases created yet</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="db in databases"
        :key="db.id"
        class="flex items-center justify-between rounded-lg border border-default p-4"
      >
        <div class="flex-1 space-y-1">
          <div class="flex items-center gap-2">
            <code class="text-sm font-medium">{{ db.database }}</code>
            <UBadge size="xs" color="neutral">{{ db.username }}</UBadge>
          </div>
          <p class="text-xs text-muted-foreground">Host: {{ db.host }} | Remote: {{ db.remote }}</p>
        </div>

        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-key" variant="soft" size="sm" @click="rotatePassword(db.id)">
            Rotate Password
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            @click="handleDelete(db.id, db.database)"
          />
        </div>
      </div>
    </div>

    <UModal v-model:open="showCreateModal" title="Create Database" :ui="{ footer: 'justify-end' }">
      <template #body>
        <UForm
          id="create-database-form"
          :schema="createSchema"
          :state="form"
          class="space-y-4"
          :disabled="isSubmitting"
          @submit="handleCreate"
        >
          <UFormField label="Database Name" name="database" required>
            <UInput v-model="form.database" placeholder="s1_minecraft" class="w-full" />
            <template #help> Database name will be prefixed with server identifier </template>
          </UFormField>

          <UFormField label="Remote Connections" name="remote" required>
            <UInput v-model="form.remote" placeholder="%" class="w-full" />
            <template #help> % = allow from anywhere, or specify IP address </template>
          </UFormField>
        </UForm>
      </template>

      <template #footer>
        <UButton variant="ghost" :disabled="isSubmitting" @click="showCreateModal = false">
          Cancel
        </UButton>
        <UButton
          type="submit"
          form="create-database-form"
          color="primary"
          variant="subtle"
          :loading="isSubmitting"
          :disabled="isSubmitting"
        >
          Create Database
        </UButton>
      </template>
    </UModal>
  </div>
</template>
