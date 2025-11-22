<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminUserResponse } from '#shared/types/admin'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Users',
  adminSubtitle: 'Audit panel accounts and Wings permissions',
})

const toast = useToast()

const requestFetch = useRequestFetch()

type UsersResponse = {
  data: AdminUserResponse[]
}

const {
  data: usersData,
  pending: loading,
  error,
  refresh: refreshUsers,
} = await useAsyncData<UsersResponse>(
  'admin-users',
  () => requestFetch<UsersResponse>('/api/admin/users'),
  {
    default: () => ({ data: [] }),
  },
)

const users = computed(() => usersData.value?.data ?? [])

const columns = computed<TableColumn<AdminUserResponse>[]>(() => [
  { accessorKey: 'username', header: 'Username' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'createdAt', header: 'Created' },
  { id: 'actions', header: 'Actions' },
])

const errorMessage = computed(() => {
  const err = error.value
  if (!err) {
    return null
  }

  if (typeof err === 'string') {
    return err
  }

  if (err instanceof Error) {
    return err.message
  }

  const message = (err as { data?: { message?: string } }).data?.message
  return message ?? 'Failed to load users'
})

const showUserModal = ref(false)
const editingUser = ref<AdminUserResponse | null>(null)
const isSubmitting = ref(false)

const userForm = ref({
  username: '',
  email: '',
  password: '',
  name: '',
  role: 'user' as 'user' | 'admin',
})

function resetForm() {
  userForm.value = {
    username: '',
    email: '',
    password: '',
    name: '',
    role: 'user',
  }
  editingUser.value = null
}

function openCreateModal() {
  resetForm()
  showUserModal.value = true
}

function openEditModal(user: AdminUserResponse) {
  editingUser.value = user
  userForm.value = {
    username: user.username,
    email: user.email,
    password: '',
    name: user.name || '',
    role: user.role as 'user' | 'admin',
  }
  showUserModal.value = true
}

async function handleSubmit() {
  if (!userForm.value.username || !userForm.value.email) {
    toast.add({ title: 'Username and email are required', color: 'error' })
    return
  }

  if (!editingUser.value && !userForm.value.password) {
    toast.add({ title: 'Password is required for new users', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    if (editingUser.value) {
      await requestFetch(`/api/admin/users/${editingUser.value.id}`, {
        method: 'PATCH',
        body: userForm.value,
      })
      toast.add({ title: 'User updated', color: 'success' })
    }
    else {
      await requestFetch('/api/admin/users', {
        method: 'POST',
        body: userForm.value,
      })
      toast.add({ title: 'User created', color: 'success' })
    }

    showUserModal.value = false
    resetForm()
    await refreshUsers()
  } catch (err) {
    toast.add({
      title: editingUser.value ? 'Update failed' : 'Create failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDelete(user: AdminUserResponse) {
  if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
    return
  }

  try {
    await requestFetch(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'User deleted', color: 'success' })
    await refreshUsers()
  } catch (err) {
    toast.add({
      title: 'Delete failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold">Accounts</h2>
                <UButton icon="i-lucide-user-plus" color="primary" variant="subtle" @click="openCreateModal">
                  Create User
                </UButton>
              </div>
            </template>

            <div class="space-y-3">
              <UAlert
                v-if="errorMessage"
                color="error"
                variant="soft"
                icon="i-lucide-alert-triangle"
                :description="errorMessage"
                title="Failed to load users"
              />

              <UTable
                :data="users"
                :columns="columns"
                :loading="loading"
                sticky
                class="w-full"
              >
                <template #loading>
                  <div class="space-y-2 p-4">
                    <USkeleton v-for="i in 4" :key="`row-skeleton-${i}`" class="h-10 w-full" />
                  </div>
                </template>

                <template #empty>
                  <div class="px-4 py-6 text-center text-sm text-muted-foreground">
                    No users found.
                  </div>
                </template>

                <template #username-cell="{ row }">
                  <div class="flex flex-col">
                    <NuxtLink :to="`/admin/users/${row.original.id}`" class="font-semibold hover:text-primary">
                      {{ row.original.username }}
                    </NuxtLink>
                    <p v-if="row.original.name" class="text-xs text-muted-foreground">{{ row.original.name }}</p>
                  </div>
                </template>

                <template #email-cell="{ row }">
                  <span class="text-xs text-muted-foreground">{{ row.original.email }}</span>
                </template>

                <template #role-cell="{ row }">
                  <UBadge :color="row.original.role === 'admin' ? 'primary' : 'neutral'" size="sm" variant="subtle">
                    {{ row.original.role }}
                  </UBadge>
                </template>

                <template #createdAt-cell="{ row }">
                  <span class="text-xs text-muted-foreground">{{ formatDate(row.original.createdAt) }}</span>
                </template>

                <template #actions-header>
                  <span class="sr-only">Actions</span>
                </template>

                <template #actions-cell="{ row }">
                  <div class="flex gap-1 justify-end">
                    <UButton icon="i-lucide-user-circle" size="xs" variant="ghost" :to="`/admin/users/${row.original.id}`" />
                    <UButton icon="i-lucide-pencil" size="xs" variant="ghost" @click="openEditModal(row.original)" />
                    <UButton
                      icon="i-lucide-trash"
                      size="xs"
                      variant="ghost"
                      color="error"
                      @click="handleDelete(row.original)"
                    />
                  </div>
                </template>
              </UTable>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showUserModal" :title="editingUser ? 'Edit User' : 'Create User'"
      :description="editingUser ? 'Update user account' : 'Create a new user account'">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField label="Username" name="username" required>
            <UInput v-model="userForm.username" placeholder="john_doe" required :disabled="isSubmitting"
              class="w-full" />
          </UFormField>

          <UFormField label="Email" name="email" required>
            <UInput v-model="userForm.email" type="email" placeholder="john@example.com" required
              :disabled="isSubmitting" class="w-full" />
          </UFormField>

          <UFormField label="Name" name="name">
            <UInput v-model="userForm.name" placeholder="John Doe" :disabled="isSubmitting" class="w-full" />
          </UFormField>

          <UFormField label="Password" name="password" :required="!editingUser">
            <UInput v-model="userForm.password" type="password"
              :placeholder="editingUser ? 'Leave blank to keep current' : 'Enter password'" :required="!editingUser"
              :disabled="isSubmitting" class="w-full" />
            <template v-if="editingUser" #help>
              Leave blank to keep current password
            </template>
          </UFormField>

          <UFormField label="Role" name="role" required>
            <USelect v-model="userForm.role" :options="[
              { label: 'User', value: 'user' },
              { label: 'Admin', value: 'admin' },
            ]" :disabled="isSubmitting" class="w-full" />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="error" :disabled="isSubmitting" @click="showUserModal = false">
            Cancel
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleSubmit">
            {{ editingUser ? 'Update' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
