<script setup lang="ts">
import type {
  WingsNodeConfiguration,
  WingsNodeSummary,
  WingsSystemInformation,
} from '#shared/types/wings';

definePageMeta({
  auth: true,
  adminTitle: 'Nodes',
  adminSubtitle: 'Manage Wings daemons and monitor node health',
});

const { t } = useI18n();
const toast = useToast();
const requestURL = useRequestURL();
const requestFetch = useRequestFetch();

const panelOrigin = computed(() => requestURL.origin);

const showCreate = ref(false);
const showDeleteModal = ref(false);
const isSubmitting = ref(false);
const issuingFor = ref<string | null>(null);
const loadingConfigFor = ref<string | null>(null);
const nodeToDelete = ref<WingsNodeSummary | null>(null);
const isDeleting = ref(false);

const resetDeleteModal = () => {
  showDeleteModal.value = false;
  nodeToDelete.value = null;
};

const tokenModal = reactive({
  visible: false,
  command: '',
  token: '',
  nodeName: '',
  nodeId: '',
  allowInsecure: false,
  error: '' as string | null,
});

const createState = reactive({
  name: '',
  description: '',
  baseURL: '',
  apiToken: '',
  allowInsecure: false,
});

const systemModal = reactive({
  visible: false,
  loading: false,
  nodeId: '' as string,
  nodeName: '' as string,
  info: null as WingsSystemInformation | null,
  error: '' as string | null,
});

const {
  data: nodesResponse,
  pending,
  error,
} = await useAsyncData('wings-nodes', () =>
  requestFetch<{ data: WingsNodeSummary[] }>('/api/wings/nodes'),
);

const nodes = computed(() => nodesResponse.value?.data ?? []);

function resetCreateForm() {
  createState.name = '';
  createState.description = '';
  createState.baseURL = '';
  createState.apiToken = '';
  createState.allowInsecure = false;
}

async function handleCreateNode() {
  isSubmitting.value = true;
  try {
    const payload: Record<string, unknown> = {
      name: createState.name,
      description: createState.description || undefined,
      baseURL: createState.baseURL,
      allowInsecure: createState.allowInsecure,
    };

    if (createState.apiToken.trim().length > 0) {
      payload.apiToken = createState.apiToken.trim();
    }

    await $fetch('/api/wings/nodes', {
      method: 'POST',
      body: payload,
    });
    toast.add({ title: t('admin.nodes.nodeRegistered'), color: 'primary' });
    resetCreateForm();
    showCreate.value = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : t('admin.nodes.unableToRegisterNode');
    toast.add({
      title: t('admin.nodes.failedToRegisterNode'),
      description: message,
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDeleteNode() {
  if (!nodeToDelete.value) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/wings/nodes/${nodeToDelete.value.id}`, { method: 'DELETE' });
    toast.add({ title: t('admin.nodes.nodeRemoved'), color: 'primary' });
    resetDeleteModal();
  } catch (err) {
    const message = err instanceof Error ? err.message : t('admin.nodes.unableToRemoveNode');
    toast.add({ title: t('admin.nodes.failedToRemoveNode'), description: message, color: 'error' });
  } finally {
    isDeleting.value = false;
  }
}

async function handleIssueToken(node: WingsNodeSummary) {
  issuingFor.value = node.id;
  tokenModal.error = null;

  try {
    const response = await $fetch<{ data: { token: string } }>(
      `/api/admin/wings/nodes/${node.id}/token`,
      {
        method: 'POST',
      },
    );

    const token = response.data.token;
    const commandParts = [
      'wings configure',
      `--panel-url ${panelOrigin.value}`,
      `--node ${node.uuid}`,
      `--token ${token}`,
    ];

    if (node.allowInsecure) {
      commandParts.push('--allow-insecure');
    }

    tokenModal.visible = true;
    tokenModal.command = commandParts.join(' ');
    tokenModal.token = token;
    tokenModal.nodeName = node.name;
    tokenModal.nodeId = node.id;
    tokenModal.allowInsecure = node.allowInsecure;
  } catch (err) {
    const message = err instanceof Error ? err.message : t('admin.nodes.failedToIssueToken');
    tokenModal.error = message;
    toast.add({ title: t('admin.nodes.failedToIssueToken'), description: message, color: 'error' });
  } finally {
    issuingFor.value = null;
  }
}

async function copyInstallCommand() {
  if (!tokenModal.command) {
    return;
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(tokenModal.command);
      toast.add({ title: t('admin.nodes.commandCopied'), color: 'primary' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common.failedToCopy');
    toast.add({ title: t('common.failedToCopy'), description: message, color: 'error' });
  }
}

function resetSystemModal() {
  systemModal.loading = false;
  systemModal.nodeId = '';
  systemModal.nodeName = '';
  systemModal.info = null;
  systemModal.error = null;
}

async function fetchSystemInformation(nodeId: string) {
  systemModal.loading = true;
  systemModal.error = null;
  try {
    const response = await $fetch<{ data: WingsSystemInformation }>(
      `/api/admin/wings/nodes/${nodeId}/system`,
    );
    systemModal.info = response.data;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t('admin.nodes.failedToRetrieveSystemInfo');
    systemModal.error = message;
    toast.add({
      title: t('admin.nodes.failedToLoadSystemInfo'),
      description: message,
      color: 'error',
    });
  } finally {
    systemModal.loading = false;
  }
}

async function handleViewSystemInfo(node: WingsNodeSummary) {
  systemModal.visible = true;
  systemModal.nodeId = node.id;
  systemModal.nodeName = node.name;
  systemModal.info = null;
  await fetchSystemInformation(node.id);
}

async function handleDownloadConfiguration(node: WingsNodeSummary) {
  if (typeof window === 'undefined') {
    toast.add({
      title: t('admin.nodes.unsupportedEnvironment'),
      description: t('admin.nodes.configurationDownloadBrowserOnly'),
      color: 'warning',
    });
    return;
  }

  loadingConfigFor.value = node.id;
  try {
    const response = await $fetch<{ data: WingsNodeConfiguration }>(
      `/api/admin/wings/nodes/${node.id}/configuration`,
    );
    const serialized = JSON.stringify(response.data, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    const slug =
      node.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || node.id;
    anchor.href = url;
    anchor.download = `wings-node-${slug}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    toast.add({ title: t('admin.nodes.configurationDownloaded'), color: 'primary' });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t('admin.nodes.failedToDownloadConfiguration');
    toast.add({
      title: t('admin.nodes.configurationDownloadFailed'),
      description: message,
      color: 'error',
    });
  } finally {
    loadingConfigFor.value = null;
  }
}

watch(
  () => systemModal.visible,
  (open) => {
    if (!open) {
      resetSystemModal();
    }
  },
);
</script>

<template>
  <div>
    <UPage>
      <UPageBody>
        <UContainer>
          <section class="space-y-6">
            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <div class="flex justify-end">
                  <UButton
                    icon="i-lucide-plus"
                    color="primary"
                    variant="subtle"
                    @click="showCreate = true"
                  >
                    {{ t('admin.nodes.addNode') }}
                  </UButton>
                </div>
              </template>

              <div v-if="pending" class="flex flex-col gap-3">
                <USkeleton class="h-16" repeat="3" />
              </div>
              <div
                v-else-if="error"
                class="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
              >
                {{ t('admin.nodes.unableToLoadNodes') }}:
                {{ (error as Error).message || t('common.unknown') }}
              </div>
              <div v-else>
                <UEmpty
                  v-if="nodes.length === 0"
                  icon="i-lucide-server"
                  :title="t('admin.nodes.noNodesLinked')"
                  :description="t('admin.nodes.description')"
                />
                <div v-else class="overflow-hidden rounded-lg border border-default">
                  <div
                    class="grid grid-cols-12 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <span class="col-span-4">{{ t('common.name') }}</span>
                    <span class="col-span-4">{{ t('admin.nodes.endpoint') }}</span>
                    <span class="col-span-2">{{ t('admin.nodes.token') }}</span>
                    <span class="col-span-2 text-right">{{ t('common.actions') }}</span>
                  </div>
                  <div class="divide-y divide-default">
                    <div
                      v-for="node in nodes"
                      :key="node.id"
                      class="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
                    >
                      <div class="col-span-4 space-y-1">
                        <NuxtLink
                          :to="`/admin/nodes/${node.id}`"
                          class="text-sm font-semibold text-primary hover:underline"
                        >
                          {{ node.name }}
                        </NuxtLink>
                        <p class="text-xs text-muted-foreground">
                          {{ t('admin.nodes.id') }}: {{ node.id }}
                        </p>
                        <p v-if="node.description" class="text-xs text-muted-foreground">
                          {{ node.description }}
                        </p>
                      </div>
                      <div class="col-span-4 space-y-1 text-xs text-muted-foreground">
                        <code class="block truncate">{{ node.baseURL }}</code>
                        <span>{{
                          node.allowInsecure
                            ? t('admin.nodes.tlsVerificationDisabled')
                            : t('admin.nodes.tlsVerificationEnforced')
                        }}</span>
                        <span>
                          {{ t('admin.nodes.updated') }}
                          <NuxtTime :datetime="node.updatedAt" />
                        </span>
                      </div>
                      <div class="col-span-2">
                        <UBadge
                          :color="node.hasToken ? 'neutral' : 'warning'"
                          :variant="node.hasToken ? 'outline' : 'soft'"
                          size="sm"
                        >
                          {{
                            node.hasToken
                              ? t('admin.nodes.configured')
                              : t('admin.nodes.missingToken')
                          }}
                        </UBadge>
                      </div>
                      <div class="col-span-2 flex justify-end gap-2">
                        <UButton
                          icon="i-lucide-activity"
                          size="xs"
                          variant="ghost"
                          :loading="systemModal.loading && systemModal.nodeId === node.id"
                          :aria-label="t('admin.nodes.systemInformation')"
                          @click="handleViewSystemInfo(node)"
                        />
                        <UButton
                          icon="i-lucide-download"
                          size="xs"
                          variant="ghost"
                          :loading="loadingConfigFor === node.id"
                          :aria-label="t('admin.nodes.downloadConfiguration')"
                          @click="handleDownloadConfiguration(node)"
                        />
                        <UButton
                          icon="i-lucide-terminal"
                          size="xs"
                          color="primary"
                          variant="ghost"
                          :loading="issuingFor === node.id"
                          :aria-label="t('admin.nodes.issueToken')"
                          @click="handleIssueToken(node)"
                        />
                        <UButton
                          icon="i-lucide-trash"
                          size="xs"
                          color="error"
                          variant="ghost"
                          :aria-label="t('common.delete')"
                          @click="
                            nodeToDelete = node;
                            showDeleteModal = true;
                          "
                        />
                      </div>
                    </div>
                  </div>

                  <div class="border-t border-default px-4 py-4">
                    <p class="text-xs text-muted-foreground">
                      {{ t('admin.nodes.showingNodes', { count: nodes.length }) }}
                    </p>
                  </div>
                </div>
              </div>
            </UCard>
          </section>
        </UContainer>
      </UPageBody>
    </UPage>

    <UModal
      v-model:open="showCreate"
      :title="t('admin.nodes.registerNode')"
      :description="t('admin.nodes.registerNodeDescription')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UForm :state="createState" class="space-y-4" @submit.prevent="handleCreateNode">
          <UFormField :label="t('admin.nodes.nodeName')" name="name" required>
            <UInput
              v-model="createState.name"
              :placeholder="t('admin.nodes.nodeNamePlaceholder')"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.nodes.nodeDescription')" name="description">
            <UTextarea
              v-model="createState.description"
              :placeholder="t('admin.nodes.nodeDescriptionPlaceholder')"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.nodes.baseURL')"
            name="baseURL"
            required
            :help="t('admin.nodes.baseURLHelp')"
          >
            <UInput v-model="createState.baseURL" type="url" required class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.nodes.apiToken')"
            name="apiToken"
            :help="t('admin.nodes.apiTokenHelp')"
          >
            <UInput v-model="createState.apiToken" type="password" class="w-full" />
          </UFormField>
          <UFormField name="allowInsecure">
            <label class="flex items-center justify-between gap-2 text-sm">
              <span>{{ t('admin.nodes.allowInsecureTLS') }}</span>
              <USwitch v-model="createState.allowInsecure" />
            </label>
          </UFormField>
        </UForm>
      </template>

      <template #footer>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="showCreate = false">{{ t('common.cancel') }}</UButton>
          <UButton
            type="submit"
            color="primary"
            variant="subtle"
            :loading="isSubmitting"
            @click="handleCreateNode"
            >{{ t('admin.nodes.saveNode') }}</UButton
          >
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="tokenModal.visible"
      :title="t('admin.nodes.wingsDeploymentCommand')"
      :description="
        t('admin.nodes.runOnWingsHost', { name: tokenModal.nodeName, id: tokenModal.nodeId })
      "
      :ui="{ footer: 'justify-between items-center' }"
    >
      <template #body>
        <div class="space-y-4">
          <div
            v-if="tokenModal.error"
            class="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {{ tokenModal.error }}
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{
              t('admin.nodes.command')
            }}</label>
            <UTextarea
              :model-value="tokenModal.command"
              readonly
              autoresize
              class="font-mono text-sm w-full"
            />
          </div>
          <div class="space-y-1 text-xs text-muted-foreground">
            <p>{{ t('admin.nodes.includesWingsConfigureFlags') }}</p>
            <ul class="list-disc pl-5">
              <li><code>--panel-url</code> {{ t('admin.nodes.setTo') }} {{ panelOrigin }}</li>
              <li><code>--node</code> {{ t('admin.nodes.setTo') }} {{ tokenModal.nodeId }}</li>
              <li><code>--token</code> {{ t('admin.nodes.setToFreshlyIssuedToken') }}</li>
              <li v-if="tokenModal.allowInsecure">
                <code>--allow-insecure</code> {{ t('admin.nodes.toDisableTLSVerification') }}
              </li>
            </ul>
          </div>
        </div>
      </template>

      <template #footer>
        <div
          class="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-4"
        >
          <span
            >{{ t('admin.nodes.token') }}:
            <code class="break-all">{{ tokenModal.token }}</code></span
          >
        </div>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="tokenModal.visible = false">{{
            t('common.close')
          }}</UButton>
          <UButton color="primary" icon="i-lucide-clipboard" @click="copyInstallCommand">{{
            t('admin.nodes.copyCommand')
          }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="systemModal.visible"
      :title="
        t('admin.nodes.systemInformationModal', {
          name: systemModal.nodeName || t('admin.nodes.wingsNode'),
        })
      "
      :description="t('admin.nodes.systemInformationModalDescription')"
      :ui="{ footer: 'justify-between items-center flex-wrap gap-3' }"
    >
      <template #body>
        <div class="space-y-4">
          <div v-if="systemModal.loading" class="space-y-2">
            <USkeleton class="h-4" repeat="4" />
          </div>
          <UAlert v-else-if="systemModal.error" color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('admin.nodes.unableToRetrieveSystemInfo') }}</template>
            <template #description>{{ systemModal.error }}</template>
          </UAlert>
          <div v-else class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{
              t('admin.nodes.latestSnapshot')
            }}</label>
            <pre class="max-h-105 overflow-auto rounded bg-muted/40 p-3 text-xs leading-relaxed">
      {{ JSON.stringify(systemModal.info, null, 2) }}
    </pre
            >
          </div>
        </div>
      </template>

      <template #footer>
        <span class="text-xs text-muted-foreground">{{
          t('admin.nodes.fetchedFromWingsAPI')
        }}</span>
        <div class="flex items-center gap-2">
          <UButton variant="ghost" @click="systemModal.visible = false">{{
            t('common.close')
          }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :title="t('admin.nodes.deleteNode')"
      :description="t('admin.nodes.confirmDeleteNodeDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('common.warning') }}</template>
          <template #description>{{ t('admin.nodes.deleteNodeWarning') }}</template>
        </UAlert>
        <div v-if="nodeToDelete" class="rounded-md bg-muted p-3 text-sm">
          <p class="font-medium">
            {{ t('common.name') }}: <span class="text-foreground">{{ nodeToDelete.name }}</span>
          </p>
          <p class="text-muted-foreground mt-2">
            {{ t('admin.nodes.id') }}: <code class="font-mono">{{ nodeToDelete.id }}</code>
          </p>
          <p v-if="nodeToDelete.description" class="text-muted-foreground mt-2">
            {{ nodeToDelete.description }}
          </p>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" :disabled="isDeleting" @click="resetDeleteModal">
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          :loading="isDeleting"
          @click="handleDeleteNode"
        >
          {{ t('admin.nodes.deleteNode') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
