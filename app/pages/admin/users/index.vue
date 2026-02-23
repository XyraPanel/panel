<script setup lang="ts">
import type { TableColumn, CommandPaletteItem } from '@nuxt/ui';
import type { AdminUserResponse, UsersResponse } from '#shared/types/api';

const { t } = useI18n();

definePageMeta({
  auth: true,
  adminTitle: 'Users',
  adminSubtitle: 'Audit panel accounts and Wings permissions',
});
const toast = useToast();
const router = useRouter();
const route = useRoute();
const requestFetch = useRequestFetch();

const page = ref(Number.parseInt((route.query.page as string) ?? '1', 10) || 1);
const showSearchModal = ref(false);

const { data: generalSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/admin/settings/general',
  {
    key: 'admin-settings-general',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => generalSettings.value?.paginationLimit ?? 25);

const {
  data: usersData,
  pending: loading,
  error,
  refresh: refreshUsers,
} = await useAsyncData<UsersResponse>(
  'admin-users',
  () =>
    requestFetch<UsersResponse>('/api/admin/users' as string, {
      query: {
        page: page.value,
        limit: itemsPerPage.value,
      },
    }),
  {
    default: () => ({ data: [], pagination: undefined }),
    watch: [page, itemsPerPage],
  },
);

const users = computed(() => usersData.value?.data ?? []);
const pagination = computed(() => usersData.value?.pagination);

watch(
  () => route.query.page,
  (newPage) => {
    const pageNum = Number.parseInt((newPage as string) ?? '1', 10);
    if (!Number.isNaN(pageNum) && pageNum > 0) {
      page.value = pageNum;
    }
  },
);

function handlePageChange(newPage: number) {
  page.value = newPage;
  router.replace({
    query: { ...route.query, page: newPage },
  });
}

const { data: allUsersData, execute: executeAllUsersFetch } = await useFetch<UsersResponse>(
  '/api/admin/users',
  {
    key: 'admin-users-all',
    query: { limit: 1000, page: 1 },
    default: () => ({ data: [] }),
    lazy: true,
  },
);

const allUsers = computed(() => allUsersData.value?.data ?? []);

const commandPaletteGroups = computed(() => [
  {
    id: 'users',
    label: t('admin.users.title'),
    items: allUsers.value.map((user): CommandPaletteItem => {
      const displayName = user.username || user.email;
      const fullName = user.name || undefined;
      return {
        id: user.id,
        label: displayName,
        suffix: user.email !== displayName ? user.email : undefined,
        prefix: fullName,
        chip:
          user.role === 'admin'
            ? { color: 'primary' as const, text: t('admin.users.admin') }
            : undefined,
        description: fullName ? `${t('admin.users.name')}: ${fullName}` : undefined,
        to: `/admin/users/${user.id}`,
        onSelect: (e) => {
          e.preventDefault();
          router.push(`/admin/users/${user.id}`);
          showSearchModal.value = false;
        },
      };
    }),
  },
]);

async function openSearchModal() {
  showSearchModal.value = true;
  await executeAllUsersFetch();
}

const columns = computed<TableColumn<AdminUserResponse>[]>(() => [
  { accessorKey: 'username', header: t('admin.users.user') },
  { accessorKey: 'email', header: t('admin.users.email') },
  { accessorKey: 'twoFactorEnabled', header: t('admin.users.twoFactor') },
  { accessorKey: 'serversOwned', header: t('admin.users.servers') },
  { accessorKey: 'role', header: t('admin.users.role') },
  { accessorKey: 'createdAt', header: t('admin.users.created') },
  { id: 'actions', header: t('admin.users.actions') },
]);

function getUserAvatar(user: AdminUserResponse) {
  const name = user.name || user.username || user.email;
  if (!name) return undefined;
  return {
    alt: name,
    text: name.slice(0, 2).toUpperCase(),
  };
}

const errorMessage = computed(() => {
  const err = error.value;
  if (!err) {
    return null;
  }

  if (typeof err === 'string') {
    return err;
  }

  if (err instanceof Error) {
    return err.message;
  }

  const message = (err as { data?: { message?: string } }).data?.message;
  return message ?? t('admin.users.failedToLoadUsers');
});

const showUserModal = ref(false);
const showDeleteModal = ref(false);
const editingUser = ref<AdminUserResponse | null>(null);
const userToDelete = ref<AdminUserResponse | null>(null);
const isSubmitting = ref(false);
const isDeleting = ref(false);

const resetDeleteModal = () => {
  showDeleteModal.value = false;
  userToDelete.value = null;
};

const userForm = ref({
  username: '',
  email: '',
  password: '',
  role: 'user' as 'user' | 'admin',
});

function resetForm() {
  userForm.value = {
    username: '',
    email: '',
    password: '',
    role: 'user',
  };
  editingUser.value = null;
}

function openCreateModal() {
  resetForm();
  showUserModal.value = true;
}

function openEditModal(user: AdminUserResponse) {
  editingUser.value = user;
  userForm.value = {
    username: user.username,
    email: user.email,
    password: '',
    role: user.role as 'user' | 'admin',
  };
  showUserModal.value = true;
}

async function handleSubmit() {
  const missingFields: string[] = [];
  if (!userForm.value.username) {
    missingFields.push(t('auth.username'));
  }
  if (!userForm.value.email) {
    missingFields.push(t('auth.email'));
  }
  if (missingFields.length > 0) {
    toast.add({
      title: t('validation.required'),
      description: missingFields.join(', '),
      color: 'error',
    });
    return;
  }

  if (!editingUser.value && !userForm.value.password) {
    toast.add({
      title: t('validation.required'),
      description: t('validation.passwordRequired'),
      color: 'error',
    });
    return;
  }

  isSubmitting.value = true;

  try {
    if (editingUser.value) {
      await $fetch(`/api/admin/users/${editingUser.value.id}`, {
        method: 'patch',
        body: userForm.value,
      });
      toast.add({
        title: t('common.success'),
        description: t('admin.users.updateSuccess'),
        color: 'success',
      });
    } else {
      await $fetch('/api/admin/users', {
        method: 'POST',
        body: userForm.value,
      });
      toast.add({
        title: t('common.success'),
        description: t('admin.users.createSuccess'),
        color: 'success',
      });
    }

    showUserModal.value = false;
    resetForm();
    await refreshUsers();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('common.error'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete() {
  if (!userToDelete.value) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/admin/users/${userToDelete.value.id}`, {
      method: 'DELETE',
    });
    toast.add({
      title: t('common.success'),
      description: t('admin.users.deleteSuccess'),
      color: 'success',
    });
    resetDeleteModal();
    await refreshUsers();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('common.error'),
      color: 'error',
    });
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard :ui="{ body: 'space-y-3' }">
            <template #header>
              <div class="flex justify-end gap-2">
                <UButton
                  icon="i-lucide-search"
                  color="neutral"
                  variant="subtle"
                  @click="openSearchModal"
                >
                  {{ t('common.search') }}
                </UButton>
                <UButton
                  icon="i-lucide-user-plus"
                  color="primary"
                  variant="subtle"
                  @click="openCreateModal"
                >
                  {{ t('admin.users.createUser') }}
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
                :title="t('admin.users.failedToLoadUsers')"
              />

              <UTable :data="users" :columns="columns" :loading="loading" sticky class="w-full">
                <template #loading>
                  <div class="space-y-2 p-4">
                    <USkeleton v-for="i in 4" :key="`row-skeleton-${i}`" class="h-10 w-full" />
                  </div>
                </template>

                <template #empty>
                  <div class="px-4 py-6 text-center text-sm text-muted-foreground">
                    {{ t('admin.users.noUsers') }}
                  </div>
                </template>

                <template #username-cell="{ row }">
                  <div class="flex items-center gap-2">
                    <UAvatar v-bind="getUserAvatar(row.original)" size="xs" />
                    <div class="flex flex-col">
                      <div class="flex items-center gap-1">
                        <NuxtLink
                          :to="`/admin/users/${row.original.id}`"
                          class="font-semibold hover:text-primary"
                        >
                          {{ row.original.username }}
                        </NuxtLink>
                        <UIcon
                          v-if="row.original.rootAdmin"
                          name="i-lucide-star"
                          class="h-4 w-4 text-warning"
                        />
                      </div>
                      <p v-if="row.original.name" class="text-xs text-muted-foreground">
                        {{ row.original.name }}
                      </p>
                    </div>
                  </div>
                </template>

                <template #email-cell="{ row }">
                  <span class="text-xs text-muted-foreground">{{ row.original.email }}</span>
                </template>

                <template #twoFactorEnabled-cell="{ row }">
                  <UIcon
                    :name="row.original.twoFactorEnabled ? 'i-lucide-lock' : 'i-lucide-unlock'"
                    :class="
                      row.original.twoFactorEnabled ? 'text-success' : 'text-muted-foreground'
                    "
                    class="h-4 w-4"
                  />
                </template>

                <template #serversOwned-cell="{ row }">
                  <div class="flex items-center gap-2 text-sm">
                    <span>{{ row.original.serversOwned ?? 0 }}</span>
                    <span class="text-muted-foreground">/</span>
                    <span class="text-muted-foreground">{{ row.original.serversAccess ?? 0 }}</span>
                  </div>
                </template>

                <template #role-cell="{ row }">
                  <UBadge
                    :color="row.original.role === 'admin' ? 'error' : 'neutral'"
                    size="sm"
                    variant="subtle"
                  >
                    {{
                      row.original.role === 'admin'
                        ? t('admin.users.admin')
                        : t('admin.users.userRole')
                    }}
                  </UBadge>
                </template>

                <template #createdAt-cell="{ row }">
                  <NuxtTime
                    class="text-xs text-muted-foreground"
                    :datetime="row.original.createdAt"
                  />
                </template>

                <template #actions-header>
                  <span class="sr-only">{{ t('admin.users.actions') }}</span>
                </template>

                <template #actions-cell="{ row }">
                  <div class="flex gap-1 justify-end">
                    <UButton
                      icon="i-lucide-user-circle"
                      size="xs"
                      variant="ghost"
                      :to="`/admin/users/${row.original.id}`"
                      :aria-label="t('admin.users.viewProfile')"
                    />
                    <UButton
                      icon="i-lucide-pencil"
                      size="xs"
                      color="info"
                      variant="ghost"
                      :aria-label="t('common.edit')"
                      @click="openEditModal(row.original)"
                    />
                    <UButton
                      icon="i-lucide-trash"
                      size="xs"
                      variant="ghost"
                      color="error"
                      :aria-label="t('common.delete')"
                      @click="
                        userToDelete = row.original;
                        showDeleteModal = true;
                      "
                    />
                  </div>
                </template>
              </UTable>

              <div
                v-if="pagination"
                class="flex items-center justify-between border-t border-default pt-4"
              >
                <p class="text-xs text-muted-foreground">
                  {{ t('admin.users.showingUsers', { count: users.length }) }}
                </p>
                <UPagination
                  v-model:page="page"
                  :total="pagination.total"
                  :items-per-page="pagination.perPage"
                  size="sm"
                  @update:page="handlePageChange"
                />
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal
      v-model:open="showUserModal"
      :title="editingUser ? t('common.edit') : t('common.create')"
      :description="editingUser ? t('common.update') : t('common.create')"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="t('auth.username')" name="username" required>
            <UInput
              v-model="userForm.username"
              :placeholder="t('auth.username')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('auth.email')" name="email" required>
            <UInput
              v-model="userForm.email"
              type="email"
              :placeholder="t('auth.email')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('auth.password')" name="password" :required="!editingUser">
            <UInput
              v-model="userForm.password"
              type="password"
              :placeholder="editingUser ? t('auth.password') : t('auth.password')"
              :required="!editingUser"
              :disabled="isSubmitting"
              class="w-full"
            />
            <template v-if="editingUser" #help>
              {{ t('admin.users.passwordLeaveBlank') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.users.role')" name="role" required>
            <USelect
              v-model="userForm.role"
              :items="[
                { label: t('admin.users.userRole'), value: 'user' },
                { label: t('admin.users.admin'), value: 'admin' },
              ]"
              value-key="value"
              :disabled="isSubmitting"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="error"
            :disabled="isSubmitting"
            @click="showUserModal = false"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleSubmit">
            {{ editingUser ? t('common.update') : t('common.create') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showSearchModal"
      :title="t('admin.users.searchUsers')"
      :description="t('admin.users.searchUsers')"
    >
      <template #content>
        <UCommandPalette
          :groups="commandPaletteGroups"
          :placeholder="t('admin.users.searchUsers')"
          class="h-96"
          close
          :fuse="{
            fuseOptions: {
              ignoreLocation: true,
              threshold: 0.3,
              keys: ['label', 'suffix', 'prefix', 'description'],
            },
            resultLimit: 50,
            matchAllWhenSearchEmpty: true,
          }"
          @update:open="showSearchModal = $event"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('admin.users.deleteUser')"
      :description="t('admin.users.confirmDeleteDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('common.warning') }}</template>
          <template #description>{{ t('admin.users.deleteUserWarning') }}</template>
        </UAlert>
        <div v-if="userToDelete" class="rounded-md bg-muted p-3 text-sm">
          <p class="font-medium">
            {{ t('auth.username') }}:
            <span class="text-foreground">{{ userToDelete.username }}</span>
          </p>
          <p class="text-muted-foreground mt-2">{{ t('auth.email') }}: {{ userToDelete.email }}</p>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" :disabled="isDeleting" @click="resetDeleteModal">
          {{ t('common.cancel') }}
        </UButton>
        <UButton color="error" icon="i-lucide-trash-2" :loading="isDeleting" @click="handleDelete">
          {{ t('admin.users.deleteUser') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
