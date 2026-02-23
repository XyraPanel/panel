<script setup lang="ts">
import type { ServerFileListItem } from '#shared/types/server';
import { useServerFilesManager } from '~/composables/useServerFilesManager';

const route = useRoute();

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const toast = useToast();
const serverId = computed(() => route.params.id as string);
const clientApiBase = computed(() => `/api/client/servers/${serverId.value}`);

const selectedFile = ref<ServerFileListItem | null>(null);
const editorValue = ref('');
const filePending = ref(false);
const fileError = ref<Error | null>(null);
const dirtyFiles = reactive(new Set<string>());
const fileSaving = ref(false);
const isSavingFile = ref(false);
let currentFileRequest: AbortController | null = null;

const filesManager = useServerFilesManager({
  clientApiBase,
  requestFetch: $fetch,
  toast,
  t,
  selectedFile,
});

const {
  currentDirectory,
  directoryPending,
  directoryError,
  currentEntries,
  copyStatus,
  moveStatus,
  deleteStatus,
  downloadStatus,
  compressStatus,
  decompressStatus,
  uploadInProgress,
  pullInProgress,
  newFileModal,
  newFolderModal,
  renameModal,
  chmodModal,
  pullModal,
  deleteModal,
  bulkMoveModal,
  bulkDeleteModal,
  fileUploadInput,
  selectionLabel,
  selectionPreview,
  selectionOverflow,
  hasSelection,
  hasSelectionOverflow,
  allSelected,
  indeterminateSelection,
  canCopySelection,
  canMoveSelection,
  canDeleteSelection,
  canArchiveSelection,
  canUnarchiveSelection,
  directoryDisabled,
  isAnyOperationActive,
  clearSelection,
  isEntrySelected,
  toggleEntrySelection,
  toggleSelectAllEntries,
  openNewFileModal,
  closeNewFileModal,
  submitNewFile,
  openNewFolderModal,
  closeNewFolderModal,
  submitNewFolder,
  openRenameModal,
  closeRenameModal,
  submitRename,
  openDeleteModal,
  closeDeleteModal,
  submitDelete,
  openChmodModal,
  closeChmodModal,
  submitChmod,
  openPullModal,
  submitPull,
  handleBulkCopy,
  openBulkMoveModalWithDefaults,
  closeBulkMoveModal,
  submitBulkMove,
  openBulkDeleteModal,
  closeBulkDeleteModal,
  submitBulkDelete,
  handleBulkArchive,
  handleBulkUnarchive,
  triggerUploadDialog,
  handleFileUpload,
  handleDownload,
} = filesManager;

const fileActions = computed(() => [
  {
    label: t('server.files.newFile'),
    icon: 'i-lucide-file-plus',
    handler: openNewFileModal,
    disabled: directoryPending.value,
  },
  {
    label: t('server.files.newFolder'),
    icon: 'i-lucide-folder-plus',
    handler: openNewFolderModal,
    disabled: directoryPending.value,
  },
  {
    label: t('server.files.upload'),
    icon: 'i-lucide-upload',
    handler: triggerUploadDialog,
    disabled: directoryPending.value,
  },
  {
    label: t('server.files.pullFile'),
    icon: 'i-lucide-link',
    handler: openPullModal,
    disabled: directoryPending.value,
  },
]);

function availableFileActions(file: ServerFileListItem | null) {
  if (!file) return [];

  const actions = [] as Array<{ label: string; icon: string; onClick: () => void }>;

  actions.push({
    label: t('server.files.rename'),
    icon: 'i-lucide-pencil',
    onClick: () => openRenameModal(file),
  });

  if (file.type === 'file') {
    actions.push({
      label: t('server.files.download'),
      icon: 'i-lucide-download',
      onClick: () => handleDownload(file),
    });
    actions.push({
      label: t('server.files.permissions'),
      icon: 'i-lucide-shield',
      onClick: () => openChmodModal(file),
    });
  }

  actions.push({
    label: t('server.files.delete'),
    icon: 'i-lucide-trash',
    onClick: () => openDeleteModal(file),
  });

  return actions;
}

const breadcrumbs = computed(() => {
  const parts = currentDirectory.value.split('/').filter(Boolean);
  let acc = '';

  return parts.map((part) => {
    acc += `/${part}`;
    return { label: part, path: acc };
  });
});

const currentDirectoryLabel = computed(() =>
  currentDirectory.value === '/' ? '/' : currentDirectory.value,
);

const canNavigateUp = computed(() => currentDirectory.value !== '/');

const parentDirectory = computed(() => {
  if (!canNavigateUp.value) return '/';

  const segments = currentDirectory.value.split('/').filter(Boolean);
  segments.pop();
  return segments.length ? `/${segments.join('/')}` : '/';
});

const parentDirectoryLabel = computed(() =>
  parentDirectory.value === '/' ? '/' : parentDirectory.value,
);

const languageInfo = computed(() => {
  const file = selectedFile.value;
  if (!file || file.type !== 'file') return { lang: 'plaintext', label: 'Plain text' };

  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
  const map: Record<string, { lang: string; label: string }> = {
    conf: { lang: 'ini', label: 'Config' },
    properties: { lang: 'ini', label: 'INI' },
    ini: { lang: 'ini', label: 'INI' },
    json: { lang: 'json', label: 'JSON' },
    js: { lang: 'javascript', label: 'JavaScript' },
    ts: { lang: 'typescript', label: 'TypeScript' },
    yml: { lang: 'yaml', label: 'YAML' },
    yaml: { lang: 'yaml', label: 'YAML' },
    log: { lang: 'plaintext', label: 'Log' },
    txt: { lang: 'plaintext', label: 'Plain text' },
    md: { lang: 'markdown', label: 'Markdown' },
  };

  if (extension && map[extension]) return map[extension];

  return { lang: 'plaintext', label: 'Plain text' };
});

const editorLanguage = computed(() => languageInfo.value.lang);
const editorLanguageLabel = computed(() => languageInfo.value.label);

watch(selectedFile, async (file, previous) => {
  if (isSavingFile.value || fileSaving.value) {
    return;
  }

  if (file && file.path === previous?.path && file.type === previous?.type) {
    return;
  }

  if (currentFileRequest) {
    currentFileRequest.abort();
    currentFileRequest = null;
  }

  if (previous?.path && previous.path !== file?.path) dirtyFiles.delete(previous.path);

  if (!file || file.type !== 'file') {
    editorValue.value = '';
    fileError.value = null;
    filePending.value = false;
    return;
  }

  if (file.path === previous?.path && dirtyFiles.has(file.path) && editorValue.value) {
    return;
  }

  const abortController = new AbortController();
  currentFileRequest = abortController;

  filePending.value = true;
  fileError.value = null;
  editorValue.value = '';

  try {
    const url = `${clientApiBase.value}/files/contents`;

    const response = await $fetch<{ data: { path: string; content: string } }>(url, {
      query: { file: file.path },
      headers: {
        Accept: 'application/json',
      },
      signal: abortController.signal,
    });

    if (abortController.signal.aborted) {
      return;
    }

    if (selectedFile.value?.path !== file.path) {
      return;
    }

    if (!response || !response.data) {
      throw new Error('Invalid response from server: missing data');
    }

    const fileData = response.data;

    if (selectedFile.value?.path === file.path) {
      editorValue.value = fileData.content || '';
      fileError.value = null;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    if (selectedFile.value?.path !== file.path) {
      return;
    }

    let errorMessage = 'Unable to load file contents. Please check the server console for details.';

    if (error && typeof error === 'object') {
      if ('data' in error && error.data) {
        if (typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message);
        } else if (typeof error.data === 'string') {
          errorMessage = error.data;
        }
      }
      if ('message' in error && error.message) {
        errorMessage = String(error.message);
      } else if ('statusMessage' in error && error.statusMessage) {
        errorMessage = String(error.statusMessage);
      } else if ('statusText' in error && error.statusText) {
        errorMessage = String(error.statusText);
      }
    } else if (typeof error === 'string' && error) {
      errorMessage = error;
    }

    if (!errorMessage || errorMessage.trim().length === 0 || errorMessage === '1') {
      errorMessage =
        'Unable to load file contents. The server may be offline or the file may not exist.';
    }

    if (selectedFile.value?.path === file.path) {
      fileError.value = new Error(errorMessage);
      editorValue.value = '';
    }
  } finally {
    if (currentFileRequest === abortController) {
      filePending.value = false;
      currentFileRequest = null;
    }
  }
});

watch(
  editorValue,
  (value, previousValue) => {
    const file = selectedFile.value;
    if (file?.type === 'file') {
      if (value !== undefined && value !== previousValue) {
        dirtyFiles.add(file.path);
      }
    }
  },
  { flush: 'post' },
);

onUnmounted(() => {
  if (currentFileRequest) {
    currentFileRequest.abort();
    currentFileRequest = null;
  }
});

function navigateUp() {
  if (canNavigateUp.value) {
    currentDirectory.value = parentDirectory.value;
  }
}

function handleEntryClick(entry: ServerFileListItem) {
  if (entry.type === 'directory') {
    currentDirectory.value = entry.path;
    return;
  }

  if (entry.type === 'file') {
    selectedFile.value = entry;
  }
}

function resetEditor() {
  const file = selectedFile.value;
  if (!file || file.type !== 'file') return;

  selectedFile.value = { ...file };
}

async function saveEditor(event?: Event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const file = selectedFile.value;
  if (!file || file.type !== 'file') {
    return;
  }

  if (!isEditorDirty.value) {
    return;
  }

  if (fileSaving.value) {
    return;
  }

  const content = editorValue.value || '';

  try {
    fileSaving.value = true;
    isSavingFile.value = true;

    const url = `${clientApiBase.value}/files/write`;
    const body = {
      file: file.path,
      content: content,
    };

    const response = await $fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    if (typeof response === 'string' && response.includes('<!DOCTYPE html>')) {
      throw new Error(
        'Route not found - received HTML instead of JSON. The API endpoint may not be registered. Please restart the dev server.',
      );
    }

    dirtyFiles.delete(file.path);

    toast.add({
      title: t('common.success'),
      description: t('server.files.title'),
    });

    selectedFile.value = null;
  } catch (error) {
    let errorMessage = 'Unable to save file contents.';
    if (error && typeof error === 'object') {
      if ('data' in error && error.data) {
        if (typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message);
        } else if (typeof error.data === 'string') {
          errorMessage = error.data;
        }
      }
      if ('message' in error && error.message) {
        errorMessage = String(error.message);
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    toast.add({
      color: 'error',
      title: t('common.error'),
      description: errorMessage,
    });
  } finally {
    fileSaving.value = false;
    await nextTick();
    setTimeout(() => {
      isSavingFile.value = false;
    }, 100);
  }
}

const isEditorDirty = computed(() => {
  const file = selectedFile.value;
  if (!file || file.type !== 'file') return false;

  return dirtyFiles.has(file.path);
});
</script>

<template>
  <div>
    <UPage>
      <UPageBody>
        <UContainer>
          <section class="space-y-6">
            <div v-if="isAnyOperationActive" class="space-y-2">
              <UAlert v-if="uploadInProgress" color="info" icon="i-lucide-upload">
                {{ t('server.files.uploadInProgress') }}
              </UAlert>
              <UAlert v-if="pullInProgress" color="info" icon="i-lucide-link">
                {{ t('server.files.pullingRemoteFile') }}
              </UAlert>
              <UAlert v-if="downloadStatus.active" color="info" icon="i-lucide-download">
                {{ t('server.files.preparingDownload', { name: downloadStatus.name }) }}
              </UAlert>
              <UAlert v-if="copyStatus.active" color="info" icon="i-lucide-copy">
                {{ copyStatus.summary || t('server.files.copyingSelectedFiles') }}
              </UAlert>
              <UAlert v-if="moveStatus.active" color="info" icon="i-lucide-move">
                {{ moveStatus.summary || t('server.files.movingSelectedFiles') }}
              </UAlert>
              <UAlert v-if="deleteStatus.active" color="warning" icon="i-lucide-trash">
                {{ deleteStatus.summary || t('server.files.deletingSelectedFiles') }}
              </UAlert>
              <UAlert v-if="compressStatus.active" color="info" icon="i-lucide-file-archive">
                {{ t('server.files.compressing', { target: compressStatus.target }) }}
              </UAlert>
              <UAlert v-if="decompressStatus.active" color="info" icon="i-lucide-box">
                {{ t('server.files.extracting', { target: decompressStatus.target }) }}
              </UAlert>
            </div>

            <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div
                v-if="currentDirectoryLabel !== '/' || breadcrumbs.length"
                class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <span v-if="!breadcrumbs.length" class="font-mono text-sm text-foreground">{{
                  currentDirectoryLabel
                }}</span>
                <div v-if="breadcrumbs.length" class="flex flex-wrap items-center gap-1">
                  <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
                    <span v-if="index > 0" class="text-muted-foreground/50">/</span>
                    <span
                      class="rounded border border-default/60 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      {{ crumb.label }}
                    </span>
                  </template>
                </div>
              </div>

              <ServerFilesActionToolbar
                :actions="fileActions"
                :show-loading-badge="directoryPending"
              >
                <input
                  ref="fileUploadInput"
                  type="file"
                  class="hidden"
                  @change="handleFileUpload"
                />
                <template #loadingLabel>
                  {{ t('server.files.loading') }}
                </template>
              </ServerFilesActionToolbar>
            </div>

            <div class="flex flex-col gap-6 min-h-[calc(100vh-300px)]">
              <ServerFilesDirectoryView
                v-if="!selectedFile || selectedFile.type !== 'file'"
                class="flex-1 overflow-hidden"
                :current-entries="currentEntries"
                :directory-pending="directoryPending"
                :directory-error="directoryError"
                :can-navigate-up="canNavigateUp"
                :parent-directory-label="parentDirectoryLabel"
                :on-navigate-up="navigateUp"
                :all-selected="allSelected"
                :indeterminate-selection="indeterminateSelection"
                :toggle-select-all-entries="toggleSelectAllEntries"
                :is-entry-selected="isEntrySelected"
                :toggle-entry-selection="toggleEntrySelection"
                :handle-entry-click="handleEntryClick"
                :available-file-actions="availableFileActions"
                :has-selection="hasSelection"
                :selection-label="selectionLabel"
                :can-copy-selection="canCopySelection"
                :can-move-selection="canMoveSelection"
                :can-archive-selection="canArchiveSelection"
                :can-unarchive-selection="canUnarchiveSelection"
                :can-delete-selection="canDeleteSelection"
                :copy-status-active="copyStatus.active"
                :move-status-active="moveStatus.active"
                :compress-status-active="compressStatus.active"
                :decompress-status-active="decompressStatus.active"
                :delete-status-active="deleteStatus.active"
                :directory-disabled="directoryDisabled"
                :handle-bulk-copy="handleBulkCopy"
                :open-bulk-move-modal-with-defaults="openBulkMoveModalWithDefaults"
                :handle-bulk-archive="handleBulkArchive"
                :handle-bulk-unarchive="handleBulkUnarchive"
                :open-bulk-delete-modal="openBulkDeleteModal"
                :clear-selection="clearSelection"
              />

              <UCard v-else>
                <template #header>
                  <nav
                    class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <button
                      class="flex items-center gap-2 hover:text-foreground"
                      type="button"
                      @click="selectedFile = null"
                    >
                      <UIcon name="i-lucide-arrow-left" class="size-3" />
                      {{ t('server.files.backToFiles') }}
                    </button>
                    <div class="flex items-center gap-2">
                      <span class="uppercase">{{ t('server.files.editing') }}</span>
                      <span class="font-semibold text-foreground">{{ selectedFile.name }}</span>
                      <UBadge color="neutral">{{ editorLanguageLabel }}</UBadge>
                    </div>
                  </nav>
                </template>

                <div class="flex flex-col gap-4">
                  <UAlert
                    v-if="fileError"
                    color="error"
                    icon="i-lucide-alert-circle"
                    :title="t('server.files.errorLoadingFile')"
                  >
                    {{
                      fileError?.message ||
                      fileError?.toString() ||
                      t('server.files.failedToLoadFileContents')
                    }}
                  </UAlert>

                  <div
                    class="relative min-h-[60vh] overflow-hidden rounded-md border border-default/80"
                    tabindex="0"
                    :aria-label="t('server.files.editing') + ': ' + (selectedFile?.name ?? '')"
                    role="region"
                  >
                    <div
                      v-if="filePending"
                      class="absolute inset-0 z-10 flex items-center justify-center bg-background/80"
                    >
                      <span class="text-sm text-muted-foreground">{{
                        t('server.files.loadingFile')
                      }}</span>
                    </div>
                    <ClientOnly>
                      <template #default>
                        <MonacoEditor
                          v-if="selectedFile && !filePending"
                          :key="selectedFile.path"
                          v-model="editorValue"
                          :lang="editorLanguage"
                          :options="{
                            theme: 'vs-dark',
                            automaticLayout: true,
                            readOnly: filePending,
                            minimap: { enabled: true },
                            fontSize: 14,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            tabSize: 2,
                          }"
                          class="w-full"
                          :style="{ minHeight: '60vh', height: '60vh' }"
                        />
                      </template>
                      <template #fallback>
                        <div class="flex h-full items-center justify-center">
                          <UIcon
                            name="i-lucide-loader-2"
                            class="size-8 animate-spin text-primary"
                          />
                        </div>
                      </template>
                    </ClientOnly>
                  </div>

                  <div class="flex flex-wrap items-center justify-end gap-2">
                    <UButton
                      icon="i-lucide-rotate-ccw"
                      variant="ghost"
                      color="neutral"
                      :disabled="!isEditorDirty || fileSaving"
                      @click="resetEditor"
                    >
                      {{ t('server.files.resetChanges') }}
                    </UButton>
                    <UButton
                      type="button"
                      icon="i-lucide-save"
                      :loading="fileSaving"
                      :disabled="!isEditorDirty || fileSaving"
                      @click="saveEditor"
                    >
                      {{ t('server.files.saveChanges') }}
                    </UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </section>
        </UContainer>
      </UPageBody>
    </UPage>
    <UModal
      v-model:open="newFileModal.open"
      :title="t('server.files.newFile')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UForm class="space-y-4" @submit.prevent="submitNewFile">
          <UFormField :label="t('common.name')" name="fileName" required>
            <UInput
              v-model="newFileModal.name"
              :placeholder="t('server.files.newFilePlaceholder')"
              autofocus
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="newFileModal.loading"
              @click="closeNewFileModal"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton type="submit" :loading="newFileModal.loading">
              {{ t('server.files.createFile') }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="newFolderModal.open"
      :title="t('server.files.newFolder')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UForm class="space-y-4" @submit.prevent="submitNewFolder">
          <UFormField :label="t('common.name')" name="folderName" required>
            <UInput
              v-model="newFolderModal.name"
              :placeholder="t('server.files.newFolderPlaceholder')"
              autofocus
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="newFolderModal.loading"
              @click="closeNewFolderModal"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton type="submit" :loading="newFolderModal.loading">
              {{ t('server.files.createFolder') }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="renameModal.open"
      :title="t('server.files.rename')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UForm class="space-y-4" @submit.prevent="submitRename">
          <UFormField :label="t('common.name')" name="newName" required>
            <UInput v-model="renameModal.value" :placeholder="t('server.files.rename')" autofocus />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="renameModal.loading"
              @click="closeRenameModal"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton type="submit" :loading="renameModal.loading">
              {{ t('server.files.rename') }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteModal.open"
      :title="t('server.files.delete')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm text-muted-foreground">
          {{ t('common.delete') }}
          <strong>{{ deleteModal.file?.name }}</strong
          >? {{ t('common.delete') }}
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            :disabled="deleteModal.loading"
            @click="closeDeleteModal"
          >
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="error" :loading="deleteModal.loading" @click="submitDelete">
            {{ t('server.files.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="chmodModal.open"
      :title="`${t('server.files.permissions')} - ${chmodModal.file?.name}`"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UForm class="space-y-4" @submit.prevent="submitChmod">
          <div
            v-if="chmodModal.file"
            class="rounded-md border border-default/60 bg-muted/10 p-3 text-sm"
          >
            <p class="text-muted-foreground">
              {{ t('server.files.permissions') }}: <strong>{{ chmodModal.file.mode }}</strong>
            </p>
          </div>
          <UFormField
            :label="t('server.files.permissions')"
            name="fileMode"
            :help="t('server.files.permissions')"
            required
          >
            <UInput v-model="chmodModal.value" placeholder="755" autofocus />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="chmodModal.loading"
              @click="closeChmodModal"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton type="submit" :loading="chmodModal.loading">
              {{ t('common.update') }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <ServerFilesPullFileModal
      v-model="pullModal.open"
      v-model:value="pullModal.url"
      :loading="pullModal.loading"
      :current-directory-label="currentDirectoryLabel"
      @submit="submitPull"
    />

    <UModal
      v-model:open="bulkMoveModal.open"
      :title="t('server.files.moveSelectedItems')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <div
            class="rounded-md border border-default/60 bg-muted/10 p-3 text-xs text-muted-foreground"
          >
            <p class="font-medium text-foreground">{{ selectionLabel }}</p>
            <ul class="mt-2 space-y-1">
              <li v-for="item in selectionPreview" :key="item.path" class="truncate">
                • {{ item.name }}
              </li>
              <li v-if="hasSelectionOverflow" class="italic text-muted-foreground">
                {{ t('server.files.andMore', { count: selectionOverflow }) }}
              </li>
            </ul>
          </div>

          <UForm class="space-y-4" @submit.prevent="submitBulkMove">
            <UFormField
              :label="t('server.files.destinationDirectory')"
              name="destination"
              :help="t('server.files.destinationDirectoryHelp')"
              required
            >
              <UInput
                v-model="bulkMoveModal.destination"
                :placeholder="t('server.files.destinationDirectoryPlaceholder')"
                :disabled="bulkMoveModal.loading"
              />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="bulkMoveModal.loading"
                @click="closeBulkMoveModal"
              >
                {{ t('common.cancel') }}
              </UButton>
              <UButton type="submit" :loading="bulkMoveModal.loading">
                {{ t('server.files.moveItems') }}
              </UButton>
            </div>
          </UForm>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="bulkDeleteModal.open"
      :title="t('server.files.deleteSelectedItems')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4 text-sm text-muted-foreground">
          <p>
            {{ t('server.files.deleteSelectedItemsDescription') }}
          </p>
          <div class="rounded-md border border-default/60 bg-muted/10 p-3 text-xs">
            <p class="font-medium text-foreground">{{ selectionLabel }}</p>
            <ul class="mt-2 space-y-1">
              <li v-for="item in selectionPreview" :key="item.path" class="truncate">
                • {{ item.name }}
              </li>
              <li v-if="hasSelectionOverflow" class="italic text-muted-foreground">
                {{ t('server.files.andMore', { count: selectionOverflow }) }}
              </li>
            </ul>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="bulkDeleteModal.loading"
              @click="closeBulkDeleteModal"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton color="error" :loading="bulkDeleteModal.loading" @click="submitBulkDelete">
              {{ t('server.files.deleteSelected') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
