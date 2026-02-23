<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui';
import type { Server, AdminServerDetails } from '#shared/types/server';
import type { Nest, Egg } from '#shared/types/nest';
import { serverTransferFormSchema } from '#shared/schema/admin/server';
import type { ServerTransferFormInput } from '#shared/schema/admin/server';

const props = defineProps<{
  server: AdminServerDetails;
}>();

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const requestFetch = useRequestFetch();
const suspendedSubmitting = ref(false);
const reinstallSubmitting = ref(false);
const createOnWingsSubmitting = ref(false);
const deleteSubmitting = ref(false);
const transferSubmitting = ref(false);
const changeEggSubmitting = ref(false);
const showChangeEggModal = ref(false);

const selectedNestId = ref<string>(props.server.nestId || '');
const selectedEggId = ref<string>(props.server.eggId || '');
const changeEggReinstall = ref(true);
const changeEggSkipScripts = ref(false);

const { data: nestsData } = await useAsyncData('admin-nests-for-egg-change', () =>
  requestFetch<{ data: Nest[] }>('/api/admin/nests'),
);
const nests = computed(() => nestsData.value?.data ?? []);
const nestItems = computed(() => nests.value.map((n) => ({ label: n.name, value: n.id })));

const { data: eggsData, refresh: refreshEggs } = await useAsyncData(
  () => `admin-eggs-for-nest-${selectedNestId.value}`,
  () =>
    selectedNestId.value
      ? requestFetch<{ data: { nest: Nest; eggs: Egg[] } }>(
          `/api/admin/nests/${selectedNestId.value}`,
        )
      : Promise.resolve(null),
  { watch: [selectedNestId] },
);
const eggs = computed(() => eggsData.value?.data?.eggs ?? []);
const eggItems = computed(() => eggs.value.map((e) => ({ label: e.name, value: e.id })));

watch(selectedNestId, () => {
  selectedEggId.value = '';
});

async function handleChangeEgg() {
  if (!selectedEggId.value) {
    toast.add({ title: t('common.error'), description: 'Please select an egg', color: 'error' });
    return;
  }
  if (changeEggSubmitting.value) return;
  changeEggSubmitting.value = true;
  try {
    await $fetch(`/api/admin/servers/${props.server.id}/change-egg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eggId: selectedEggId.value,
        nestId: selectedNestId.value || undefined,
        reinstall: changeEggReinstall.value,
        skipScripts: changeEggSkipScripts.value,
      }),
    });
    toast.add({
      title: 'Egg changed',
      description: changeEggReinstall.value
        ? 'Egg updated and reinstall initiated'
        : 'Egg updated successfully',
      color: 'success',
    });
    showChangeEggModal.value = false;
    setTimeout(() => router.go(0), 1500);
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || 'Failed to change egg',
      color: 'error',
    });
  } finally {
    changeEggSubmitting.value = false;
  }
}

async function handleSuspend() {
  if (
    !confirm(
      props.server.suspended
        ? t('admin.servers.manage.confirmUnsuspend')
        : t('admin.servers.manage.confirmSuspend'),
    )
  ) {
    return;
  }

  if (suspendedSubmitting.value) return;

  suspendedSubmitting.value = true;
  try {
    const endpoint = props.server.suspended ? 'unsuspend' : 'suspend';
    await $fetch(`/api/admin/servers/${props.server.id}/${endpoint}`, {
      method: 'POST',
    });

    toast.add({
      title: props.server.suspended
        ? t('admin.servers.manage.serverUnsuspended')
        : t('admin.servers.manage.serverSuspended'),
      description: props.server.suspended
        ? t('admin.servers.manage.serverUnsuspendedDescription')
        : t('admin.servers.manage.serverSuspendedDescription'),
      color: 'success',
    });

    router.go(0);
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToUpdateSuspension'),
      color: 'error',
    });
  } finally {
    suspendedSubmitting.value = false;
  }
}

async function handleReinstall() {
  if (!confirm(t('admin.servers.manage.confirmReinstall'))) {
    return;
  }

  if (reinstallSubmitting.value) return;

  reinstallSubmitting.value = true;
  try {
    await $fetch(`/api/admin/servers/${props.server.id}/reinstall`, {
      method: 'POST',
    });

    toast.add({
      title: t('admin.servers.manage.reinstallTriggered'),
      description: t('admin.servers.manage.reinstallQueued'),
      color: 'success',
    });

    setTimeout(() => {
      router.go(0);
    }, 2000);
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToTriggerReinstall'),
      color: 'error',
    });
  } finally {
    reinstallSubmitting.value = false;
  }
}

async function handleCreateOnWings() {
  if (!confirm(t('admin.servers.manage.confirmCreateOnWings'))) {
    return;
  }

  if (createOnWingsSubmitting.value) return;

  createOnWingsSubmitting.value = true;
  try {
    await $fetch(`/api/admin/servers/create-on-wings`, {
      method: 'POST',
      body: {
        serverId: props.server.id,
        startOnCompletion: true,
      },
    });

    toast.add({
      title: t('admin.servers.manage.installationStarted'),
      description: t('admin.servers.manage.installationInitiated'),
      color: 'success',
    });

    setTimeout(() => {
      router.go(0);
    }, 2000);
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToCreateOnWings'),
      color: 'error',
    });
  } finally {
    createOnWingsSubmitting.value = false;
  }
}

const showTransferModal = ref(false);

const transferSchema = serverTransferFormSchema;

type TransferFormSchema = ServerTransferFormInput;

const transferForm = reactive<TransferFormSchema>({
  nodeId: '',
  allocationId: '',
  additionalAllocationIds: '',
  startOnCompletion: true,
});

async function handleTransfer(event: FormSubmitEvent<TransferFormSchema>) {
  if (transferSubmitting.value) return;

  transferSubmitting.value = true;
  try {
    await $fetch(`/api/admin/servers/${props.server.id}/transfer`, {
      method: 'POST',
      body: {
        nodeId: event.data.nodeId,
        allocationId: event.data.allocationId || undefined,
        additionalAllocationIds: event.data.additionalAllocationIds || undefined,
        startOnCompletion: event.data.startOnCompletion,
      },
    });

    toast.add({
      title: t('admin.servers.manage.transferInitiated'),
      description: t('admin.servers.manage.transferStarted'),
      color: 'success',
    });

    showTransferModal.value = false;
    Object.assign(transferForm, {
      nodeId: '',
      allocationId: '',
      additionalAllocationIds: '',
      startOnCompletion: true,
    });
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToInitiateTransfer'),
      color: 'error',
    });
  } finally {
    transferSubmitting.value = false;
  }
}

async function handleDelete(force: boolean = false) {
  if (deleteSubmitting.value) return;

  if (!force) {
    if (!confirm(t('admin.servers.manage.confirmDelete'))) {
      return;
    }

    if (!confirm(t('admin.servers.manage.confirmDeleteFinal'))) {
      return;
    }
  }

  deleteSubmitting.value = true;
  try {
    const url = force
      ? `/api/admin/servers/${props.server.id}?force=true`
      : `/api/admin/servers/${props.server.id}`;
    await $fetch(url, {
      method: 'DELETE',
    });

    toast.add({
      title: t('admin.servers.manage.serverDeleted'),
      description: t('admin.servers.manage.serverDeletedDescription'),
      color: 'success',
    });

    router.push('/admin/servers');
  } catch (error) {
    const err = error as { status?: number; statusCode?: number; data?: { message?: string } };
    const status = err.status || err.statusCode;
    const message = err.data?.message || t('admin.servers.manage.failedToDeleteServer');

    if (status === 409 && !force) {
      toast.add({
        title: t('admin.servers.manage.deleteFailed'),
        description: message,
        color: 'warning',
        actions: [
          {
            label: 'Force Delete',
            onClick: () => handleDelete(true),
          },
        ],
      });
    } else {
      toast.add({
        title: t('common.error'),
        description: message,
        color: 'error',
      });
    }
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert icon="i-lucide-alert-triangle" color="warning">
      <template #title>{{ t('admin.servers.manage.dangerZone') }}</template>
      <template #description>
        {{ t('admin.servers.manage.dangerZoneDescription') }}
      </template>
    </UAlert>

    <div class="space-y-3">
      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">
            {{
              server.suspended
                ? t('admin.servers.manage.unsuspendServer')
                : t('admin.servers.manage.suspendServer')
            }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{
              server.suspended
                ? t('admin.servers.manage.unsuspendServerDescription')
                : t('admin.servers.manage.suspendServerDescription')
            }}
          </p>
        </div>
        <UButton
          :icon="server.suspended ? 'i-lucide-play' : 'i-lucide-pause'"
          :color="server.suspended ? 'primary' : 'warning'"
          :loading="suspendedSubmitting"
          :disabled="suspendedSubmitting"
          @click="handleSuspend"
        >
          {{
            server.suspended
              ? t('admin.servers.manage.unsuspend')
              : t('admin.servers.manage.suspend')
          }}
        </UButton>
      </div>

      <div
        v-if="server.status === 'install_failed'"
        class="flex items-center justify-between rounded-lg border border-warning p-4"
      >
        <div class="space-y-1">
          <p class="font-medium">{{ t('admin.servers.manage.createInstallServerOnWings') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ t('admin.servers.manage.createInstallServerOnWingsDescription') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-rocket"
          color="primary"
          :loading="createOnWingsSubmitting"
          :disabled="createOnWingsSubmitting"
          @click="handleCreateOnWings"
        >
          {{ t('admin.servers.manage.installOnWings') }}
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">Change Egg</p>
          <p class="text-sm text-muted-foreground">
            Switch this server to a different egg. Optionally reinstall with the new egg's install
            script.
          </p>
          <p class="text-xs text-muted-foreground">
            Current:
            <span class="font-mono">{{ server.egg?.name || server.eggId || 'Unknown' }}</span>
          </p>
        </div>
        <UButton
          icon="i-lucide-egg"
          color="primary"
          variant="soft"
          @click="showChangeEggModal = true"
        >
          Change Egg
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">{{ t('admin.servers.manage.reinstallServer') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ t('admin.servers.manage.reinstallServerDescription') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="warning"
          :loading="reinstallSubmitting"
          :disabled="reinstallSubmitting || server.status === 'install_failed'"
          @click="handleReinstall"
        >
          {{ t('admin.servers.manage.reinstall') }}
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-default p-4">
        <div class="space-y-1">
          <p class="font-medium">{{ t('admin.servers.manage.transferServer') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ t('admin.servers.manage.transferServerDescription') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-truck"
          color="primary"
          variant="soft"
          @click="showTransferModal = true"
        >
          {{ t('admin.servers.manage.transfer') }}
        </UButton>
      </div>

      <div class="flex items-center justify-between rounded-lg border border-error p-4">
        <div class="space-y-1">
          <p class="font-medium text-error">{{ t('admin.servers.manage.deleteServer') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ t('admin.servers.manage.deleteServerDescription') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          :loading="deleteSubmitting"
          :disabled="deleteSubmitting"
          @click="() => handleDelete()"
        >
          {{ t('common.delete') }}
        </UButton>
      </div>
    </div>

    <UModal v-model:open="showChangeEggModal" title="Change Egg" :ui="{ footer: 'justify-end' }">
      <template #body>
        <div class="space-y-4">
          <UAlert icon="i-lucide-info" variant="subtle" color="primary">
            <template #title>Changing the egg</template>
            <template #description>
              This will update the server's egg. If reinstall is enabled, the server's install
              script will run again using the new egg. Existing server files will be deleted during
              reinstall.
            </template>
          </UAlert>

          <UFormField label="Nest" name="nestId" required>
            <USelect
              v-model="selectedNestId"
              :items="nestItems"
              value-key="value"
              placeholder="Select a nest..."
              class="w-full"
            />
          </UFormField>

          <UFormField label="Egg" name="eggId" required>
            <USelect
              v-model="selectedEggId"
              :items="eggItems"
              value-key="value"
              :disabled="!selectedNestId || eggItems.length === 0"
              placeholder="Select an egg..."
              class="w-full"
            />
            <template v-if="selectedNestId && eggItems.length === 0" #help>
              No eggs found in this nest.
            </template>
          </UFormField>

          <div class="space-y-3 rounded-lg border border-default p-3">
            <USwitch
              v-model="changeEggReinstall"
              label="Reinstall server"
              description="Run the new egg's install script (deletes existing server files)"
            />
            <USwitch
              v-model="changeEggSkipScripts"
              :disabled="!changeEggReinstall"
              label="Skip install scripts"
              description="Change egg without running the install script"
            />
          </div>
        </div>
      </template>

      <template #footer>
        <UButton
          variant="ghost"
          :disabled="changeEggSubmitting"
          @click="showChangeEggModal = false"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          icon="i-lucide-egg"
          color="primary"
          :loading="changeEggSubmitting"
          :disabled="changeEggSubmitting || !selectedEggId"
          @click="handleChangeEgg"
        >
          Change Egg
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="showTransferModal"
      :title="t('admin.servers.manage.transferServer')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UForm
          id="transfer-form"
          :schema="transferSchema"
          :state="transferForm"
          class="space-y-4"
          @submit="handleTransfer"
        >
          <UAlert icon="i-lucide-info" variant="subtle">
            <template #title>{{ t('admin.servers.manage.serverTransfer') }}</template>
            <template #description>
              {{ t('admin.servers.manage.serverTransferDescription') }}
            </template>
          </UAlert>

          <UFormField :label="t('admin.servers.manage.targetNode')" name="nodeId" required>
            <UInput
              v-model="transferForm.nodeId"
              :placeholder="t('admin.servers.manage.targetNodePlaceholder')"
              class="w-full"
            />
            <template #help>
              {{ t('admin.servers.manage.targetNodeHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.servers.manage.primaryAllocation')" name="allocationId">
            <UInput
              v-model="transferForm.allocationId"
              :placeholder="t('admin.servers.manage.primaryAllocationPlaceholder')"
              class="w-full"
            />
            <template #help>
              {{ t('admin.servers.manage.primaryAllocationHelp') }}
            </template>
          </UFormField>

          <UFormField
            :label="t('admin.servers.manage.additionalAllocations')"
            name="additionalAllocationIds"
          >
            <UInput
              v-model="transferForm.additionalAllocationIds"
              :placeholder="t('admin.servers.manage.additionalAllocationsPlaceholder')"
              class="w-full"
            />
            <template #help>
              {{ t('admin.servers.manage.additionalAllocationsHelp') }}
            </template>
          </UFormField>

          <UFormField name="startOnCompletion">
            <USwitch
              v-model="transferForm.startOnCompletion"
              :label="t('admin.servers.manage.startServerAfterTransfer')"
              :description="t('admin.servers.manage.startServerAfterTransferDescription')"
            />
          </UFormField>
        </UForm>
      </template>

      <template #footer>
        <UButton variant="ghost" :disabled="transferSubmitting" @click="showTransferModal = false">
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          type="submit"
          form="transfer-form"
          color="primary"
          :loading="transferSubmitting"
          :disabled="transferSubmitting"
        >
          {{ t('admin.servers.manage.startTransfer') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
