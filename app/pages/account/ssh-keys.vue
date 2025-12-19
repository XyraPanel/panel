<script setup lang="ts">
import { ref, computed, reactive } from 'vue'

definePageMeta({
  auth: true,
  layout: 'default',
})

const { t } = useI18n()
const toast = useToast()
const isCreating = ref(false)
const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const keyToDelete = ref<string | null>(null)
const isDeleting = ref(false)

const createForm = reactive({
  name: '',
  publicKey: '',
})

const { data: keysData, refresh } = await useAsyncData('account-ssh-keys', () => 
  $fetch('/api/account/ssh-keys')
)

const sshKeys = computed(() => keysData.value?.data || [])
const expandedKeys = ref<Set<string>>(new Set())

function toggleKey(id: string) {
  if (expandedKeys.value.has(id)) {
    expandedKeys.value.delete(id)
  } else {
    expandedKeys.value.add(id)
  }
}

function formatJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2)
}

function getFullKeyData(key: typeof sshKeys.value[0]) {
  return {
    id: key.id,
    name: key.name,
    fingerprint: key.fingerprint,
    public_key: key.public_key,
    created_at: key.created_at,
  }
}

async function copyJson(key: typeof sshKeys.value[0]) {
  const json = formatJson(getFullKeyData(key))
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json)
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = json
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
    })
  } catch (error) {
    toast.add({
      title: t('common.failedToCopy'),
      description: error instanceof Error ? error.message : t('common.failedToCopy'),
      color: 'error',
    })
  }
}

async function createSshKey() {
  isCreating.value = true
  try {
    await $fetch('/api/account/ssh-keys', {
      method: 'POST',
      body: {
        name: createForm.name,
        public_key: createForm.publicKey,
      },
    })

    createForm.name = ''
    createForm.publicKey = ''
    showCreateModal.value = false

    await refresh()

    toast.add({
      title: t('account.sshKeys.keyAdded'),
      description: t('account.sshKeys.keyAddedDescription'),
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('account.sshKeys.error'),
      description: err.data?.message || t('account.sshKeys.failedToAddKey'),
      color: 'error',
    })
  }
  finally {
    isCreating.value = false
  }
}

function openDeleteModal(id: string) {
  keyToDelete.value = id
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!keyToDelete.value) return

  isDeleting.value = true
  try {
    await $fetch(`/api/account/ssh-keys/${keyToDelete.value}`, {
      method: 'DELETE',
    })

    await refresh()
    showDeleteModal.value = false
    keyToDelete.value = null

    toast.add({
      title: t('account.sshKeys.keyDeleted'),
      description: t('account.sshKeys.keyDeletedDescription'),
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: t('account.sshKeys.error'),
      description: err.data?.message || t('account.sshKeys.failedToDeleteKey'),
      color: 'error',
    })
  }
  finally {
    isDeleting.value = false
  }
}

</script>

<template>
  <UPage>
    <UContainer>
      <UPageHeader :title="t('account.sshKeys.title')" :description="t('account.sshKeys.description')">
        <template #links>
          <UButton variant="subtle" icon="i-lucide-plus" @click="showCreateModal = true">
            {{ t('account.sshKeys.addSSHKey') }}
          </UButton>
        </template>
      </UPageHeader>
    </UContainer>

    <UModal
      v-model:open="showCreateModal"
      :title="t('account.sshKeys.addSSHKey')"
      :description="t('account.sshKeys.addNewSSHKey')"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="createSshKey">
          <UFormField :label="t('account.sshKeys.name')" name="name" required>
            <UInput
              v-model="createForm.name"
              :placeholder="t('account.sshKeys.namePlaceholder')"
              class="w-full"
              required
            />
          </UFormField>

          <UFormField
            :label="t('account.sshKeys.publicKey')"
            name="publicKey"
            required
            :help="t('account.sshKeys.publicKeyHelp')"
          >
            <UTextarea
              v-model="createForm.publicKey"
              :placeholder="t('account.sshKeys.publicKeyPlaceholder')"
              :rows="6"
              class="w-full"
              required
            />
          </UFormField>
        </form>
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="error"
            :disabled="isCreating"
            @click="close"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="subtle"
            :loading="isCreating"
            :disabled="isCreating"
            @click="createSshKey"
          >
            {{ t('account.sshKeys.addSSHKey') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('account.sshKeys.deleteSSHKey')"
      :description="t('account.sshKeys.confirmDeleteSSHKey')"
    >
      <template #body>
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-alert-triangle"
          :title="t('common.warning')"
          :description="t('account.sshKeys.deleteWarning')"
        />
      </template>

      <template #footer="{ close }">
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            :disabled="isDeleting"
            @click="close"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            variant="solid"
            color="error"
            icon="i-lucide-trash"
            :loading="isDeleting"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UPageBody>
      <UContainer>
        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">{{ t('account.sshKeys.configuredSSHKeys') }}</h2>
              <p class="text-sm text-muted-foreground">{{ t('account.sshKeys.configuredSSHKeysDescription') }}</p>
            </div>
          </template>
          <UEmpty
            v-if="sshKeys.length === 0"
            icon="i-lucide-key-round"
            :title="t('account.sshKeys.noSSHKeys')"
            :description="t('account.sshKeys.noSSHKeysDescription')"
          />

          <div v-else class="space-y-3">
            <div
              v-for="key in sshKeys"
              :key="key.id"
              class="rounded-lg border border-default overflow-hidden"
            >
              <button
                class="w-full flex items-center gap-3 p-3 text-left hover:bg-elevated/50 transition-colors"
                @click="toggleKey(key.id)"
              >
                <UIcon
                  name="i-lucide-key-round"
                  class="size-5 shrink-0 text-primary"
                />
                
                <div class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-sm font-medium font-mono">{{ key.name }}</span>
                      <UIcon
                        :name="expandedKeys.has(key.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                        class="size-4 text-muted-foreground shrink-0"
                      />
                    </div>
                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                      <span class="font-medium">{{ t('account.sshKeys.fingerprint') }}:</span>
                      <code class="text-xs font-mono">{{ key.fingerprint }}</code>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <span class="truncate">
                      {{ t('account.sshKeys.added') }}:
                      <NuxtTime :datetime="key.created_at" class="font-medium" />
                    </span>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <UButton
                      variant="ghost"
                      color="error"
                      size="xs"
                      icon="i-lucide-trash"
                      :loading="isDeleting"
                      :disabled="isDeleting"
                      @click.stop="openDeleteModal(key.id)"
                    >
                      {{ t('account.sshKeys.delete') }}
                    </UButton>
                  </div>
                </div>
              </button>
              
              <div
                v-if="expandedKeys.has(key.id)"
                class="border-t border-default bg-muted/30 p-4"
              >
                <div class="space-y-2">
                  <div class="flex items-center justify-between mb-2">
                    <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('account.sshKeys.sshKeyData') }}</p>
                    <UButton
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-copy"
                      @click.stop="copyJson(key)"
                    >
                      {{ t('account.sshKeys.copyJSON') }}
                    </UButton>
                  </div>
                  <pre class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"><code>{{ formatJson(getFullKeyData(key)) }}</code></pre>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </UContainer>
    </UPageBody>
  </UPage>
</template>

