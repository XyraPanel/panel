<script setup lang="ts">
import type { ApiKey, ApiKeyWithToken, CreateApiKeyPayload } from '#shared/types/admin';

definePageMeta({
  auth: true,
  adminTitle: 'API Keys',
  adminSubtitle: 'Manage existing keys or create new ones for API access.',
});

const { t } = useI18n();
const requestFetch = useRequestFetch();
const toast = useToast();
const showCreateModal = ref(false);
const showKeyModal = ref(false);
const showDeleteModal = ref(false);
const createdKey = ref<ApiKeyWithToken | null>(null);
const keyToDelete = ref<ApiKey | null>(null);
const isSubmitting = ref(false);
const isDeleting = ref(false);

const resetDeleteModal = () => {
  showDeleteModal.value = false;
  keyToDelete.value = null;
};

const { data, refresh } = await useAsyncData('admin-api-keys', async () => {
  const response = await requestFetch('/api/admin/api-keys');
  return response;
});

const apiKeys = computed(() => (data.value as unknown as { data: ApiKey[] } | null)?.data ?? []);
const sortOrder = ref<'newest' | 'oldest'>('newest');

const sortOptions = [
  { label: t('common.newest'), value: 'newest' },
  { label: t('common.oldest'), value: 'oldest' },
];

const sortedApiKeys = computed(() => {
  const sorted = [...apiKeys.value];
  if (sortOrder.value === 'newest') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return sorted;
});

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

const form = reactive({
  memo: '',
  expiresAt: '',
  allowedIps: '',
  permissions: {
    servers: [],
    nodes: [],
    allocations: [],
    users: [],
    locations: [],
    nests: [],
    eggs: [],
    databaseHosts: [],
    serverDatabases: [],
  } as Record<string, string[]>,
});

const RESOURCE_NAMES = computed<Record<string, string>>(() => ({
  servers: t('admin.api.servers'),
  nodes: t('admin.api.nodes'),
  allocations: t('admin.api.allocations'),
  users: t('admin.api.users'),
  locations: t('admin.api.locations'),
  nests: t('admin.api.nests'),
  eggs: t('admin.api.eggs'),
  databaseHosts: t('admin.api.databaseHosts'),
  serverDatabases: t('admin.api.serverDatabases'),
}));

function resetForm() {
  form.memo = '';
  form.expiresAt = '';
  form.allowedIps = '';
  form.permissions = {
    servers: [],
    nodes: [],
    allocations: [],
    users: [],
    locations: [],
    nests: [],
    eggs: [],
    databaseHosts: [],
    serverDatabases: [],
  };
}

async function handleCreate() {
  isSubmitting.value = true;

  try {
    const payload: CreateApiKeyPayload = {
      memo: form.memo || undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      allowedIps: form.allowedIps
        ? form.allowedIps
            .split(',')
            .map((ip) => ip.trim())
            .filter(Boolean)
        : undefined,
      permissions: form.permissions,
    };

    const result = await $fetch<{ data: ApiKeyWithToken }>('/api/admin/api-keys', {
      method: 'POST',
      body: payload,
    });

    createdKey.value = result.data;
    showCreateModal.value = false;
    showKeyModal.value = true;
    resetForm();
    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.api.createFailed'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete() {
  if (!keyToDelete.value) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/admin/api-keys/${keyToDelete.value.id}`, {
      method: 'DELETE',
    });

    toast.add({
      title: t('admin.api.apiKeyDeleted'),
      description: t('admin.api.apiKeyDeletedDescription'),
      color: 'success',
    });

    resetDeleteModal();
    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('admin.api.deleteFailed'),
      color: 'error',
    });
  } finally {
    isDeleting.value = false;
  }
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
      color: 'success',
    });
  } catch {
    toast.add({
      title: t('common.failedToCopy'),
      description: text,
      color: 'error',
    });
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
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <p v-if="apiKeys.length > 0" class="text-xs text-muted-foreground">
                    {{ t('admin.api.showingApiKeys', { count: apiKeys.length }) }}
                  </p>
                  <div v-if="apiKeys.length > 0">
                    <USelect
                      v-model="sortOrder"
                      :items="sortOptions"
                      value-key="value"
                      class="w-40"
                    />
                  </div>
                </div>
                <UButton
                  icon="i-lucide-plus"
                  color="primary"
                  variant="subtle"
                  @click="showCreateModal = true"
                >
                  {{ t('admin.api.createApiKey') }}
                </UButton>
              </div>
            </template>

            <UEmpty
              v-if="apiKeys.length === 0"
              icon="i-lucide-key"
              :title="t('admin.api.noApiKeysYet')"
              :description="t('admin.api.apiKeysDescription')"
            />

            <div v-else class="divide-y divide-default">
              <div
                v-for="key in sortedApiKeys"
                :key="key.id"
                class="flex items-center justify-between gap-4 py-4"
              >
                <div class="flex-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <code class="text-sm font-mono">{{ key.identifier }}</code>
                    <UBadge
                      v-if="key.expiresAt"
                      :color="isExpired(key.expiresAt) ? 'error' : 'neutral'"
                      size="xs"
                      variant="soft"
                    >
                      {{ isExpired(key.expiresAt) ? t('admin.api.expired') : t('common.active') }}
                    </UBadge>
                  </div>
                  <p v-if="key.memo" class="text-sm text-muted-foreground">{{ key.memo }}</p>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {{ t('common.created') }}:
                      <NuxtTime
                        v-if="key.createdAt"
                        :datetime="key.createdAt"
                        relative
                        class="font-medium"
                      />
                      <span v-else>{{ t('common.unknown') }}</span>
                    </span>
                    <span>
                      {{ t('admin.api.lastUsed') }}:
                      <NuxtTime
                        v-if="key.lastUsedAt"
                        :datetime="key.lastUsedAt"
                        relative
                        class="font-medium"
                      />
                      <span v-else>{{ t('admin.api.neverUsed') }}</span>
                    </span>
                    <span v-if="key.expiresAt">
                      {{ t('admin.api.expires') }}:
                      <NuxtTime :datetime="key.expiresAt" relative class="font-medium" />
                    </span>
                  </div>
                </div>

                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="sm"
                  @click="
                    keyToDelete = key;
                    showDeleteModal = true;
                  "
                >
                  {{ t('admin.api.revoke') }}
                </UButton>
              </div>

              <div class="border-t border-default pt-4">
                <p class="text-xs text-muted-foreground">
                  {{ t('admin.api.showingApiKeys', { count: apiKeys.length }) }}
                </p>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showCreateModal" :title="t('admin.api.createApiKey')">
      <template #body>
        <div class="max-w-4xl mx-auto">
          <form class="space-y-6" @submit.prevent="handleCreate">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField :label="t('admin.api.memo')" name="memo">
                <UInput
                  v-model="form.memo"
                  :placeholder="t('admin.api.memoPlaceholder')"
                  :disabled="isSubmitting"
                  class="w-full"
                />
                <template #help>
                  {{ t('admin.api.memoHelp') }}
                </template>
              </UFormField>

              <UFormField :label="t('admin.api.expiresAt')" name="expiresAt">
                <UInput
                  v-model="form.expiresAt"
                  type="datetime-local"
                  :disabled="isSubmitting"
                  class="w-full"
                />
                <template #help>
                  {{ t('admin.api.expiresAtHelp') }}
                </template>
              </UFormField>
            </div>

            <UFormField :label="t('admin.api.allowedIps')" name="allowedIps">
              <UInput
                v-model="form.allowedIps"
                :placeholder="t('admin.api.allowedIpsPlaceholder')"
                :disabled="isSubmitting"
                class="w-full"
              />
              <template #help>
                {{ t('admin.api.allowedIpsHelp') }}
              </template>
            </UFormField>

            <div class="space-y-3">
              <div>
                <label class="text-sm font-medium">{{ t('admin.api.permissions') }}</label>
                <p class="text-xs text-muted-foreground mt-1">
                  {{ t('admin.api.permissionsHelp') }}
                </p>
              </div>
              <div class="border border-default rounded-lg overflow-hidden">
                <div class="divide-y divide-default">
                  <div
                    v-for="(resourceName, resourceKey) in RESOURCE_NAMES"
                    :key="resourceKey"
                    class="grid grid-cols-4 gap-4 p-3 items-center hover:bg-muted/30 transition-colors"
                  >
                    <div class="font-medium text-sm">{{ resourceName }}</div>
                    <div class="col-span-3 flex gap-4">
                      <UCheckbox
                        v-for="action in ['read', 'write', 'delete']"
                        :key="action"
                        :model-value="
                          (form.permissions[resourceKey] as string[])?.includes(action) ?? false
                        "
                        :disabled="isSubmitting"
                        :label="t(`admin.api.${action}`)"
                        @update:model-value="
                          (checked) => {
                            const actions = (form.permissions[resourceKey] as string[]) || [];
                            if (checked) {
                              if (!actions.includes(action)) {
                                form.permissions[resourceKey] = [...actions, action];
                              }
                            } else {
                              form.permissions[resourceKey] = actions.filter((a) => a !== action);
                            }
                          }
                        "
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="error"
            variant="ghost"
            :disabled="isSubmitting"
            @click="showCreateModal = false"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" variant="subtle" :loading="isSubmitting" @click="handleCreate">
            {{ t('admin.api.createKey') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showKeyModal" :dismissible="false" :title="t('admin.api.apiKeyCreated')">
      <template #body>
        <div class="space-y-4">
          <UAlert color="warning" icon="i-lucide-alert-triangle">
            <template #title>{{ t('admin.api.saveThisKeyNow') }}</template>
            <template #description>
              {{ t('admin.api.apiKeyDescription') }}
            </template>
          </UAlert>

          <div class="space-y-2">
            <label class="text-sm font-medium">{{ t('admin.api.yourApiKey') }}</label>
            <div class="flex gap-2">
              <UInput :model-value="createdKey?.apiKey" readonly class="flex-1 font-mono" />
              <UButton
                icon="i-lucide-copy"
                variant="soft"
                @click="copyToClipboard(createdKey?.apiKey || '')"
              >
                {{ t('common.copy') }}
              </UButton>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="primary" @click="showKeyModal = false">
            {{ t('admin.api.iveSavedTheKey') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('admin.api.deleteApiKey')"
      :description="t('admin.api.confirmDeleteDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('common.warning') }}</template>
          <template #description>{{ t('admin.api.deleteKeyWarning') }}</template>
        </UAlert>
        <div v-if="keyToDelete" class="rounded-md bg-muted p-3 text-sm">
          <p class="font-medium">
            {{ t('admin.api.identifier') }}:
            <code class="font-mono">{{ keyToDelete.identifier }}</code>
          </p>
          <p v-if="keyToDelete.memo" class="text-muted-foreground mt-2">{{ keyToDelete.memo }}</p>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" :disabled="isDeleting" @click="resetDeleteModal">
          {{ t('common.cancel') }}
        </UButton>
        <UButton color="error" icon="i-lucide-trash-2" :loading="isDeleting" @click="handleDelete">
          {{ t('admin.api.deleteApiKey') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
