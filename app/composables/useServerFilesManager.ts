import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { ServerFileEntry, ServerFileListItem } from '#shared/types/server';

type ToastColor = 'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'neutral';

interface ToastOptions {
  title?: string;
  description?: string;
  color?: ToastColor;
  [key: string]: unknown;
}

interface UseServerFilesManagerOptions {
  clientApiBase: ComputedRef<string>;
  requestFetch: typeof $fetch;
  toast: { add: (options: ToastOptions) => void };
  t: (key: string, params?: Record<string, string | number>) => string;
  selectedFile: Ref<ServerFileListItem | null>;
}

export function useServerFilesManager(options: UseServerFilesManagerOptions) {
  const { clientApiBase, requestFetch, toast, t, selectedFile } = options;

  const rootDirectory = '/';
  const currentDirectory = ref(rootDirectory);
  const directoryPending = ref(false);
  const directoryError = ref<Error | null>(null);
  const directoryEntries = ref<ServerFileEntry[]>([]);

  const fileUploadInput = ref<HTMLInputElement | null>(null);
  const uploadInProgress = ref(false);
  const pullInProgress = ref(false);

  const newFileModal = reactive({ open: false, name: '', loading: false });
  const newFolderModal = reactive({ open: false, name: '', loading: false });
  const renameModal = reactive({
    open: false,
    file: null as ServerFileListItem | null,
    value: '',
    loading: false,
  });
  const chmodModal = reactive({
    open: false,
    file: null as ServerFileListItem | null,
    value: '755',
    loading: false,
  });
  const pullModal = reactive({ open: false, url: '', loading: false });
  const deleteModal = reactive({
    open: false,
    file: null as ServerFileListItem | null,
    loading: false,
  });
  const bulkMoveModal = reactive({ open: false, destination: '/', loading: false });
  const bulkDeleteModal = reactive({ open: false, loading: false });

  const downloadStatus = reactive({ active: false, name: '' });
  const compressStatus = reactive({ active: false, target: '' });
  const decompressStatus = reactive({ active: false, target: '' });
  const copyStatus = reactive({ active: false, summary: '' });
  const moveStatus = reactive({ active: false, summary: '' });
  const deleteStatus = reactive({ active: false, summary: '' });

  const selectedPaths = ref<string[]>([]);
  const archiveExtensions = ['.zip', '.tar', '.tar.gz', '.tgz', '.gz'];
  const lastRequestedDirectory = ref<string | null>(null);

  const currentEntries = computed<ServerFileListItem[]>(() => {
    const files = directoryEntries.value.map(
      (entry): ServerFileListItem => ({
        name: entry.name,
        type: entry.isDirectory ? 'directory' : 'file',
        size: entry.isDirectory ? t('common.na') : formatBytes(entry.size),
        modified: entry.modified,
        path: entry.path,
        mode: entry.mode,
      }),
    );

    return files.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
  });

  const entryMap = computed(() => {
    const map = new Map<string, ServerFileListItem>();
    currentEntries.value.forEach((entry) => {
      map.set(entry.path, entry);
    });
    return map;
  });

  const selectedItems = computed<ServerFileListItem[]>(() =>
    selectedPaths.value
      .map((path) => entryMap.value.get(path))
      .filter((entry): entry is ServerFileListItem => Boolean(entry)),
  );

  const selectedCount = computed(() => selectedItems.value.length);
  const hasSelection = computed(() => selectedCount.value > 0);
  const allSelected = computed(
    () =>
      hasSelection.value &&
      selectedCount.value === currentEntries.value.length &&
      currentEntries.value.length > 0,
  );
  const indeterminateSelection = computed(() => hasSelection.value && !allSelected.value);
  const selectionLabel = computed(
    () => `${selectedCount.value} item${selectedCount.value === 1 ? '' : 's'} selected`,
  );
  const selectionPreview = computed(() => selectedItems.value.slice(0, 8));
  const selectionOverflow = computed(() =>
    Math.max(selectedCount.value - selectionPreview.value.length, 0),
  );
  const hasSelectionOverflow = computed(() => selectionOverflow.value > 0);

  const canCopySelection = computed(() => hasSelection.value);
  const canMoveSelection = computed(() => hasSelection.value);
  const canDeleteSelection = computed(() => hasSelection.value);
  const canArchiveSelection = computed(() => hasSelection.value);
  const canUnarchiveSelection = computed(
    () =>
      hasSelection.value &&
      selectedItems.value.every((item) => item.type === 'file' && isArchiveName(item.name)),
  );

  const directoryDisabled = computed(() => directoryPending.value);
  const isAnyOperationActive = computed(
    () =>
      directoryPending.value ||
      uploadInProgress.value ||
      pullInProgress.value ||
      downloadStatus.active ||
      compressStatus.active ||
      decompressStatus.active ||
      copyStatus.active ||
      moveStatus.active ||
      deleteStatus.active,
  );

  function formatBytes(size: number) {
    if (!Number.isFinite(size) || size < 0) return t('common.na');
    if (size === 0) return `0 ${t('common.bytes')}`;

    const units = [
      t('common.bytes'),
      t('common.kb'),
      t('common.mb'),
      t('common.gb'),
      t('common.tb'),
    ];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    const value = size / 1024 ** exponent;
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
  }

  function normalizeDirectoryPath(input: string): string {
    if (!input) return '/';

    const trimmed = input.trim();
    if (!trimmed) return '/';

    let value = trimmed.replace(/\\/g, '/').replace(/\s+/g, '');
    if (!value.startsWith('/')) value = `/${value}`;
    value = value.replace(/\/{2,}/g, '/');
    if (value.length > 1) value = value.replace(/\/$/, '');
    return value.length === 0 ? '/' : value;
  }

  function joinDirectoryPath(base: string, name: string): string {
    const normalized = normalizeDirectoryPath(base);
    if (normalized === '/') return `/${name}`;
    return `${normalized}/${name}`;
  }

  function isArchiveName(name: string): boolean {
    const lower = name.toLowerCase();
    return archiveExtensions.some((ext) => lower.endsWith(ext));
  }

  function clearSelection() {
    selectedPaths.value = [];
  }

  function isEntrySelected(entry: ServerFileListItem) {
    return selectedPaths.value.includes(entry.path);
  }

  function toggleEntrySelection(entry: ServerFileListItem, value: boolean) {
    const next = new Set(selectedPaths.value);
    if (value) next.add(entry.path);
    else next.delete(entry.path);
    selectedPaths.value = Array.from(next);
  }

  function toggleSelectAllEntries(value: boolean) {
    if (value) selectedPaths.value = currentEntries.value.map((entry) => entry.path);
    else clearSelection();
  }

  watch(currentEntries, (entries) => {
    const available = new Set(entries.map((entry) => entry.path));
    selectedPaths.value = selectedPaths.value.filter((path) => available.has(path));
  });

  watch(currentDirectory, () => {
    clearSelection();
    if (
      directoryEntries.value.length === 0 ||
      lastRequestedDirectory.value !== currentDirectory.value
    )
      void fetchDirectory(currentDirectory.value);
  });

  watch(hasSelection, (value) => {
    if (!value) {
      if (bulkMoveModal.open) closeBulkMoveModal();
      if (bulkDeleteModal.open) closeBulkDeleteModal();
    }
  });

  function openNewFileModal() {
    newFileModal.name = '';
    newFileModal.open = true;
  }

  function closeNewFileModal() {
    newFileModal.open = false;
    newFileModal.name = '';
    newFileModal.loading = false;
  }

  async function submitNewFile() {
    const name = newFileModal.name.trim();
    if (!name) {
      toast.add({
        color: 'error',
        title: t('validation.required'),
        description: t('validation.required'),
      });
      return;
    }

    const normalizedDir = normalizeDirectoryPath(currentDirectory.value);
    const targetPath = normalizedDir === '/' ? `/${name}` : `${normalizedDir}/${name}`;

    try {
      newFileModal.loading = true;
      await requestFetch(`${clientApiBase.value}/files/write`, {
        method: 'POST',
        body: {
          file: targetPath,
          content: '',
        },
      });
      await fetchDirectory(currentDirectory.value, { force: true });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      closeNewFileModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      newFileModal.loading = false;
    }
  }

  function openNewFolderModal() {
    newFolderModal.name = '';
    newFolderModal.open = true;
  }

  function closeNewFolderModal() {
    newFolderModal.open = false;
    newFolderModal.name = '';
    newFolderModal.loading = false;
  }

  async function submitNewFolder() {
    const name = newFolderModal.name.trim();
    if (!name) {
      toast.add({
        color: 'error',
        title: t('validation.required'),
        description: t('validation.required'),
      });
      return;
    }

    try {
      newFolderModal.loading = true;
      await requestFetch(`${clientApiBase.value}/files/create-folder`, {
        method: 'POST',
        body: {
          root: currentDirectory.value,
          name,
        },
      });
      await fetchDirectory(currentDirectory.value, { force: true });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      closeNewFolderModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      newFolderModal.loading = false;
    }
  }

  function openRenameModal(file: ServerFileListItem) {
    renameModal.file = file;
    renameModal.value = file.name;
    renameModal.open = true;
  }

  function closeRenameModal() {
    renameModal.open = false;
    renameModal.file = null;
    renameModal.value = '';
    renameModal.loading = false;
  }

  async function submitRename() {
    if (!renameModal.file) return;

    const newName = renameModal.value.trim();
    if (!newName || newName === renameModal.file.name) {
      closeRenameModal();
      return;
    }

    const destination = `${currentDirectory.value.replace(/\/$/, '')}/${newName}`;

    try {
      renameModal.loading = true;
      await requestFetch(`${clientApiBase.value}/files/rename`, {
        method: 'POST',
        body: {
          root: currentDirectory.value,
          files: [{ from: renameModal.file.path, to: destination }],
        },
      });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      if (selectedFile.value?.path === renameModal.file.path) selectedFile.value = null;
      await fetchDirectory(currentDirectory.value, { force: true });
      closeRenameModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      renameModal.loading = false;
    }
  }

  function openDeleteModal(file: ServerFileListItem) {
    deleteModal.file = file;
    deleteModal.open = true;
  }

  function closeDeleteModal() {
    deleteModal.open = false;
    deleteModal.file = null;
    deleteModal.loading = false;
  }

  async function submitDelete() {
    if (!deleteModal.file) return;

    try {
      deleteModal.loading = true;
      await requestFetch(`${clientApiBase.value}/files/delete`, {
        method: 'POST',
        body: {
          root: currentDirectory.value,
          files: [deleteModal.file.path],
        },
      });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      if (selectedFile.value?.path === deleteModal.file.path) selectedFile.value = null;
      await fetchDirectory(currentDirectory.value, { force: true });
      closeDeleteModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      deleteModal.loading = false;
    }
  }

  function openChmodModal(file: ServerFileListItem) {
    chmodModal.file = file;
    chmodModal.value = '755';
    chmodModal.open = true;
  }

  function closeChmodModal() {
    chmodModal.open = false;
    chmodModal.file = null;
    chmodModal.value = '755';
    chmodModal.loading = false;
  }

  async function submitChmod() {
    if (!chmodModal.file) return;

    const mode = chmodModal.value.trim();
    if (!mode) {
      toast.add({
        color: 'error',
        title: t('validation.required'),
        description: t('validation.required'),
      });
      return;
    }

    try {
      chmodModal.loading = true;
      await requestFetch(`${clientApiBase.value}/files/chmod`, {
        method: 'POST',
        body: {
          root: currentDirectory.value,
          files: [{ file: chmodModal.file.path, mode }],
        },
      });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      await fetchDirectory(currentDirectory.value, { force: true });
      closeChmodModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      chmodModal.loading = false;
    }
  }

  function openPullModal() {
    pullModal.url = '';
    pullModal.open = true;
  }

  function closePullModal() {
    pullModal.open = false;
    pullModal.url = '';
    pullModal.loading = false;
  }

  async function submitPull() {
    const url = pullModal.url.trim();
    if (!url) {
      toast.add({
        color: 'error',
        title: t('validation.required'),
        description: t('validation.required'),
      });
      return;
    }

    try {
      pullModal.loading = true;
      pullInProgress.value = true;
      await requestFetch(`${clientApiBase.value}/files/pull`, {
        method: 'POST',
        body: {
          url,
          directory: currentDirectory.value,
        },
      });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      await fetchDirectory();
      closePullModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      pullModal.loading = false;
      pullInProgress.value = false;
    }
  }

  async function handleBulkCopy() {
    const items = [...selectedItems.value];
    if (!items.length || copyStatus.active) return;

    copyStatus.active = true;
    copyStatus.summary = t('common.transferring');

    try {
      for (const item of items) {
        copyStatus.summary = t('server.files.transferring');
        await requestFetch(`${clientApiBase.value}/files/copy`, {
          method: 'POST',
          body: {
            location: item.path,
          },
        });
      }

      toast.add({ title: t('common.success'), description: t('server.files.title') });
      await fetchDirectory();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      copyStatus.active = false;
      copyStatus.summary = '';
      clearSelection();
    }
  }

  async function fetchDirectory(directory = currentDirectory.value, { force = false } = {}) {
    if (!force && lastRequestedDirectory.value === directory) return;

    lastRequestedDirectory.value = directory;
    directoryPending.value = true;
    directoryError.value = null;
    try {
      const response = await requestFetch<{ data: { entries: ServerFileEntry[] } }>(
        `${clientApiBase.value}/files/list`,
        {
          method: 'GET',
          query: { directory },
        },
      );
      directoryEntries.value = response.data.entries;
    } catch (error) {
      directoryError.value = toError(error);
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      directoryPending.value = false;
    }
  }

  async function submitBulkMove() {
    const items = [...selectedItems.value];
    if (!items.length) return;

    const destination = normalizeDirectoryPath(bulkMoveModal.destination);
    if (!destination) {
      toast.add({
        color: 'error',
        title: 'Invalid destination',
        description: 'Please provide a valid directory path.',
      });
      return;
    }

    moveStatus.active = true;
    moveStatus.summary = t('common.transferring');
    bulkMoveModal.loading = true;

    try {
      const files = items.map((item) => ({
        from: item.path,
        to: joinDirectoryPath(destination, item.name),
      }));
      await requestFetch(`${clientApiBase.value}/files/rename`, {
        method: 'POST',
        body: {
          root: '/',
          files,
        },
      });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      await fetchDirectory();
      clearSelection();
      closeBulkMoveModal();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      moveStatus.active = false;
      moveStatus.summary = '';
      bulkMoveModal.loading = false;
    }
  }

  async function submitBulkDelete() {
    const items = [...selectedItems.value];
    if (!items.length) return;

    deleteStatus.active = true;
    deleteStatus.summary = t('common.delete');
    bulkDeleteModal.loading = true;

    const pathsToRemove = new Set(items.map((item) => item.path));

    try {
      await requestFetch(`${clientApiBase.value}/files/delete`, {
        method: 'POST',
        body: {
          root: '/',
          files: Array.from(pathsToRemove),
        },
      });

      directoryEntries.value = directoryEntries.value.filter(
        (entry) => !pathsToRemove.has(entry.path),
      );
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      clearSelection();
      bulkDeleteModal.open = false;
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      deleteStatus.active = false;
      deleteStatus.summary = '';
      bulkDeleteModal.loading = false;
    }
  }

  async function handleBulkArchive() {
    const items = [...selectedItems.value];
    if (!items.length || compressStatus.active) return;

    compressStatus.active = true;
    const singleItemLabel = items[0]?.name ?? 'item';
    compressStatus.target = items.length === 1 ? singleItemLabel : `${items.length} items`;

    try {
      await requestFetch(`${clientApiBase.value}/files/compress`, {
        method: 'POST',
        body: {
          root: currentDirectory.value,
          files: items.map((item) => item.name),
        },
      });
      toast.add({ title: t('common.success'), description: t('server.files.archiveCreated') });
      await fetchDirectory();
      clearSelection();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      compressStatus.active = false;
      compressStatus.target = '';
    }
  }

  async function handleBulkUnarchive() {
    const archives = selectedItems.value.filter(
      (item) => item.type === 'file' && isArchiveName(item.name),
    );
    if (!archives.length || decompressStatus.active) return;

    decompressStatus.active = true;

    try {
      for (const archive of archives) {
        decompressStatus.target = archive.name;
        await requestFetch(`${clientApiBase.value}/files/decompress`, {
          method: 'POST',
          body: {
            root: currentDirectory.value,
            file: archive.name,
          },
        });
      }

      toast.add({ title: t('common.success'), description: t('server.files.title') });
      await fetchDirectory();
      clearSelection();
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      decompressStatus.active = false;
      decompressStatus.target = '';
    }
  }

  function openBulkMoveModalWithDefaults() {
    if (!hasSelection.value) return;

    bulkMoveModal.destination = currentDirectory.value;
    bulkMoveModal.open = true;
  }

  function closeBulkMoveModal() {
    bulkMoveModal.open = false;
    bulkMoveModal.loading = false;
  }

  function openBulkDeleteModal() {
    if (!hasSelection.value) return;
    bulkDeleteModal.open = true;
  }

  function closeBulkDeleteModal() {
    bulkDeleteModal.open = false;
    bulkDeleteModal.loading = false;
  }

  function triggerUploadDialog() {
    fileUploadInput.value?.click();
  }

  async function handleFileUpload(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const input = target;
    const files = input.files;

    if (!input || !files || files.length === 0) return;

    const formData = new FormData();
    formData.set('directory', currentDirectory.value);

    Array.from(files).forEach((file) => {
      formData.append('files', file, file.name);
    });

    try {
      uploadInProgress.value = true;
      await requestFetch(`${clientApiBase.value}/files/upload`, {
        method: 'POST',
        body: formData,
      });
      toast.add({ title: t('common.success'), description: t('server.files.title') });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await fetchDirectory(currentDirectory.value, { force: true });
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      input.value = '';
      uploadInProgress.value = false;
    }
  }

  async function handleDownload(file: ServerFileListItem) {
    try {
      downloadStatus.active = true;
      downloadStatus.name = file.name;
      const { data } = await requestFetch<{ success: true; data: { url: string } }>(
        `${clientApiBase.value}/files/download`,
        {
          query: { file: file.path },
        },
      );

      if (data?.url) {
        window.open(data.url, '_blank');
        toast.add({ title: t('server.files.download'), description: t('server.files.title') });
      }
    } catch (error) {
      toast.add({
        color: 'error',
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
      });
    } finally {
      downloadStatus.active = false;
      downloadStatus.name = '';
    }
  }

  void fetchDirectory(currentDirectory.value, { force: true });

  return {
    rootDirectory,
    currentDirectory,
    directoryPending,
    directoryError,
    directoryEntries,
    currentEntries,
    selectedPaths,
    selectedItems,
    selectedCount,
    hasSelection,
    allSelected,
    indeterminateSelection,
    selectionLabel,
    selectionPreview,
    selectionOverflow,
    hasSelectionOverflow,
    canCopySelection,
    canMoveSelection,
    canDeleteSelection,
    canArchiveSelection,
    canUnarchiveSelection,
    directoryDisabled,
    isAnyOperationActive,
    downloadStatus,
    compressStatus,
    decompressStatus,
    copyStatus,
    moveStatus,
    deleteStatus,
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
    closePullModal,
    submitPull,
    handleBulkCopy,
    fetchDirectory,
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
  };
}
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
