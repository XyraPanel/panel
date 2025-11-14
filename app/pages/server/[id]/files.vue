<script setup lang="ts">
import type { ServerFileEntry, ServerFileListItem } from '#shared/types/server-pages'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const toast = useToast()
const serverId = computed(() => route.params.id as string)

const rootDirectory = '/'
const currentDirectory = ref(rootDirectory)
const directoryPending = ref(false)
const directoryError = ref<Error | null>(null)
const directoryEntries = ref<ServerFileEntry[]>([])

const selectedFile = ref<ServerFileListItem | null>(null)
const editorValue = ref('')
const filePending = ref(false)
const fileError = ref<Error | null>(null)
const dirtyFiles = reactive(new Set<string>())
const fileSaving = ref(false)
const fileUploadInput = ref<HTMLInputElement | null>(null)
const uploadInProgress = ref(false)
const pullInProgress = ref(false)

const newFileModal = reactive({
  open: false,
  name: '',
  loading: false,
})

const newFolderModal = reactive({
  open: false,
  name: '',
  loading: false,
})

const renameModal = reactive({
  open: false,
  file: null as ServerFileListItem | null,
  value: '',
  loading: false,
})

const chmodModal = reactive({
  open: false,
  file: null as ServerFileListItem | null,
  value: '755',
  loading: false,
})

const pullModal = reactive({
  open: false,
  url: '',
  loading: false,
})

const deleteModal = reactive({
  open: false,
  file: null as ServerFileListItem | null,
  loading: false,
})

const downloadStatus = reactive({
  active: false,
  name: '',
})

const compressStatus = reactive({
  active: false,
  target: '',
})

const decompressStatus = reactive({
  active: false,
  target: '',
})

const visibleEntries = computed<ServerFileListItem[]>(() => {
  const entries = directoryEntries.value.map((entry): ServerFileListItem => ({
    name: entry.name,
    type: entry.isDirectory ? 'directory' : 'file',
    size: entry.isDirectory ? '—' : formatBytes(entry.size),
    modified: formatDate(entry.modified),
    path: entry.path,
  }))

  return entries.sort((a, b) => {
    if (a.type === b.type)
      return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })
})

const selectedPaths = ref<string[]>([])

const copyStatus = reactive({
  active: false,
  summary: '',
})

const moveStatus = reactive({
  active: false,
  summary: '',
})

const deleteStatus = reactive({
  active: false,
  summary: '',
})

const bulkMoveModal = reactive({
  open: false,
  destination: '/',
  loading: false,
})

const bulkDeleteModal = reactive({
  open: false,
  loading: false,
})

const archiveExtensions = ['.zip', '.tar', '.tar.gz', '.tgz', '.gz']

function normalizeDirectoryPath(input: string): string {
  if (!input)
    return '/'

  const trimmed = input.trim()
  if (!trimmed)
    return '/'

  let value = trimmed.replace(/\\/g, '/').replace(/\s+/g, '')
  if (!value.startsWith('/'))
    value = `/${value}`
  value = value.replace(/\/{2,}/g, '/')
  if (value.length > 1)
    value = value.replace(/\/$/, '')
  return value.length === 0 ? '/' : value
}

function joinDirectoryPath(base: string, name: string): string {
  const normalized = normalizeDirectoryPath(base)
  if (normalized === '/')
    return `/${name}`
  return `${normalized}/${name}`
}

function isArchiveName(name: string): boolean {
  const lower = name.toLowerCase()
  return archiveExtensions.some(ext => lower.endsWith(ext))
}

const entryMap = computed(() => {
  const map = new Map<string, ServerFileListItem>()
  visibleEntries.value.forEach((entry) => {
    map.set(entry.path, entry)
  })
  return map
})

const selectedItems = computed<ServerFileListItem[]>(() =>
  selectedPaths.value
    .map((path) => entryMap.value.get(path))
    .filter((entry): entry is ServerFileListItem => Boolean(entry)),
)

const selectedCount = computed(() => selectedItems.value.length)
const hasSelection = computed(() => selectedCount.value > 0)
const allSelected = computed(() => hasSelection.value && selectedCount.value === visibleEntries.value.length && visibleEntries.value.length > 0)
const indeterminateSelection = computed(() => hasSelection.value && !allSelected.value)
const selectionLabel = computed(() => `${selectedCount.value} item${selectedCount.value === 1 ? '' : 's'} selected`)

const selectionPreview = computed(() => selectedItems.value.slice(0, 8))
const selectionOverflow = computed(() => Math.max(selectedCount.value - selectionPreview.value.length, 0))
const hasSelectionOverflow = computed(() => selectionOverflow.value > 0)

const canCopySelection = computed(() => hasSelection.value)
const canMoveSelection = computed(() => hasSelection.value)
const canDeleteSelection = computed(() => hasSelection.value)
const canArchiveSelection = computed(() => hasSelection.value)
const canUnarchiveSelection = computed(() => hasSelection.value && selectedItems.value.every(item => item.type === 'file' && isArchiveName(item.name)))

const isAnyOperationActive = computed(() =>
  directoryPending.value ||
  uploadInProgress.value ||
  pullInProgress.value ||
  downloadStatus.active ||
  compressStatus.active ||
  decompressStatus.active ||
  copyStatus.active ||
  moveStatus.active ||
  deleteStatus.active,
)

function clearSelection() {
  selectedPaths.value = []
}

function isEntrySelected(entry: ServerFileListItem): boolean {
  return selectedPaths.value.includes(entry.path)
}

function toggleEntrySelection(entry: ServerFileListItem, value: boolean) {
  const next = new Set(selectedPaths.value)
  if (value)
    next.add(entry.path)
  else
    next.delete(entry.path)

  selectedPaths.value = Array.from(next)
}

function toggleSelectAllEntries(value: boolean) {
  if (value)
    selectedPaths.value = visibleEntries.value.map(entry => entry.path)
  else
    clearSelection()
}

watch(visibleEntries, (entries) => {
  const available = new Set(entries.map(entry => entry.path))
  selectedPaths.value = selectedPaths.value.filter(path => available.has(path))
})

watch(currentDirectory, () => {
  clearSelection()
})

watch(hasSelection, (value) => {
  if (!value) {
    if (bulkMoveModal.open)
      closeBulkMoveModal()
    if (bulkDeleteModal.open)
      closeBulkDeleteModal()
  }
})

function openBulkMoveModalWithDefaults() {
  if (!hasSelection.value)
    return

  bulkMoveModal.destination = currentDirectory.value
  bulkMoveModal.open = true
}

function closeBulkMoveModal() {
  bulkMoveModal.open = false
  bulkMoveModal.loading = false
}

function openBulkDeleteModal() {
  if (!hasSelection.value)
    return
  bulkDeleteModal.open = true
}

function closeBulkDeleteModal() {
  bulkDeleteModal.open = false
  bulkDeleteModal.loading = false
}

async function handleBulkCopy() {
  const items = [...selectedItems.value]
  if (!items.length || copyStatus.active)
    return

  copyStatus.active = true
  copyStatus.summary = `Copying ${items.length} item${items.length === 1 ? '' : 's'}…`

  try {
    for (const item of items) {
      copyStatus.summary = `Copying ${item.name}…`
      await $fetch(`/api/servers/${serverId.value}/files/copy`, {
        method: 'POST',
        body: {
          location: item.path,
        },
      })
    }

    toast.add({
      title: 'Files copied',
      description: `${items.length} item${items.length === 1 ? '' : 's'} duplicated successfully.`,
    })

    await fetchDirectory()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Copy failed',
      description: error instanceof Error ? error.message : 'Unable to copy selected files.',
    })
  }
  finally {
    copyStatus.active = false
    copyStatus.summary = ''
    clearSelection()
  }
}

async function submitBulkMove() {
  const items = [...selectedItems.value]
  if (!items.length)
    return

  const destination = normalizeDirectoryPath(bulkMoveModal.destination)
  if (!destination) {
    toast.add({ color: 'error', title: 'Invalid destination', description: 'Please provide a valid directory path.' })
    return
  }

  moveStatus.active = true
  moveStatus.summary = `Moving ${items.length} item${items.length === 1 ? '' : 's'}…`
  bulkMoveModal.loading = true

  try {
    const files = items.map(item => ({
      from: item.path,
      to: joinDirectoryPath(destination, item.name),
    }))

    await $fetch(`/api/servers/${serverId.value}/files/rename`, {
      method: 'POST',
      body: {
        root: '/',
        files,
      },
    })

    toast.add({
      title: 'Files moved',
      description: `${items.length} item${items.length === 1 ? '' : 's'} moved to ${destination}.`,
    })

    await fetchDirectory()
    clearSelection()
    closeBulkMoveModal()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Move failed',
      description: error instanceof Error ? error.message : 'Unable to move selected files.',
    })
  }
  finally {
    moveStatus.active = false
    moveStatus.summary = ''
    bulkMoveModal.loading = false
  }
}

async function submitBulkDelete() {
  const items = [...selectedItems.value]
  if (!items.length)
    return

  deleteStatus.active = true
  deleteStatus.summary = `Deleting ${items.length} item${items.length === 1 ? '' : 's'}…`
  bulkDeleteModal.loading = true

  const pathsToRemove = new Set(items.map(item => item.path))

  try {
    await $fetch(`/api/servers/${serverId.value}/files/delete`, {
      method: 'POST',
      body: {
        root: '/',
        files: Array.from(pathsToRemove),
      },
    })

    directoryEntries.value = directoryEntries.value.filter(entry => !pathsToRemove.has(entry.path))

    toast.add({
      title: 'Files deleted',
      description: `${items.length} item${items.length === 1 ? '' : 's'} removed successfully.`,
    })

    clearSelection()
    bulkDeleteModal.open = false
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Delete failed',
      description: error instanceof Error ? error.message : 'Unable to delete selected files.',
    })
  }
  finally {
    deleteStatus.active = false
    deleteStatus.summary = ''
    bulkDeleteModal.loading = false
  }
}

async function handleBulkArchive() {
  const items = [...selectedItems.value]
  if (!items.length || compressStatus.active)
    return

  compressStatus.active = true
  const singleItemLabel = items[0]?.name ?? 'item'
  compressStatus.target = items.length === 1 ? singleItemLabel : `${items.length} items`

  try {
    const response = await $fetch<{ success: boolean; data: { file: string } }>(`/api/servers/${serverId.value}/files/compress`, {
      method: 'POST',
      body: {
        root: currentDirectory.value,
        files: items.map(item => item.name),
      },
    })

    const archiveName = response?.data?.file ?? 'archive.tar'
    toast.add({
      title: 'Archive created',
      description: `${archiveName} has been created in the current directory.`,
    })

    await fetchDirectory()
    clearSelection()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Archive failed',
      description: error instanceof Error ? error.message : 'Unable to archive selected items.',
    })
  }
  finally {
    compressStatus.active = false
    compressStatus.target = ''
  }
}

async function handleBulkUnarchive() {
  const archives = selectedItems.value.filter(item => item.type === 'file' && isArchiveName(item.name))
  if (!archives.length || decompressStatus.active)
    return

  decompressStatus.active = true

  try {
    for (const archive of archives) {
      decompressStatus.target = archive.name
      await $fetch(`/api/servers/${serverId.value}/files/decompress`, {
        method: 'POST',
        body: {
          root: currentDirectory.value,
          file: archive.name,
        },
      })
    }

    toast.add({
      title: 'Archive extracted',
      description: `${archives.length} archive${archives.length === 1 ? '' : 's'} extracted successfully.`,
    })

    await fetchDirectory()
    clearSelection()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Extraction failed',
      description: error instanceof Error ? error.message : 'Unable to extract selected archives.',
    })
  }
  finally {
    decompressStatus.active = false
    decompressStatus.target = ''
  }
}
const queryKey = computed(() => ({
  id: serverId.value,
  directory: currentDirectory.value,
}))

function openNewFileModal() {
  newFileModal.name = ''
  newFileModal.open = true
}

function closeNewFileModal() {
  newFileModal.open = false
  newFileModal.name = ''
  newFileModal.loading = false
}

async function _submitNewFile() {
  const name = newFileModal.name.trim()
  if (!name) {
    toast.add({ color: 'error', title: 'Invalid name', description: 'Please provide a new file name.' })
    return
  }

  const targetPath = currentDirectory.value.endsWith('/')
    ? `${currentDirectory.value}${name}`
    : `${currentDirectory.value}/${name}`

  try {
    newFileModal.loading = true
    await $fetch(`/api/servers/${serverId.value}/files/write`, {
      method: 'POST',
      body: {
        file: targetPath,
        content: '',
      },
    })
    await fetchDirectory()
    toast.add({
      title: 'File created',
      description: `${name} created successfully.`,
    })
    closeNewFileModal()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Failed to create file',
      description: error instanceof Error ? error.message : 'Unable to create file.',
    })
  }
  finally {
    newFileModal.loading = false
  }
}

function openNewFolderModal() {
  newFolderModal.name = ''
  newFolderModal.open = true
}

function closeNewFolderModal() {
  newFolderModal.open = false
  newFolderModal.name = ''
  newFolderModal.loading = false
}

async function _submitNewFolder() {
  const name = newFolderModal.name.trim()
  if (!name) {
    toast.add({ color: 'error', title: 'Invalid name', description: 'Please provide a folder name.' })
    return
  }

  try {
    newFolderModal.loading = true
    await $fetch(`/api/servers/${serverId.value}/files/create-directory`, {
      method: 'POST',
      body: {
        root: currentDirectory.value,
        name,
      },
    })
    await fetchDirectory()
    toast.add({
      title: 'Folder created',
      description: `${name} created successfully.`,
    })
    closeNewFolderModal()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Failed to create folder',
      description: error instanceof Error ? error.message : 'Unable to create folder.',
    })
  }
  finally {
    newFolderModal.loading = false
  }
}

function triggerUploadDialog() {
  fileUploadInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement | null
  const files = input?.files

  if (!input || !files || files.length === 0)
    return

  const formData = new FormData()
  formData.set('directory', currentDirectory.value)

  Array.from(files).forEach((file) => {
    formData.append('files', file, file.name)
  })

  try {
    uploadInProgress.value = true
    await $fetch(`/api/servers/${serverId.value}/files/upload`, {
      method: 'POST',
      body: formData,
    })

    toast.add({
      title: 'Upload complete',
      description: `${files.length} file${files.length > 1 ? 's' : ''} uploaded successfully.`,
    })

    await fetchDirectory()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Upload failed',
      description: error instanceof Error ? error.message : 'Unable to upload files.',
    })
  }
  finally {
    input.value = ''
    uploadInProgress.value = false
  }
}

async function handleDownload(file: ServerFileListItem) {
  try {
    downloadStatus.active = true
    downloadStatus.name = file.name
    const { data } = await $fetch<{ success: true; data: { url: string } }>(`/api/servers/${serverId.value}/files/download`, {
      query: { file: file.path },
    })

    if (data?.url) {
      window.open(data.url, '_blank')
      toast.add({ title: 'Download', description: `Opened download for ${file.name}.` })
    }
  }
  catch (error) {
    toast.add({ color: 'error', title: 'Download failed', description: error instanceof Error ? error.message : 'Unable to download file.' })
  }
  finally {
    downloadStatus.active = false
    downloadStatus.name = ''
  }
}

function openRenameModal(file: ServerFileListItem) {
  renameModal.file = file
  renameModal.value = file.name
  renameModal.open = true
}

function closeRenameModal() {
  renameModal.open = false
  renameModal.file = null
  renameModal.value = ''
  renameModal.loading = false
}

async function submitRename() {
  if (!renameModal.file)
    return

  const newName = renameModal.value.trim()
  if (!newName || newName === renameModal.file.name) {
    closeRenameModal()
    return
  }

  const destination = `${currentDirectory.value.replace(/\/$/, '')}/${newName}`

  try {
    renameModal.loading = true
    await $fetch(`/api/servers/${serverId.value}/files/rename`, {
      method: 'POST',
      body: {
        root: currentDirectory.value,
        files: [{ from: renameModal.file.path, to: destination }],
      },
    })
    toast.add({ title: 'Renamed', description: `${renameModal.file.name} renamed to ${newName}.` })
    if (selectedFile.value?.path === renameModal.file.path)
      selectedFile.value = null
    await fetchDirectory()
    closeRenameModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: 'Rename failed', description: error instanceof Error ? error.message : 'Unable to rename file.' })
  }
  finally {
    renameModal.loading = false
  }
}

function openDeleteModal(file: ServerFileListItem) {
  deleteModal.file = file
  deleteModal.open = true
}

function closeDeleteModal() {
  deleteModal.open = false
  deleteModal.file = null
  deleteModal.loading = false
}

async function submitDelete() {
  if (!deleteModal.file)
    return

  try {
    deleteModal.loading = true
    await $fetch(`/api/servers/${serverId.value}/files/delete`, {
      method: 'POST',
      body: {
        root: currentDirectory.value,
        files: [deleteModal.file.path],
      },
    })
    toast.add({ title: 'Deleted', description: `${deleteModal.file.name} deleted.` })
    if (selectedFile.value?.path === deleteModal.file.path)
      selectedFile.value = null
    await fetchDirectory()
    closeDeleteModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: 'Delete failed', description: error instanceof Error ? error.message : 'Unable to delete file.' })
  }
  finally {
    deleteModal.loading = false
  }
}

function openChmodModal(file: ServerFileListItem) {
  chmodModal.file = file
  chmodModal.value = '755'
  chmodModal.open = true
}

function closeChmodModal() {
  chmodModal.open = false
  chmodModal.file = null
  chmodModal.value = '755'
  chmodModal.loading = false
}

async function submitChmod() {
  if (!chmodModal.file)
    return

  const mode = chmodModal.value.trim()
  if (!mode) {
    toast.add({ color: 'error', title: 'Invalid mode', description: 'Please provide a file mode such as 644 or 755.' })
    return
  }

  try {
    chmodModal.loading = true
    await $fetch(`/api/servers/${serverId.value}/files/chmod`, {
      method: 'POST',
      body: {
        root: currentDirectory.value,
        files: [{ file: chmodModal.file.path, mode }],
      },
    })
    toast.add({ title: 'Permissions updated', description: `${chmodModal.file.name} set to ${mode}.` })
    await fetchDirectory()
    closeChmodModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: 'Chmod failed', description: error instanceof Error ? error.message : 'Unable to change permissions.' })
  }
  finally {
    chmodModal.loading = false
  }
}

function openPullModal() {
  pullModal.url = ''
  pullModal.open = true
}

function closePullModal() {
  pullModal.open = false
  pullModal.url = ''
  pullModal.loading = false
}

async function submitPull() {
  const url = pullModal.url.trim()
  if (!url) {
    toast.add({ color: 'error', title: 'Invalid URL', description: 'Please provide a valid URL to download.' })
    return
  }

  try {
    pullModal.loading = true
    pullInProgress.value = true
    await $fetch(`/api/servers/${serverId.value}/files/pull`, {
      method: 'POST',
      body: {
        url,
        directory: currentDirectory.value,
      },
    })
    toast.add({ title: 'Pull started', description: `Downloading ${url}` })
    await fetchDirectory()
    closePullModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: 'Pull failed', description: error instanceof Error ? error.message : 'Unable to pull remote file.' })
  }
  finally {
    pullModal.loading = false
    pullInProgress.value = false
  }
}

const fileActions = computed(() => [
  {
    label: 'New File',
    icon: 'i-lucide-file-plus',
    handler: openNewFileModal,
    disabled: directoryPending.value,
  },
  {
    label: 'New Folder',
    icon: 'i-lucide-folder-plus',
    handler: openNewFolderModal,
    disabled: directoryPending.value,
  },
  {
    label: 'Upload',
    icon: 'i-lucide-upload',
    handler: triggerUploadDialog,
    disabled: directoryPending.value,
  },
  {
    label: 'Pull from URL',
    icon: 'i-lucide-link',
    handler: openPullModal,
    disabled: directoryPending.value,
  },
])

function availableFileActions(file: ServerFileListItem | null) {
  if (!file)
    return []

  const actions = [] as Array<{ label: string; icon: string; onClick: () => void }>

  if (file.type === 'file') {
    actions.push({ label: 'Rename', icon: 'i-lucide-pencil', onClick: () => openRenameModal(file) })
    actions.push({ label: 'Download', icon: 'i-lucide-download', onClick: () => handleDownload(file) })
    actions.push({ label: 'Change permissions', icon: 'i-lucide-shield', onClick: () => openChmodModal(file) })
  }

  actions.push({ label: 'Delete', icon: 'i-lucide-trash', onClick: () => openDeleteModal(file) })

  return actions
}

const fetchDirectory = async () => {
  directoryPending.value = true
  directoryError.value = null

  try {
    const { data } = await $fetch<{ data: { directory: string; entries: ServerFileEntry[] } }>(`/api/servers/${serverId.value}/files`, {
      query: { directory: currentDirectory.value },
    })

    currentDirectory.value = data.directory || '/'
    directoryEntries.value = data.entries
  }
  catch (error) {
    directoryError.value = error instanceof Error ? error : new Error('Failed to load directory listing.')
  }
  finally {
    directoryPending.value = false
  }
}

watch(queryKey, () => {
  fetchDirectory()
}, { immediate: true })

const currentEntries = computed<ServerFileListItem[]>(() => directoryEntries.value
  .map((entry): ServerFileListItem => ({
    name: entry.name,
    type: entry.isDirectory ? 'directory' : 'file',
    size: entry.isDirectory ? '—' : formatBytes(entry.size),
    modified: formatDate(entry.modified),
    path: entry.path,
  }))
  .sort((a, b) => {
    if (a.type === b.type)
      return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  }))

const breadcrumbs = computed(() => {
  const parts = currentDirectory.value.split('/').filter(Boolean)
  let acc = ''

  return parts.map((part) => {
    acc += `/${part}`
    return { label: part, path: acc }
  })
})

const currentDirectoryLabel = computed(() => currentDirectory.value === '/' ? '/' : currentDirectory.value)

const canNavigateUp = computed(() => currentDirectory.value !== '/')

const parentDirectory = computed(() => {
  if (!canNavigateUp.value)
    return '/'

  const segments = currentDirectory.value.split('/').filter(Boolean)
  segments.pop()
  return segments.length ? `/${segments.join('/')}` : '/'
})

const parentDirectoryLabel = computed(() => parentDirectory.value === '/' ? '/' : parentDirectory.value)

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size < 0)
    return '—'
  if (size === 0)
    return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  const value = size / (1024 ** exponent)
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`
}

function formatDate(value: string) {
  if (!value)
    return 'Unknown'

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

const languageInfo = computed(() => {
  const file = selectedFile.value
  if (!file || file.type !== 'file')
    return { lang: 'plaintext', label: 'Plain text' }

  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined
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
  }

  if (extension && map[extension])
    return map[extension]

  return { lang: 'plaintext', label: 'Plain text' }
})

const editorLanguage = computed(() => languageInfo.value.lang)
const editorLanguageLabel = computed(() => languageInfo.value.label)

watch(selectedFile, async (file, previous) => {
  if (previous?.path)
    dirtyFiles.delete(previous.path)

  if (!file || file.type !== 'file') {
    editorValue.value = ''
    fileError.value = null
    return
  }

  filePending.value = true
  fileError.value = null

  try {
    const { data } = await $fetch<{ data: { path: string; content: string } }>(`/api/servers/${serverId.value}/files/content`, {
      query: { file: file.path },
    })

    editorValue.value = data.content
  }
  catch (error) {
    fileError.value = error instanceof Error ? error : new Error('Unable to load file contents.')
    editorValue.value = ''
  }
  finally {
    filePending.value = false
  }
})

watch(editorValue, (value) => {
  const file = selectedFile.value
  if (file?.type === 'file') {
    if (value !== undefined)
      dirtyFiles.add(file.path)
  }
})

function navigateUp() {
  if (canNavigateUp.value) {
    currentDirectory.value = parentDirectory.value
  }
}

function handleEntryClick(entry: ServerFileListItem) {
  if (entry.type === 'directory') {
    currentDirectory.value = entry.path
    return
  }

  selectedFile.value = entry
}

function resetEditor() {
  const file = selectedFile.value
  if (!file || file.type !== 'file')
    return

  selectedFile.value = { ...file }
}

async function saveEditor() {
  const file = selectedFile.value
  if (!file || file.type !== 'file')
    return

  try {
    fileSaving.value = true
    await $fetch(`/api/servers/${serverId.value}/files/write`, {
      method: 'POST',
      body: {
        file: file.path,
        content: editorValue.value,
      },
    })

    dirtyFiles.delete(file.path)
    toast.add({
      title: 'Saved',
      description: `${file.name} saved successfully.`,
    })
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: 'Failed to save file',
      description: error instanceof Error ? error.message : 'Unable to save file contents.',
    })
  }
  finally {
    fileSaving.value = false
  }
}

const isEditorDirty = computed(() => {
  const file = selectedFile.value
  if (!file || file.type !== 'file')
    return false

  return dirtyFiles.has(file.path)
})
</script>

<template>
  <div>
  <UPage>
    <UPageBody>
      <section class="space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">Server {{ serverId }} · Directory</p>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
              <span class="rounded-md border border-default px-2 py-1">/</span>
              <span
                v-for="crumb in breadcrumbs"
                :key="crumb.path"
                class="rounded-md border border-default px-2 py-1 text-xs"
              >
                {{ crumb.label }}
              </span>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="action in fileActions"
              :key="action.label"
              :icon="action.icon"
              color="neutral"
              variant="soft"
              :disabled="action.disabled"
              @click="action.handler()"
            >
              {{ action.label }}
            </UButton>
            <input
              ref="fileUploadInput"
              type="file"
              class="hidden"
              @change="handleFileUpload"
            >
          </div>
        </div>

        <div v-if="isAnyOperationActive" class="space-y-2">
          <UAlert v-if="uploadInProgress" color="info" icon="i-lucide-upload">
            Upload in progress… Keep this tab open until files finish uploading.
          </UAlert>
          <UAlert v-if="pullInProgress" color="info" icon="i-lucide-link">
            Pulling remote file… This may take a moment depending on file size.
          </UAlert>
          <UAlert v-if="downloadStatus.active" color="info" icon="i-lucide-download">
            Preparing download for <strong>{{ downloadStatus.name }}</strong>…
          </UAlert>
          <UAlert v-if="copyStatus.active" color="info" icon="i-lucide-copy">
            {{ copyStatus.summary || 'Copying selected files…' }}
          </UAlert>
          <UAlert v-if="moveStatus.active" color="info" icon="i-lucide-move">
            {{ moveStatus.summary || 'Moving selected files…' }}
          </UAlert>
          <UAlert v-if="deleteStatus.active" color="warning" icon="i-lucide-trash">
            {{ deleteStatus.summary || 'Deleting selected files…' }}
          </UAlert>
          <UAlert v-if="compressStatus.active" color="info" icon="i-lucide-file-archive">
            Compressing <strong>{{ compressStatus.target }}</strong>…
          </UAlert>
          <UAlert v-if="decompressStatus.active" color="info" icon="i-lucide-box">
            Extracting <strong>{{ decompressStatus.target }}</strong>…
          </UAlert>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold">File manager</h2>
                <p class="text-xs text-muted-foreground">Browse and edit your server files in real time.</p>
              </div>
              <UBadge v-if="directoryPending" color="neutral" variant="soft">Loading…</UBadge>
            </div>
          </template>

          <div class="flex flex-col gap-6 lg:flex-row">
            <div class="flex w-full flex-col gap-3 lg:w-72">
              <header class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-xs uppercase text-muted-foreground">Directory</p>
                  <h3 class="text-sm font-medium">{{ currentDirectoryLabel }}</h3>
                </div>
                <UButton
                  v-if="canNavigateUp"
                  icon="i-lucide-corner-up-left"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="navigateUp"
                >
                  Up to {{ parentDirectoryLabel }}
                </UButton>
              </header>

              <UAlert
                v-if="directoryError"
                color="error"
                icon="i-lucide-alert-circle"
              >
                {{ directoryError.message }}
              </UAlert>

              <div class="rounded-md border border-default">
                <div class="flex items-center gap-3 border-b border-default bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <UCheckbox
                    :model-value="allSelected"
                    :indeterminate="indeterminateSelection"
                    :disabled="currentEntries.length === 0"
                    aria-label="Select all entries"
                    @update:model-value="toggleSelectAllEntries($event as boolean)"
                  />
                  <span class="flex-1">Name</span>
                  <span class="w-24">Type</span>
                  <span class="w-32 text-right">Last modified</span>
                  <span class="w-8 text-right">Actions</span>
                </div>
                <div class="max-h-[28rem] overflow-y-auto">
                  <div v-if="directoryPending" class="space-y-2 p-3 text-xs text-muted-foreground">
                    <div v-for="index in 5" :key="index" class="h-5 animate-pulse rounded bg-muted/60"/>
                  </div>
                  <div v-else-if="currentEntries.length === 0" class="px-3 py-4 text-xs text-muted-foreground">
                    This directory is empty.
                  </div>
                  <div
                    v-for="entry in currentEntries"
                    v-else
                    :key="entry.path"
                    class="flex w-full items-center gap-3 px-3 py-2 text-sm transition hover:bg-muted"
                    :class="{
                      'border-l-2 border-primary bg-primary/10 text-foreground': isEntrySelected(entry) || selectedFile?.path === entry.path,
                      'text-muted-foreground': !isEntrySelected(entry) && selectedFile?.path !== entry.path,
                    }"
                  >
                    <UCheckbox
                      :model-value="isEntrySelected(entry)"
                      aria-label="Select entry"
                      @update:model-value="toggleEntrySelection(entry, $event as boolean)"
                    />
                    <button
                      class="flex flex-1 items-center gap-2 text-left"
                      type="button"
                      @click="handleEntryClick(entry)"
                    >
                      <UIcon :name="entry.type === 'directory' ? 'i-lucide-folder' : 'i-lucide-file-text'" class="size-4 text-primary" />
                      <span class="truncate">{{ entry.name }}</span>
                    </button>
                    <span class="w-24 text-xs uppercase" :class="entry.type === 'directory' ? 'text-primary' : 'text-muted-foreground'">
                      {{ entry.type }}
                    </span>
                    <span class="w-32 text-right text-xs text-muted-foreground">{{ entry.modified }}</span>
                    <UDropdown
                      v-if="entry.type === 'file'"
                      class="flex w-8 justify-end"
                      :items="availableFileActions(entry).map(action => ({ label: action.label, icon: action.icon, click: action.onClick }))"
                    >
                      <UButton icon="i-lucide-ellipsis-vertical" variant="ghost" size="xs" color="neutral" />
                    </UDropdown>
                  </div>
                </div>
              </div>

              <Transition name="fade">
                <div
                  v-if="hasSelection"
                  class="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-background/95 px-4 py-3 text-sm shadow-lg shadow-primary/10 backdrop-blur"
                >
                  <div class="flex items-center gap-3 text-sm font-medium">
                    <UIcon name="i-lucide-check-square" class="size-4 text-primary" />
                    <span>{{ selectionLabel }}</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      icon="i-lucide-copy"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      :disabled="!canCopySelection || copyStatus.active || directoryPending"
                      @click="handleBulkCopy"
                    >
                      Copy
                    </UButton>
                    <UButton
                      icon="i-lucide-move"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      :disabled="!canMoveSelection || moveStatus.active || directoryPending"
                      @click="openBulkMoveModalWithDefaults"
                    >
                      Move
                    </UButton>
                    <UButton
                      icon="i-lucide-archive"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      :disabled="!canArchiveSelection || compressStatus.active || directoryPending"
                      @click="handleBulkArchive"
                    >
                      Archive
                    </UButton>
                    <UButton
                      icon="i-lucide-box"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      :disabled="!canUnarchiveSelection || decompressStatus.active || directoryPending"
                      @click="handleBulkUnarchive"
                    >
                      Extract
                    </UButton>
                    <UButton
                      icon="i-lucide-trash"
                      size="xs"
                      variant="soft"
                      color="error"
                      :disabled="!canDeleteSelection || deleteStatus.active || directoryPending"
                      @click="openBulkDeleteModal"
                    >
                      Delete
                    </UButton>
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      :disabled="directoryPending"
                      @click="clearSelection"
                    >
                      Clear
                    </UButton>
                  </div>
                </div>
              </Transition>
            </div>

            <div class="flex min-h-[28rem] flex-1 flex-col gap-4">
              <header class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-xs uppercase text-muted-foreground">Editing</p>
                  <h3 class="text-base font-semibold">
                    {{ selectedFile?.type === 'file' ? selectedFile.name : 'Select a file to view' }}
                  </h3>
                </div>
                <UBadge v-if="selectedFile?.type === 'file'" color="neutral">{{ editorLanguageLabel }}</UBadge>
              </header>

              <div v-if="selectedFile?.type !== 'file'" class="flex flex-1 items-center justify-center rounded-md border border-dashed border-default p-6 text-center text-sm text-muted-foreground">
                Choose a file from the list to preview its contents.
              </div>

              <div v-else class="flex flex-1 flex-col gap-4">
                <UAlert
                  v-if="fileError"
                  color="error"
                  icon="i-lucide-alert-circle"
                >
                  {{ fileError.message }}
                </UAlert>

                <div class="relative flex-1 overflow-hidden rounded-md border border-default/80">
                  <div v-if="filePending" class="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                    <span class="text-sm text-muted-foreground">Loading file…</span>
                  </div>
                  <ClientOnly>
                    <MonacoEditor v-model="editorValue" :lang="editorLanguage" :options="{ automaticLayout: true, readOnly: filePending }" class="h-full" />
                  </ClientOnly>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-2">
                  <UButton icon="i-lucide-rotate-ccw" variant="ghost" color="neutral" :disabled="!isEditorDirty || fileSaving" @click="resetEditor">
                    Reset changes
                  </UButton>
                  <UButton icon="i-lucide-save" :loading="fileSaving" :disabled="!isEditorDirty" @click="saveEditor">
                    Save changes
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </section>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>
  </UPage>

  <UModal v-model:open="renameModal.open" title="Rename file" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <UForm class="space-y-4" @submit.prevent="submitRename">
        <UFormGroup label="New name" required>
          <UInput v-model="renameModal.value" placeholder="Enter new file name" autofocus />
        </UFormGroup>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="renameModal.loading" @click="closeRenameModal">
            Cancel
          </UButton>
          <UButton type="submit" :loading="renameModal.loading">
            Rename
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="deleteModal.open" title="Delete file" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <p class="text-sm text-muted-foreground">
        Are you sure you want to delete
        <strong>{{ deleteModal.file?.name }}</strong>? This action cannot be undone.
      </p>
      <div class="mt-6 flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="deleteModal.loading" @click="closeDeleteModal">
          Cancel
        </UButton>
        <UButton color="error" :loading="deleteModal.loading" @click="submitDelete">
          Delete
        </UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="chmodModal.open" title="Change permissions" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <UForm class="space-y-4" @submit.prevent="submitChmod">
        <UFormGroup label="File mode" help="Provide a numeric mode, e.g. 644 or 755" required>
          <UInput v-model="chmodModal.value" placeholder="755" autofocus />
        </UFormGroup>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="chmodModal.loading" @click="closeChmodModal">
            Cancel
          </UButton>
          <UButton type="submit" :loading="chmodModal.loading">
            Update
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="pullModal.open" title="Pull from URL" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <UForm class="space-y-4" @submit.prevent="submitPull">
        <UFormGroup label="File URL" help="The remote file will be downloaded into the current directory" required>
          <UInput v-model="pullModal.url" type="url" placeholder="https://example.com/file.zip" autofocus />
        </UFormGroup>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="pullModal.loading" @click="closePullModal">
            Cancel
          </UButton>
          <UButton type="submit" :loading="pullModal.loading">
            Pull file
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="bulkMoveModal.open" title="Move selected items" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <div class="space-y-4">
        <div class="rounded-md border border-default/60 bg-muted/10 p-3 text-xs text-muted-foreground">
          <p class="font-medium text-foreground">{{ selectionLabel }}</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in selectionPreview" :key="item.path" class="truncate">• {{ item.name }}</li>
            <li v-if="hasSelectionOverflow" class="italic text-muted-foreground">and {{ selectionOverflow }} more…</li>
          </ul>
        </div>

        <UForm class="space-y-4" @submit.prevent="submitBulkMove">
          <UFormGroup label="Destination directory" help="Enter the path where the selected items should be moved." required>
            <UInput v-model="bulkMoveModal.destination" placeholder="/path/to/destination" :disabled="bulkMoveModal.loading" />
          </UFormGroup>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" :disabled="bulkMoveModal.loading" @click="closeBulkMoveModal">
              Cancel
            </UButton>
            <UButton type="submit" :loading="bulkMoveModal.loading">
              Move items
            </UButton>
          </div>
        </UForm>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="bulkDeleteModal.open" title="Delete selected items" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <div class="space-y-4 text-sm text-muted-foreground">
        <p>
          You are about to permanently delete the selected files and folders. This action cannot be undone.
        </p>
        <div class="rounded-md border border-default/60 bg-muted/10 p-3 text-xs">
          <p class="font-medium text-foreground">{{ selectionLabel }}</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in selectionPreview" :key="item.path" class="truncate">• {{ item.name }}</li>
            <li v-if="hasSelectionOverflow" class="italic text-muted-foreground">and {{ selectionOverflow }} more…</li>
          </ul>
        </div>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="bulkDeleteModal.loading" @click="closeBulkDeleteModal">
            Cancel
          </UButton>
          <UButton color="error" :loading="bulkDeleteModal.loading" @click="submitBulkDelete">
            Delete selected
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
