<script setup lang="ts">
import type { ServerSubuser } from '#shared/types/server';

const route = useRoute();

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const serverId = computed(() => route.params.id as string);
const requestFetch = useRequestFetch();

const toast = useToast();

const {
  data: subusersData,
  pending,
  error,
  refresh: refreshSubusers,
} = await useAsyncData(
  `server-${serverId.value}-users`,
  () => requestFetch<{ data: ServerSubuser[] }>(`/api/client/servers/${serverId.value}/users`),
  {
    watch: [serverId],
  },
);

const users = computed(() => subusersData.value?.data || []);

const permissionGroups = computed(() => [
  {
    key: 'console',
    title: t('server.users.console'),
    perms: ['control.console'],
  },
  {
    key: 'power',
    title: t('server.users.power'),
    perms: ['control.power', 'control.start', 'control.stop', 'control.restart'],
  },
  {
    key: 'files',
    title: t('server.users.fileManager'),
    perms: ['files.read', 'files.write', 'files.delete'],
  },
  {
    key: 'backups',
    title: t('server.users.backups'),
    perms: ['backups.read', 'backups.create', 'backups.delete', 'backups.restore'],
  },
  {
    key: 'databases',
    title: t('server.users.databases'),
    perms: ['databases.read', 'databases.create', 'databases.delete'],
  },
  {
    key: 'schedules',
    title: t('server.users.schedules'),
    perms: ['schedules.read', 'schedules.create', 'schedules.update', 'schedules.delete'],
  },
]);

const showInviteModal = ref(false);
const inviting = ref(false);
const inviteForm = reactive({
  email: '',
  permissions: [] as string[],
});

function openInviteModal() {
  inviteForm.email = '';
  inviteForm.permissions = [];
  showInviteModal.value = true;
}

function closeInviteModal() {
  showInviteModal.value = false;
}

function isGroupSelected(group: { perms: string[] }) {
  return group.perms.every((perm) => inviteForm.permissions.includes(perm));
}

function togglePermissionGroup(group: { perms: string[] }) {
  const set = new Set(inviteForm.permissions);
  const selected = isGroupSelected(group);

  if (selected) {
    group.perms.forEach((perm) => set.delete(perm));
  } else {
    group.perms.forEach((perm) => set.add(perm));
  }

  inviteForm.permissions = Array.from(set);
}

async function submitInvite() {
  const email = inviteForm.email.trim();

  if (!email) {
    toast.add({
      title: t('common.error'),
      description: t('validation.required'),
      color: 'error',
    });
    return;
  }

  if (!inviteForm.permissions.length) {
    toast.add({
      title: t('common.error'),
      description: t('server.users.permissionRequired'),
      color: 'error',
    });
    return;
  }

  inviting.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/users`, {
      method: 'POST',
      body: {
        email,
        permissions: inviteForm.permissions,
      },
    });

    toast.add({
      title: t('server.users.userInvited'),
      description: t('server.users.userInvitedDescription', { email }),
      color: 'success',
    });

    closeInviteModal();
    await refreshSubusers();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.users.inviteFailed'),
      color: 'error',
    });
  } finally {
    inviting.value = false;
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">{{ t('server.users.invitedUsers') }}</h2>
                <UButton
                  icon="i-lucide-user-plus"
                  color="primary"
                  variant="soft"
                  class="ml-auto"
                  @click="openInviteModal"
                >
                  {{ t('server.users.inviteUser') }}
                </UButton>
              </div>
            </template>

            <div
              v-if="error"
              class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
                <div>
                  <p class="font-medium">{{ t('server.users.failedToLoad') }}</p>
                  <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
                </div>
              </div>
            </div>

            <div v-else-if="pending" class="flex items-center justify-center py-12">
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
            </div>

            <div
              v-else-if="users.length === 0"
              class="rounded-lg border border-dashed border-default p-8 text-center"
            >
              <UIcon name="i-lucide-users" class="mx-auto size-12 text-muted-foreground/50" />
              <p class="mt-3 text-sm font-medium">{{ t('server.users.noCollaborators') }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('server.users.noCollaboratorsDescription') }}
              </p>
            </div>

            <div v-else class="divide-y divide-default">
              <div
                v-for="user in users"
                :key="user.id"
                class="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold">{{ user.username }}</h3>
                    <UBadge color="primary" size="xs">{{ t('server.users.active') }}</UBadge>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ user.email }} · {{ t('server.users.added') }}
                    <NuxtTime :datetime="user.createdAt" relative />
                  </p>
                </div>
                <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span
                    v-for="perm in user.permissions"
                    :key="perm"
                    class="rounded bg-muted px-2 py-1"
                    >{{ perm }}</span
                  >
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal
      v-model:open="showInviteModal"
      :title="t('server.users.inviteUser')"
      :description="t('server.users.noCollaboratorsDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-5">
          <UFormField :label="t('server.users.email')" required>
            <UInput
              v-model="inviteForm.email"
              type="email"
              autocomplete="email"
              :placeholder="t('server.users.emailPlaceholder')"
            />
          </UFormField>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-foreground">
                {{ t('server.users.permissionGroups') }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{
                  t('server.users.selectedPermissionCount', {
                    count: inviteForm.permissions.length,
                  })
                }}
              </p>
            </div>

            <div class="grid gap-3 lg:grid-cols-2">
              <UCard
                v-for="group in permissionGroups"
                :key="group.key"
                :ui="{ body: 'space-y-2' }"
                :class="[
                  'border transition',
                  isGroupSelected(group)
                    ? 'border-primary shadow-sm bg-primary/5'
                    : 'border-default hover:border-primary/60',
                ]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-foreground">{{ group.title }}</p>
                    <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {{ t('server.users.permissionsInGroup', { count: group.perms.length }) }}
                    </p>
                  </div>
                  <USwitch
                    :model-value="isGroupSelected(group)"
                    @update:model-value="() => togglePermissionGroup(group)"
                  />
                </div>
                <div class="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                  <code
                    v-for="perm in group.perms"
                    :key="perm"
                    class="rounded bg-muted px-1.5 py-0.5 font-mono"
                  >
                    {{ perm }}
                  </code>
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" @click="closeInviteModal">
          {{ t('common.cancel') }}
        </UButton>
        <UButton color="primary" :loading="inviting" @click="submitInvite">
          {{ t('server.users.sendInvite') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
