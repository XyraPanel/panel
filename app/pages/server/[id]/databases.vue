<script setup lang="ts">
import type { ServerDatabase } from '#shared/types/server';

const route = useRoute();

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const serverId = computed(() => route.params.id as string);
const requestFetch = useRequestFetch();

const {
  data: databasesData,
  pending,
  error,
} = await useAsyncData(
  `server-${serverId.value}-databases`,
  () =>
    requestFetch<{ data: ServerDatabase[]; hostAvailable: boolean }>(
      `/api/client/servers/${serverId.value}/databases`,
    ),
  {
    watch: [serverId],
  },
);

const databases = computed<ServerDatabase[]>(
  () => (databasesData.value as { data: ServerDatabase[] } | null)?.data ?? [],
);
const hostAvailable = computed(
  () => (databasesData.value as { hostAvailable?: boolean } | null)?.hostAvailable ?? true,
);

function getStatusColor(status: string) {
  switch (status) {
    case 'ready':
      return 'primary';
    case 'revoking':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'ready':
      return t('server.databases.statusReady');
    case 'revoking':
      return t('server.databases.statusRevoking');
    case 'error':
      return t('server.databases.statusError');
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

const showCreateModal = ref(false);
const showPasswordModal = ref(false);
const selectedDatabase = ref<(ServerDatabase & { password?: string }) | null>(null);
const operatingDatabaseId = ref<string | null>(null);
const newDatabaseForm = ref({
  name: '',
  remote: '%',
});

async function createDatabase() {
  if (!newDatabaseForm.value.name) {
    useToast().add({
      title: t('validation.required'),
      description: t('validation.required'),
      color: 'error',
    });
    return;
  }

  try {
    const response = await $fetch<{
      data: {
        id: string;
        name: string;
        username: string;
        password: string;
        host: string;
        port: number;
      };
    }>(`/api/client/servers/${serverId.value}/databases`, {
      method: 'POST',
      body: newDatabaseForm.value,
    });

    selectedDatabase.value = {
      id: response.data.id,
      name: response.data.name,
      username: response.data.username,
      password: response.data.password,
      host: { hostname: response.data.host, port: response.data.port },
      remote: newDatabaseForm.value.remote,
      status: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ServerDatabase & { password: string };

    showPasswordModal.value = true;

    useToast().add({
      title: t('common.success'),
      description: t('server.databases.databaseCreatedDescription', { name: response.data.name }),
      color: 'success',
    });

    showCreateModal.value = false;
    newDatabaseForm.value = { name: '', remote: '%' };

    await refreshNuxtData(`server-${serverId.value}-databases`);
  } catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.databases.createFailed'),
      color: 'error',
    });
  }
}

async function rotatePassword(databaseId: string) {
  operatingDatabaseId.value = databaseId;
  try {
    const response = await $fetch<{ data: { password: string } }>(
      `/api/client/servers/${serverId.value}/databases/${databaseId}/rotate`,
      {
        method: 'POST',
      },
    );

    const db = databases.value.find((database) => database.id === databaseId);
    if (db) {
      selectedDatabase.value = { ...db, password: response.data.password } as ServerDatabase & {
        password: string;
      };
      showPasswordModal.value = true;
    }

    useToast().add({
      title: t('common.success'),
      description: t('server.databases.passwordRotatedDescription'),
      color: 'success',
    });
  } catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.databases.rotationFailed'),
      color: 'error',
    });
  } finally {
    operatingDatabaseId.value = null;
  }
}

const showDeleteModal = ref(false);
const databaseToDelete = ref<string | null>(null);

function confirmDelete(databaseId: string) {
  databaseToDelete.value = databaseId;
  showDeleteModal.value = true;
}

async function deleteDatabase() {
  if (!databaseToDelete.value) return;

  operatingDatabaseId.value = databaseToDelete.value;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/databases/${databaseToDelete.value}`, {
      method: 'DELETE',
    });

    useToast().add({
      title: t('common.success'),
      description: t('server.databases.databaseDeletedDescription'),
      color: 'success',
    });

    showDeleteModal.value = false;
    databaseToDelete.value = null;

    await refreshNuxtData(`server-${serverId.value}-databases`);
  } catch (err) {
    useToast().add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('server.databases.deleteFailed'),
      color: 'error',
    });
  } finally {
    operatingDatabaseId.value = null;
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
                <h2 class="text-lg font-semibold">{{ t('server.databases.title') }}</h2>
                <UButton
                  v-if="hostAvailable"
                  icon="i-lucide-plus"
                  color="primary"
                  variant="soft"
                  class="ml-auto"
                  @click="showCreateModal = true"
                >
                  {{ t('server.databases.createDatabase') }}
                </UButton>
              </div>
            </template>

            <UAlert
              v-if="!pending && !error && !hostAvailable"
              color="warning"
              icon="i-lucide-database-zap"
              variant="subtle"
              :title="t('server.databases.noHostTitle')"
              :description="t('server.databases.noHostDescription')"
              class="mb-4"
            />

            <div
              v-if="error"
              class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
                <div>
                  <p class="font-medium">{{ t('server.databases.failedToLoad') }}</p>
                  <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
                </div>
              </div>
            </div>

            <div v-else-if="pending" class="flex items-center justify-center py-12">
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
            </div>

            <ServerEmptyState
              v-else-if="databases.length === 0"
              icon="i-lucide-database"
              :title="t('server.databases.noDatabases')"
              :description="t('server.databases.noDatabasesDescription')"
            />

            <div v-else class="overflow-hidden rounded-lg border border-default">
              <div
                class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <span class="col-span-3">{{ t('server.databases.name') }}</span>
                <span class="col-span-3">{{ t('server.databases.host') }}</span>
                <span class="col-span-3">{{ t('server.databases.username') }}</span>
                <span class="col-span-2">{{ t('server.databases.remote') }}</span>
                <span class="col-span-1">{{ t('server.databases.status') }}</span>
              </div>
              <div class="divide-y divide-default">
                <div
                  v-for="db in databases"
                  :key="db.id"
                  class="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
                >
                  <div class="col-span-3">
                    <div class="font-medium">{{ db.name }}</div>
                  </div>
                  <div class="col-span-3 text-sm text-muted-foreground">
                    {{ db.host.hostname }}:{{ db.host.port }}
                  </div>
                  <div class="col-span-3">
                    <code class="rounded bg-muted px-2 py-1 text-xs">{{ db.username }}</code>
                  </div>
                  <div class="col-span-2 text-xs text-muted-foreground">
                    {{ db.remote }}
                  </div>
                  <div class="col-span-1">
                    <UBadge :color="getStatusColor(db.status)" size="xs">
                      {{ getStatusLabel(db.status) }}
                    </UBadge>
                  </div>
                  <div class="col-span-12 flex items-center justify-end gap-2">
                    <UButton
                      icon="i-lucide-key-round"
                      size="xs"
                      variant="ghost"
                      color="primary"
                      :loading="operatingDatabaseId === db.id"
                      @click="rotatePassword(db.id)"
                    >
                      {{ t('server.databases.rotatePassword') }}
                    </UButton>
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      variant="ghost"
                      color="error"
                      :loading="operatingDatabaseId === db.id"
                      @click="confirmDelete(db.id)"
                    >
                      {{ t('server.databases.delete') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>
    <UModal
      v-model:open="showCreateModal"
      :title="t('server.databases.createDatabase')"
      :description="t('server.databases.createDatabase')"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('server.databases.databaseName')" name="name" required>
            <UInput
              v-model="newDatabaseForm.name"
              icon="i-lucide-database"
              :placeholder="t('server.databases.databaseNamePlaceholder')"
              class="w-full"
              @keyup.enter="createDatabase"
            />
            <template #help>
              {{ t('server.databases.databaseNameHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('server.databases.remoteAccess')" name="remote">
            <UInput
              v-model="newDatabaseForm.remote"
              icon="i-lucide-globe"
              :placeholder="t('server.databases.remoteAccessPlaceholder')"
              class="w-full"
            />
            <template #help>
              {{ t('server.databases.remoteAccessHelp') }}
            </template>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="showCreateModal = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            :disabled="!newDatabaseForm.name"
            @click="createDatabase"
          >
            {{ t('server.databases.createDatabase') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showPasswordModal"
      :title="t('server.databases.newPassword')"
      :description="t('server.databases.savePasswordNow')"
    >
      <template #body>
        <div v-if="selectedDatabase" class="space-y-4">
          <UAlert color="warning" icon="i-lucide-alert-triangle">
            {{ t('server.databases.savePasswordNow') }}
          </UAlert>

          <UFormField :label="t('server.databases.password')" name="password">
            <div class="flex items-center gap-2">
              <UInput
                :model-value="selectedDatabase.password"
                readonly
                icon="i-lucide-key"
                class="font-mono w-full"
              />
              <ServerCopyButton
                v-if="selectedDatabase.password"
                :text="selectedDatabase.password"
                :label="t('server.databases.password')"
              />
            </div>
            <template #help>
              {{ t('server.databases.passwordHelp') }}
            </template>
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end">
          <UButton icon="i-lucide-check" color="primary" @click="showPasswordModal = false">
            {{ t('server.databases.iveSavedIt') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('server.databases.deleteDatabase')"
      :description="t('server.databases.confirmDeleteDatabaseDescription')"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('common.warning') }}</template>
            <template #description>
              <span>{{ t('server.databases.confirmDeleteDatabaseDescription') }}</span>
              <span class="mt-1 block text-sm text-muted-foreground">{{
                t('common.irreversibleAction')
              }}</span>
            </template>
          </UAlert>

          <p class="text-sm text-muted-foreground">
            {{ t('server.databases.confirmDeleteDatabaseQuestion') }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            :disabled="operatingDatabaseId !== null"
            @click="showDeleteModal = false"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            color="error"
            :loading="operatingDatabaseId !== null"
            :disabled="operatingDatabaseId !== null"
            @click="deleteDatabase"
          >
            {{ t('server.databases.yesDeleteDatabase') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
