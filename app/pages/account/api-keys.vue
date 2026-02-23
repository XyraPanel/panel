<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import type { ApiKeyResponse } from '#shared/types/api';
import { createApiKeyFormSchema } from '#shared/schema/account';
import type { CreateApiKeyFormInput } from '#shared/schema/account';

definePageMeta({
  auth: true,
  title: 'API Keys',
  subtitle: 'Manage existing keys or create new ones for API access',
});

const { t } = useI18n();
const toast = useToast();
const showCreateModal = ref(false);
const showDeleteModal = ref(false);
const keyToDelete = ref<string | null>(null);
const isDeleting = ref(false);
const newKeyToken = ref<string | null>(null);
const isCreating = ref(false);
const copySuccess = ref(false);
const createError = ref<string | null>(null);
const currentPage = ref(1);

const keySchema = createApiKeyFormSchema.superRefine((data, ctx) => {
  if (!data.allowedIps) return;

  const ips = data.allowedIps.split(',');
  const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  const allValid = ips.every((ip) => {
    const trimmed = ip.trim();
    if (!trimmed) return false;
    return ipv4Regex.test(trimmed);
  });

  if (!allValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['allowedIps'],
      message: t('validation.invalidIPs'),
    });
  }
});

type KeyFormSchema = CreateApiKeyFormInput;

const createForm = reactive<KeyFormSchema>(keySchema.parse({}));

const untypedFetch = $fetch as (input: string, init?: Record<string, unknown>) => Promise<unknown>;

type AccountApiKey = ApiKeyResponse['data'];
interface AccountApiKeysResponse {
  data: AccountApiKey[];
  pagination?: { page: number; perPage: number; total: number; totalPages: number };
}

const { data: paginationSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/settings/pagination',
  {
    key: 'settings-pagination',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => paginationSettings.value?.paginationLimit ?? 25);

const {
  data: keysData,
  pending: keysPending,
  refresh: refreshKeys,
  error: keysError,
} = await useFetch<AccountApiKeysResponse>('/api/account/api-keys', {
  key: 'account-api-keys',
  query: computed(() => ({
    page: currentPage.value,
    limit: itemsPerPage.value,
  })),
  default: () => ({
    data: [],
    pagination: { page: 1, perPage: itemsPerPage.value, total: 0, totalPages: 0 },
  }),
  watch: [currentPage, itemsPerPage],
});

const apiKeys = computed<AccountApiKey[]>(() => keysData.value?.data ?? []);
const apiKeysPagination = computed(
  () => (keysData.value as AccountApiKeysResponse | null)?.pagination,
);
const showSkeleton = computed(() => keysPending.value && apiKeys.value.length === 0);
const loadError = computed(() => {
  const err = keysError.value;
  if (!err) return null;

  if (err instanceof Error) return err.message;

  return t('account.apiKeys.unableToLoadKeys');
});

const expandedKeys = ref<Set<string>>(new Set());
const sortOrder = ref<'newest' | 'oldest'>('newest');

const sortOptions = [
  { label: t('common.newest'), value: 'newest' },
  { label: t('common.oldest'), value: 'oldest' },
];

const sortedApiKeys = computed(() => {
  const sorted = [...apiKeys.value];
  if (sortOrder.value === 'newest') {
    sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else {
    sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return sorted;
});

function toggleKey(identifier: string) {
  if (expandedKeys.value.has(identifier)) {
    expandedKeys.value.delete(identifier);
  } else {
    expandedKeys.value.add(identifier);
  }
}

function formatJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

function getFullKeyData(key: AccountApiKey) {
  return {
    identifier: key.identifier,
    description: key.description,
    allowed_ips: key.allowed_ips ?? [],
    last_used_at: key.last_used_at,
    created_at: key.created_at,
  };
}

async function copyJson(key: AccountApiKey) {
  const json = formatJson(getFullKeyData(key));
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = json;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
    });
  } catch (error) {
    toast.add({
      title: t('common.failedToCopy'),
      description: error instanceof Error ? error.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}

function resetCreateState() {
  createError.value = null;
  copySuccess.value = false;
  newKeyToken.value = null;
  Object.assign(createForm, keySchema.parse({}));
}

watch(showCreateModal, (open) => {
  if (!open && !newKeyToken.value) {
    resetCreateState();
  }
});

async function createApiKey(event: FormSubmitEvent<KeyFormSchema>) {
  if (isCreating.value) return;

  isCreating.value = true;
  createError.value = null;
  newKeyToken.value = null;
  copySuccess.value = false;

  try {
    const payload = event.data;
    const allowedIps = payload.allowedIps
      .split(',')
      .map((ip: string) => ip.trim())
      .filter(Boolean);

    const formattedIps = allowedIps.length > 0 ? allowedIps : null;

    const response = (await untypedFetch('/api/account/api-keys', {
      method: 'POST',
      body: {
        memo: payload.memo && payload.memo.length > 0 ? payload.memo : null,
        allowedIps: formattedIps,
      },
    })) as ApiKeyResponse;

    if (!response.meta?.secret_token) {
      throw new Error(t('account.apiKeys.tokenNotReturned'));
    }

    newKeyToken.value = response.meta.secret_token;
    Object.assign(createForm, keySchema.parse({}));
    showCreateModal.value = true;

    await refreshKeys();
  } catch (error) {
    console.error('Failed to create API key:', error);

    let message = t('account.apiKeys.failedToCreateKey');
    if (error && typeof error === 'object') {
      const err = error as {
        data?: { message?: string };
        message?: string;
        statusMessage?: string;
      };
      message = err.data?.message || err.message || err.statusMessage || message;
    }

    createError.value = message;

    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    isCreating.value = false;
  }
}

function openDeleteModal(identifier: string) {
  keyToDelete.value = identifier;
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (!keyToDelete.value) {
    return;
  }

  isDeleting.value = true;

  try {
    await untypedFetch(`/api/account/api-keys/${keyToDelete.value}`, {
      method: 'DELETE',
    });

    await refreshKeys();

    showDeleteModal.value = false;
    keyToDelete.value = null;

    toast.add({
      title: t('common.success'),
      description: t('account.apiKeys.keyDeletedDescription'),
      color: 'success',
    });
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('account.apiKeys.failedToDeleteKey'),
      color: 'error',
    });
  } finally {
    isDeleting.value = false;
  }
}

async function copyToken() {
  if (!newKeyToken.value) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(newKeyToken.value);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = newKeyToken.value;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (!successful) {
        throw new Error(t('common.failedToCopy'));
      }
    }

    copySuccess.value = true;
    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
      color: 'success',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common.failedToCopy');
    toast.add({
      title: t('common.failedToCopy'),
      description: message,
      color: 'error',
    });
  }
}
</script>

<template>
  <div>
    <UModal
      v-model:open="showCreateModal"
      :title="newKeyToken ? t('account.apiKeys.apiKeyCreated') : t('account.apiKeys.createKey')"
      :description="
        newKeyToken
          ? t('account.apiKeys.copyYourAPIKeyNow')
          : t('account.apiKeys.generatePersonalAPIKey')
      "
      :dismissible="!newKeyToken"
      :ui="{ body: 'space-y-4', footer: 'flex justify-end gap-2' }"
    >
      <template #body>
        <div v-if="newKeyToken" class="space-y-4">
          <UAlert color="warning" variant="soft" icon="i-lucide-alert-triangle">
            <template #title>{{ t('account.apiKeys.saveThisTokenNow') }}</template>
            <template #description>
              {{ t('account.apiKeys.wontSeeAgainAfterClose') }}
            </template>
          </UAlert>

          <div class="space-y-2">
            <label class="text-sm font-medium">{{ t('account.apiKeys.yourAPIKey') }}</label>
            <div class="flex gap-2">
              <UInput
                :model-value="newKeyToken"
                readonly
                icon="i-lucide-key"
                class="flex-1 font-mono text-sm"
              />
              <UButton icon="i-lucide-copy" variant="soft" @click="copyToken">
                {{ t('common.copy') }}
              </UButton>
            </div>
          </div>
        </div>

        <div v-else class="space-y-4">
          <UAlert v-if="createError" color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('account.apiKeys.unableToCreateKeyTitle') }}</template>
            <template #description>{{ createError }}</template>
          </UAlert>

          <UForm
            :schema="keySchema"
            :state="createForm"
            class="space-y-4"
            :disabled="isCreating"
            @submit="createApiKey"
          >
            <UFormField :label="t('account.apiKeys.descriptionOptional')" name="memo">
              <UInput
                v-model="createForm.memo"
                icon="i-lucide-file-text"
                :placeholder="t('account.apiKeys.myAPIKey')"
                class="w-full"
              />
              <template #help>
                {{ t('account.apiKeys.friendlyNameHelp') }}
              </template>
            </UFormField>

            <UFormField :label="t('account.apiKeys.allowedIPsOptional')" name="allowedIps">
              <UTextarea
                v-model="createForm.allowedIps"
                icon="i-lucide-shield"
                :placeholder="t('account.apiKeys.allowedIPsPlaceholder')"
                class="w-full"
                :rows="3"
              />
              <template #help>
                {{ t('account.apiKeys.commaSeparatedIPsHelp') }}
              </template>
            </UFormField>
          </UForm>
        </div>
      </template>

      <template #footer="{ close }">
        <template v-if="!newKeyToken">
          <UButton
            variant="ghost"
            color="neutral"
            :disabled="isCreating"
            @click="
              () => {
                showCreateModal = false;
                close();
              }
            "
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            type="submit"
            form=""
            icon="i-lucide-plus"
            color="primary"
            variant="subtle"
            :loading="isCreating"
            :disabled="isCreating"
            @click="
              () => createApiKey({ data: createForm } as unknown as FormSubmitEvent<KeyFormSchema>)
            "
          >
            {{ t('common.create') }}
          </UButton>
        </template>
        <template v-else>
          <UButton
            color="primary"
            icon="i-lucide-check"
            @click="
              () => {
                newKeyToken = null;
                showCreateModal = false;
                close();
              }
            "
          >
            {{ t('common.done') }}
          </UButton>
        </template>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('account.apiKeys.deleteAPIKey')"
      :description="t('common.irreversibleAction')"
      :ui="{ footer: 'flex justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle">
            <template #title>{{ t('common.warning') }}</template>
            <template #description>
              {{ t('account.apiKeys.confirmDeleteDescription') }}
            </template>
          </UAlert>
          <div v-if="keyToDelete" class="rounded-md bg-muted p-3">
            <p class="text-sm font-medium">{{ t('account.apiKeys.keyIdentifier') }}</p>
            <code class="text-sm font-mono mt-1">{{ keyToDelete }}</code>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="isDeleting"
          @click="
            () => {
              showDeleteModal = false;
              keyToDelete = null;
              close();
            }
          "
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          :loading="isDeleting"
          :disabled="isDeleting"
          @click="confirmDelete"
        >
          {{ t('common.delete') }}
        </UButton>
      </template>
    </UModal>

    <div>
      <UCard :ui="{ body: 'space-y-3' }">
        <template #header>
          <div class="flex items-center justify-between">
            <div v-if="apiKeys.length > 0" class="flex-1">
              <USelect v-model="sortOrder" :items="sortOptions" value-key="value" class="w-40" />
            </div>
            <UButton variant="subtle" icon="i-lucide-plus" @click="showCreateModal = true">
              {{ t('account.apiKeys.createKey') }}
            </UButton>
          </div>
        </template>
        <UAlert v-if="loadError" color="error" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('account.apiKeys.unableToLoadKeysTitle') }}</template>
          <template #description>{{ loadError }}</template>
        </UAlert>

        <div v-if="showSkeleton" class="space-y-3">
          <USkeleton class="h-16 w-full rounded-md" />
          <USkeleton class="h-16 w-full rounded-md" />
        </div>

        <UEmpty
          v-else-if="apiKeys.length === 0"
          icon="i-lucide-key"
          :title="t('account.apiKeys.noKeys')"
          :description="t('account.apiKeys.noKeysDescription')"
        />

        <div v-else class="space-y-3">
          <div
            v-for="key in sortedApiKeys"
            :key="key.identifier"
            class="rounded-lg border border-default overflow-hidden"
          >
            <button
              class="w-full flex items-center gap-3 p-3 text-left hover:bg-elevated/50 transition-colors"
              @click="toggleKey(key.identifier)"
            >
              <UIcon name="i-lucide-key" class="size-5 shrink-0 text-primary" />

              <div
                class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <div class="flex items-center gap-2 min-w-0">
                    <code class="text-sm font-medium font-mono">{{ key.identifier }}</code>
                    <UIcon
                      :name="
                        expandedKeys.has(key.identifier)
                          ? 'i-lucide-chevron-down'
                          : 'i-lucide-chevron-right'
                      "
                      class="size-4 text-muted-foreground shrink-0"
                    />
                  </div>
                  <UBadge
                    v-if="(key as any).allowed_ips?.length"
                    color="primary"
                    variant="soft"
                    size="xs"
                  >
                    {{ t('account.apiKeys.ipRestricted') }}
                  </UBadge>
                  <p v-if="key.description" class="text-sm text-muted-foreground">
                    {{ key.description }}
                  </p>
                </div>

                <div class="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <span class="truncate">
                    {{ t('account.apiKeys.created') }}:
                    <NuxtTime :datetime="key.created_at" class="font-medium" />
                  </span>
                  <span v-if="key.last_used_at" class="hidden sm:inline">•</span>
                  <span v-if="key.last_used_at" class="truncate">
                    {{ t('account.apiKeys.lastUsed') }}:
                    <NuxtTime :datetime="key.last_used_at" class="font-medium" />
                  </span>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <UButton
                    variant="ghost"
                    color="error"
                    size="xs"
                    icon="i-lucide-trash-2"
                    :loading="isDeleting"
                    :disabled="isDeleting"
                    @click.stop="openDeleteModal(key.identifier)"
                  >
                    {{ t('common.delete') }}
                  </UButton>
                </div>
              </div>
            </button>

            <div
              v-if="expandedKeys.has(key.identifier)"
              class="border-t border-default bg-muted/30 p-4"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {{ t('account.apiKeys.apiKeyData') }}
                  </p>
                  <UButton
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    @click.stop="copyJson(key)"
                  >
                    {{ t('account.apiKeys.copyJSON') }}
                  </UButton>
                </div>
                <pre
                  class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"
                ><code>{{ formatJson(getFullKeyData(key)) }}</code></pre>
              </div>
            </div>
          </div>

          <div
            v-if="apiKeysPagination && apiKeysPagination.totalPages > 1"
            class="flex items-center justify-between border-t border-default pt-4"
          >
            <div class="text-sm text-muted-foreground">
              {{
                t('account.apiKeys.showingKeys', {
                  count: apiKeysPagination.total,
                })
              }}
            </div>

            <UPagination
              v-model:page="currentPage"
              :total="apiKeysPagination.total"
              :items-per-page="apiKeysPagination.perPage"
              size="sm"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
