<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Server } from '#shared/types/server'

const props = defineProps<{
  server: Server
}>()

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const suspendedSubmitting = ref(false)
const reinstallSubmitting = ref(false)
const createOnWingsSubmitting = ref(false)
const deleteSubmitting = ref(false)
const transferSubmitting = ref(false)

async function handleSuspend() {
  if (!confirm(props.server.suspended ? t('admin.servers.manage.confirmUnsuspend') : t('admin.servers.manage.confirmSuspend'))) {
    return
  }

  if (suspendedSubmitting.value)
    return

  suspendedSubmitting.value = true
  try {
    const endpoint = props.server.suspended ? 'unsuspend' : 'suspend'
    await $fetch(`/api/admin/servers/${props.server.id}/${endpoint}`, {
      method: 'POST',
    })

    toast.add({
      title: props.server.suspended ? t('admin.servers.manage.serverUnsuspended') : t('admin.servers.manage.serverSuspended'),
      description: props.server.suspended ? t('admin.servers.manage.serverUnsuspendedDescription') : t('admin.servers.manage.serverSuspendedDescription'),
      color: 'success',
    })

    router.go(0)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToUpdateSuspension'),
      color: 'error',
    })
  }
  finally {
    suspendedSubmitting.value = false
  }
}

async function handleReinstall() {
  if (!confirm(t('admin.servers.manage.confirmReinstall'))) {
    return
  }

  if (reinstallSubmitting.value)
    return

  reinstallSubmitting.value = true
  try {
    await $fetch(`/api/admin/servers/${props.server.id}/reinstall`, {
      method: 'POST',
    })

    toast.add({
      title: t('admin.servers.manage.reinstallTriggered'),
      description: t('admin.servers.manage.reinstallQueued'),
      color: 'success',
    })
    
    setTimeout(() => {
      router.go(0)
    }, 2000)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToTriggerReinstall'),
      color: 'error',
    })
  }
  finally {
    reinstallSubmitting.value = false
  }
}

async function handleCreateOnWings() {
  if (!confirm(t('admin.servers.manage.confirmCreateOnWings'))) {
    return
  }

  if (createOnWingsSubmitting.value)
    return

  createOnWingsSubmitting.value = true
  try {
    await $fetch(`/api/admin/servers/create-on-wings`, {
      method: 'POST',
      body: {
        serverId: props.server.id,
        startOnCompletion: true,
      },
    })

    toast.add({
      title: t('admin.servers.manage.installationStarted'),
      description: t('admin.servers.manage.installationInitiated'),
      color: 'success',
    })
    
    setTimeout(() => {
      router.go(0)
    }, 2000)
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToCreateOnWings'),
      color: 'error',
    })
  }
  finally {
    createOnWingsSubmitting.value = false
  }
}

const showTransferModal = ref(false)

const transferSchema = z.object({
  nodeId: z.string().trim().min(1, t('admin.servers.manage.targetNodeIdRequired')),
  allocationId: z.string().trim().optional().or(z.literal('')),
  additionalAllocationIds: z.string().trim().optional().or(z.literal('')),
  startOnCompletion: z.boolean().default(true),
})

type TransferFormSchema = z.infer<typeof transferSchema>

const transferForm = reactive<TransferFormSchema>({
  nodeId: '',
  allocationId: '',
  additionalAllocationIds: '',
  startOnCompletion: true,
})

async function handleTransfer(event: FormSubmitEvent<TransferFormSchema>) {
  if (transferSubmitting.value)
    return

  transferSubmitting.value = true
  try {
    await $fetch(`/api/admin/servers/${props.server.id}/transfer`, {
      method: 'POST',
      body: {
        nodeId: event.data.nodeId,
        allocationId: event.data.allocationId || undefined,
        additionalAllocationIds: event.data.additionalAllocationIds || undefined,
        startOnCompletion: event.data.startOnCompletion,
      },
    })

    toast.add({
      title: t('admin.servers.manage.transferInitiated'),
      description: t('admin.servers.manage.transferStarted'),
      color: 'success',
    })

    showTransferModal.value = false
    Object.assign(transferForm, {
      nodeId: '',
      allocationId: '',
      additionalAllocationIds: '',
      startOnCompletion: true,
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToInitiateTransfer'),
      color: 'error',
    })
  }
  finally {
    transferSubmitting.value = false
  }
}

async function handleDelete() {
  if (deleteSubmitting.value)
    return

  if (!confirm(t('admin.servers.manage.confirmDelete'))) {
    return
  }

  if (!confirm(t('admin.servers.manage.confirmDeleteFinal'))) {
    return
  }

  deleteSubmitting.value = true
  try {
    await $fetch(`/api/admin/servers/${props.server.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: t('admin.servers.manage.serverDeleted'),
      description: t('admin.servers.manage.serverDeletedDescription'),
      color: 'success',
    })

    router.push('/admin/servers')
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.servers.manage.failedToDeleteServer'),
      color: 'error',
    })
  }
  finally {
    deleteSubmitting.value = false
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
          <p class="font-medium">{{ server.suspended ? t('admin.servers.manage.unsuspendServer') : t('admin.servers.manage.suspendServer') }}</p>
          <p class="text-sm text-muted-foreground">
            {{ server.suspended ? t('admin.servers.manage.unsuspendServerDescription') : t('admin.servers.manage.suspendServerDescription') }}
          </p>
        </div>
        <UButton
          :icon="server.suspended ? 'i-lucide-play' : 'i-lucide-pause'"
          :color="server.suspended ? 'primary' : 'warning'"
          :loading="suspendedSubmitting"
          :disabled="suspendedSubmitting"
          @click="handleSuspend"
        >
          {{ server.suspended ? t('admin.servers.manage.unsuspend') : t('admin.servers.manage.suspend') }}
        </UButton>
      </div>

      <div v-if="server.status === 'install_failed'" class="flex items-center justify-between rounded-lg border border-warning p-4">
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
          @click="handleDelete"
        >
          {{ t('common.delete') }}
        </UButton>
      </div>
    </div>

    <UModal v-model:open="showTransferModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">{{ t('admin.servers.manage.transferServer') }}</h3>
        </template>

        <UForm
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

          <UFormField :label="t('admin.servers.manage.additionalAllocations')" name="additionalAllocationIds">
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

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="showTransferModal = false"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="transferSubmitting"
              :disabled="transferSubmitting"
            >
              {{ t('admin.servers.manage.startTransfer') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
