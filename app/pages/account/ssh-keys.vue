<script setup lang="ts">
import { ref, computed } from 'vue'

definePageMeta({
  auth: true,
  layout: 'default',
})

const toast = useToast()
const isCreating = ref(false)
const showCreateModal = ref(false)

const createForm = reactive({
  name: '',
  publicKey: '',
})

const { data: keysData, refresh } = await useFetch('/api/account/ssh-keys', {
  key: 'account-ssh-keys',
})

const sshKeys = computed(() => keysData.value?.data || [])

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
      title: 'SSH Key Added',
      description: 'Your SSH key has been added successfully',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to add SSH key',
      color: 'error',
    })
  }
  finally {
    isCreating.value = false
  }
}

async function deleteKey(id: string) {
  if (!confirm('Are you sure you want to delete this SSH key? This action cannot be undone.')) {
    return
  }

  try {
    await $fetch(`/api/account/ssh-keys/${id}`, {
      method: 'DELETE',
    })

    await refresh()

    toast.add({
      title: 'SSH Key Deleted',
      description: 'The SSH key has been removed',
      color: 'success',
    })
  }
  catch (error) {
    const err = error as { data?: { message?: string } }
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to delete SSH key',
      color: 'error',
    })
  }
}

function formatDate(date: Date | string | number | null | undefined) {
  if (!date) return 'Never'
  return new Date(date).toLocaleString()
}
</script>

<template>
  <UPage>
    <UPageHeader title="SSH Keys" description="Manage SSH keys for SFTP access to your servers">
      <template #actions>
        <UButton icon="i-lucide-plus" @click="showCreateModal = true">
          Add SSH Key
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <UCard>
        <UEmpty
          v-if="sshKeys.length === 0"
          icon="i-lucide-key-round"
          title="No SSH keys yet"
          description="Add an SSH key to securely access your servers via SFTP"
          :actions="[{
            label: 'Add Your First SSH Key',
            icon: 'i-lucide-plus',
            onClick: () => { showCreateModal = true }
          }]"
        />

        <div v-else class="divide-y">
          <div v-for="key in sshKeys" :key="key.id" class="py-4 flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-medium">{{ key.name }}</h3>
              </div>
              <div class="mt-2 space-y-1">
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <span class="font-medium">Fingerprint:</span>
                  <code class="text-xs">{{ key.fingerprint }}</code>
                </div>
                <div class="text-xs text-muted-foreground">
                  Added: {{ formatDate(key.created_at) }}
                </div>
              </div>
              <details class="mt-2">
                <summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Show public key
                </summary>
                <pre class="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">{{ key.public_key }}</pre>
              </details>
            </div>
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              @click="deleteKey(key.id)"
            />
          </div>
        </div>
      </UCard>

    </UPageBody>

    <UModal v-model="showCreateModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Add SSH Key</h3>
        </template>

        <form class="space-y-4" @submit.prevent="createSshKey">
          <UFormField label="Name" name="name" required>
            <UInput
              v-model="createForm.name"
              placeholder="My Laptop"
              required
            />
          </UFormField>

          <UFormField
            label="Public Key"
            name="publicKey"
            required
            help="Paste your SSH public key (starts with ssh-rsa, ssh-ed25519, etc.)"
          >
            <UTextarea
              v-model="createForm.publicKey"
              placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA..."
              :rows="6"
              required
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="showCreateModal = false"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              :loading="isCreating"
              :disabled="isCreating"
            >
              Add SSH Key
            </UButton>
          </div>
        </form>
      </UCard>
    </UModal>
  </UPage>
</template>
