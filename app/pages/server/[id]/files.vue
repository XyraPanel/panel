<script setup lang="ts">
import type { ServerFileEntry, ServerFileListItem } from '#shared/types/server'

const route = useRoute()

definePageMeta({
  auth: true,
  layout: 'server',
})

const { t } = useI18n()
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
const isSavingFile = ref(false)
const fileUploadInput = ref<HTMLInputElement | null>(null)
const uploadInProgress = ref(false)
const pullInProgress = ref(false)

let currentFileRequest: AbortController | null = null

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
    size: entry.isDirectory ? t('common.na') : formatBytes(entry.size),
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
    copyStatus.summary = t('common.transferring')

    try {
      for (const item of items) {
        copyStatus.summary = t('server.files.transferring')
      await $fetch(`/api/servers/${serverId.value}/files/copy`, {
        method: 'POST',
        body: {
          location: item.path,
        },
      })
    }

    toast.add({
      title: t('common.success'),
      description: t('server.files.title'),
    })

    await fetchDirectory()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
  moveStatus.summary = t('common.transferring')
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
      title: t('common.success'),
      description: t('server.files.title'),
    })

    await fetchDirectory()
    clearSelection()
    closeBulkMoveModal()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
  deleteStatus.summary = t('common.delete')
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
      title: t('common.success'),
      description: t('server.files.title'),
    })

    clearSelection()
    bulkDeleteModal.open = false
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
      title: t('common.success'),
      description: t('server.files.title'),
    })

    await fetchDirectory()
    clearSelection()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
      title: t('common.success'),
      description: t('server.files.title'),
    })

    await fetchDirectory()
    clearSelection()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
    toast.add({ color: 'error', title: t('validation.required'), description: t('validation.required') })
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
      title: t('common.success'),
      description: t('server.files.title'),
    })
    closeNewFileModal()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
    toast.add({ color: 'error', title: t('validation.required'), description: t('validation.required') })
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
      title: t('common.success'),
      description: t('server.files.title'),
    })
    closeNewFolderModal()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
      title: t('common.success'),
      description: t('server.files.title'),
    })

    await fetchDirectory()
  }
  catch (error) {
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: error instanceof Error ? error.message : t('server.files.failedToLoad'),
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
      toast.add({ title: t('server.files.download'), description: t('server.files.title') })
    }
  }
  catch (error) {
    toast.add({ color: 'error', title: t('common.error'), description: error instanceof Error ? error.message : t('server.files.failedToLoad') })
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
    toast.add({ title: t('common.success'), description: t('server.files.title') })
    if (selectedFile.value?.path === renameModal.file.path)
      selectedFile.value = null
    await fetchDirectory()
    closeRenameModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: t('common.error'), description: error instanceof Error ? error.message : t('server.files.failedToLoad') })
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
    toast.add({ title: t('common.success'), description: t('server.files.title') })
    if (selectedFile.value?.path === deleteModal.file.path)
      selectedFile.value = null
    await fetchDirectory()
    closeDeleteModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: t('common.error'), description: error instanceof Error ? error.message : t('server.files.failedToLoad') })
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
    toast.add({ color: 'error', title: t('validation.required'), description: t('validation.required') })
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
    toast.add({ title: t('common.success'), description: t('server.files.title') })
    await fetchDirectory()
    closeChmodModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: t('common.error'), description: error instanceof Error ? error.message : t('server.files.failedToLoad') })
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
    toast.add({ color: 'error', title: t('validation.required'), description: t('validation.required') })
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
    toast.add({ title: t('common.success'), description: t('server.files.title') })
    await fetchDirectory()
    closePullModal()
  }
  catch (error) {
    toast.add({ color: 'error', title: t('common.error'), description: error instanceof Error ? error.message : t('server.files.failedToLoad') })
  }
  finally {
    pullModal.loading = false
    pullInProgress.value = false
  }
}

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
    label: t('server.files.title'),
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
    actions.push({ label: t('server.files.rename'), icon: 'i-lucide-pencil', onClick: () => openRenameModal(file) })
    actions.push({ label: t('server.files.download'), icon: 'i-lucide-download', onClick: () => handleDownload(file) })
    actions.push({ label: t('server.files.title'), icon: 'i-lucide-shield', onClick: () => openChmodModal(file) })
  }

  actions.push({ label: t('server.files.delete'), icon: 'i-lucide-trash', onClick: () => openDeleteModal(file) })

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
    size: entry.isDirectory ? t('common.na') : formatBytes(entry.size),
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
    return t('common.na')
  if (size === 0)
    return `0 ${t('common.bytes')}`

  const units = [t('common.bytes'), t('common.kb'), t('common.mb'), t('common.gb'), t('common.tb')]
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
  if (isSavingFile.value || fileSaving.value) {
    console.log('[Files Watch] Save in progress, skipping reload')
    return
  }
  
  if (file && file.path === previous?.path && file.type === previous?.type) {
    console.log('[Files Watch] File path unchanged, skipping reload:', file.path)
    return
  }
  
  if (previous?.path && dirtyFiles.has(previous.path)) {
    console.log('[Files Watch] Previous file has unsaved changes, skipping reload to preserve edits')
  }
  
  if (currentFileRequest) {
    currentFileRequest.abort()
    currentFileRequest = null
  }

  if (previous?.path && previous.path !== file?.path)
    dirtyFiles.delete(previous.path)

  if (!file || file.type !== 'file') {
    editorValue.value = ''
    fileError.value = null
    filePending.value = false
    return
  }
  
  if (file.path === previous?.path && dirtyFiles.has(file.path) && editorValue.value) {
    console.log('[Files Watch] File has unsaved changes, skipping reload to preserve edits:', file.path)
    return
  }
  
  console.log('[Files Watch] Loading file content:', file.path)

  const abortController = new AbortController()
  currentFileRequest = abortController

  filePending.value = true
  fileError.value = null
  editorValue.value = ''

  try {
    const url = `/api/servers/${serverId.value}/files-content`
    
    const response = await $fetch<{ data: { path: string; content: string } }>(url, {
      query: { file: file.path },
      headers: {
        'Accept': 'application/json',
      },
      signal: abortController.signal, 
    })

    if (abortController.signal.aborted) {
      return
    }

    if (selectedFile.value?.path !== file.path) {
      return
    }
    
    if (!response || !response.data) {
      throw new Error('Invalid response from server: missing data')
    }

    const fileData = response.data
    
    if (selectedFile.value?.path === file.path) {
      editorValue.value = fileData.content || ''
      fileError.value = null
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return
    }

    if (selectedFile.value?.path !== file.path) {
      return
    }
    
    let errorMessage = 'Unable to load file contents. Please check the server console for details.'
    
    if (error && typeof error === 'object') {
      if ('data' in error && error.data) {
        if (typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message)
        }
        else if (typeof error.data === 'string') {
          errorMessage = error.data
        }
      }
      if ('message' in error && error.message) {
        errorMessage = String(error.message)
      }
      else if ('statusMessage' in error && error.statusMessage) {
        errorMessage = String(error.statusMessage)
      }
      else if ('statusText' in error && error.statusText) {
        errorMessage = String(error.statusText)
      }
    }
    else if (typeof error === 'string' && error) {
      errorMessage = error
    }
    
    if (!errorMessage || errorMessage.trim().length === 0 || errorMessage === '1') {
      errorMessage = 'Unable to load file contents. The server may be offline or the file may not exist.'
    }
    
    if (selectedFile.value?.path === file.path) {
      fileError.value = new Error(errorMessage)
      editorValue.value = ''
    }
  }
  finally {
    if (currentFileRequest === abortController) {
      filePending.value = false
      currentFileRequest = null
    }
  }
})

watch(editorValue, (value, previousValue) => {
  const file = selectedFile.value
  if (file?.type === 'file') {
    if (value !== undefined && value !== previousValue) {
      dirtyFiles.add(file.path)
      console.log('[Files Watch] Editor value changed, marking as dirty:', file.path)
    }
  }
}, { flush: 'post' }) 

onUnmounted(() => {
  if (currentFileRequest) {
    currentFileRequest.abort()
    currentFileRequest = null
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

async function saveEditor(event?: Event) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }
  
  console.log('[Files Save] saveEditor() called!', {
    hasSelectedFile: !!selectedFile.value,
    fileType: selectedFile.value?.type,
    filePath: selectedFile.value?.path,
    editorValueLength: editorValue.value?.length,
    fileSaving: fileSaving.value,
    isEditorDirty: isEditorDirty.value,
  })
  
  const file = selectedFile.value
  if (!file || file.type !== 'file') {
    console.warn('[Files Save] No file selected or not a file', { file, type: file?.type })
    return
  }
  
  if (!isEditorDirty.value) {
    console.warn('[Files Save] No changes to save')
    return
  }
  
  if (fileSaving.value) {
    console.warn('[Files Save] Save already in progress')
    return
  }

  const content = editorValue.value || ''
  console.log('[Files Save] Starting save...', { 
    filePath: file.path, 
    contentLength: content.length,
    serverId: serverId.value,
    url: `/api/servers/${serverId.value}/files/write`,
  })

  try {
    fileSaving.value = true
    isSavingFile.value = true
    
    const url = `/api/servers/${serverId.value}/files/write`
    const body = {
      file: file.path,
      content: content,
    }
    
    console.log('[Files Save] Sending POST request:', { 
      url, 
      body: { file: body.file, contentLength: body.content.length },
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })
    
    console.log('[Files Save] About to call $fetch...')
    console.log('[Files Save] Full request details:', {
      url,
      method: 'POST',
      bodyKeys: Object.keys(body),
      bodyFile: body.file,
      bodyContentPreview: body.content?.substring(0, 100),
      bodyContentLength: body.content?.length,
    })
    
    let response
    try {
      console.log('[Files Save] Calling $fetch now...')
      const startTime = Date.now()
      
      console.log('[Files Save] Network request starting:', {
        url: new URL(url, window.location.origin).href,
        method: 'POST',
        bodySize: JSON.stringify(body).length,
      })
      
      response = await $fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body,
      })
      const duration = Date.now() - startTime
      console.log('[Files Save] $fetch completed successfully in', duration, 'ms')
      
      if (typeof response === 'string' && response.includes('<!DOCTYPE html>')) {
        console.error('[Files Save] CRITICAL: Received HTML instead of JSON! Route not matching!')
        console.error('[Files Save] This means the route handler is NOT being called by Nitro')
        console.error('[Files Save] Response preview:', response.substring(0, 500))
        throw new Error('Route not found - received HTML instead of JSON. The API endpoint may not be registered. Please restart the dev server.')
      }
      
      console.log('[Files Save] Response type:', typeof response)
      console.log('[Files Save] Response:', response)
    } catch (err) {
      console.error('[Files Save] $fetch error:', {
        error: err,
        errorType: typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
        errorName: err instanceof Error ? err.name : undefined,
        url,
        bodyKeys: Object.keys(body),
        bodyFile: body.file,
        bodyContentLength: body.content?.length,
      })
      throw err
    }

    console.log('[Files Save] Success! Response:', response)
    dirtyFiles.delete(file.path)
    
    toast.add({
      title: t('common.success'),
      description: t('server.files.title'),
    })
    
    // Don't reload the file - the content is already what we saved
    // Only reload if we need to verify it was saved correctly
    // (which we can do manually if needed)
  }
  catch (error) {
    console.error('[Files Save] Error:', {
      error,
      errorType: typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorKeys: error && typeof error === 'object' ? Object.keys(error) : [],
      errorString: String(error),
    })
    
    let errorMessage = 'Unable to save file contents.'
    if (error && typeof error === 'object') {
      if ('data' in error && error.data) {
        if (typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message)
        } else if (typeof error.data === 'string') {
          errorMessage = error.data
        }
      }
      if ('message' in error && error.message) {
        errorMessage = String(error.message)
      }
    } else if (typeof error === 'string') {
      errorMessage = error
    }
    
    toast.add({
      color: 'error',
      title: t('common.error'),
      description: errorMessage,
    })
  }
  finally {
    fileSaving.value = false
    await nextTick()
    setTimeout(() => {
      isSavingFile.value = false
    }, 100)
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
      <UContainer>
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

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold">{{ t('server.files.title') }}</h2>
                <p class="text-xs text-muted-foreground">{{ t('server.files.description') }}</p>
              </div>
              <UBadge v-if="directoryPending" color="neutral" variant="soft">{{ t('server.files.loading') }}</UBadge>
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
                    :aria-label="t('server.files.selectAllEntries')"
                    @update:model-value="toggleSelectAllEntries($event as boolean)"
                  />
                  <span class="flex-1">{{ t('common.name') }}</span>
                  <span class="w-24">{{ t('server.files.file') }}</span>
                  <span class="w-32 text-right">{{ t('server.files.modified') }}</span>
                  <span class="w-8 text-right">{{ t('common.actions') }}</span>
                </div>
                <div class="max-h-112 overflow-y-auto">
                  <div v-if="directoryPending" class="space-y-2 p-3 text-xs text-muted-foreground">
                    <div v-for="index in 5" :key="index" class="h-5 animate-pulse rounded bg-muted/60"/>
                  </div>
                  <div v-else-if="currentEntries.length === 0" class="px-3 py-4 text-xs text-muted-foreground">
                    {{ t('server.files.noFilesDescription') }}
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
                      :aria-label="t('server.files.selectEntry')"
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
                    <UDropdownMenu
                      v-if="entry.type === 'file'"
                      :items="availableFileActions(entry).map(action => ({ label: action.label, icon: action.icon, click: action.onClick }))"
                    >
                      <UButton icon="i-lucide-ellipsis-vertical" variant="ghost" size="xs" color="neutral" />
                    </UDropdownMenu>
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

            <div class="flex min-h-112 flex-1 flex-col gap-4">
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
                  :title="t('server.files.errorLoadingFile')"
                >
                  {{ fileError?.message || fileError?.toString() || t('server.files.failedToLoadFileContents') }}
                </UAlert>

                <div class="relative flex-1 overflow-hidden rounded-md border border-default/80">
                  <div v-if="filePending" class="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                    <span class="text-sm text-muted-foreground">Loading file…</span>
                  </div>
                  <ClientOnly>
                    <template #default>
                      <MonacoEditor
                        v-if="selectedFile && !filePending"
                        :key="selectedFile.path"
                        v-model="editorValue"
                        :lang="editorLanguage"
                        :options="{
                          automaticLayout: true,
                          readOnly: filePending,
                          minimap: { enabled: true },
                          fontSize: 14,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          tabSize: 2,
                        }"
                        class="h-full"
                      />
                    </template>
                    <template #fallback>
                      <div class="flex h-full items-center justify-center">
                        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
                      </div>
                    </template>
                  </ClientOnly>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-2">
                  <UButton icon="i-lucide-rotate-ccw" variant="ghost" color="neutral" :disabled="!isEditorDirty || fileSaving" @click="resetEditor">
                    Reset changes
                  </UButton>
                  <UButton 
                    type="button"
                    icon="i-lucide-save" 
                    :loading="fileSaving" 
                    :disabled="!isEditorDirty || fileSaving" 
                    @click="saveEditor"
                  >
                    Save changes
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <template #right>
      <UPageAside />
    </template>
  </UPage>

  <UModal v-model:open="renameModal.open" :title="t('server.files.rename')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <UForm class="space-y-4" @submit.prevent="submitRename">
        <UFormField :label="t('common.name')" name="newName" required>
          <UInput v-model="renameModal.value" :placeholder="t('server.files.rename')" autofocus />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="renameModal.loading" @click="closeRenameModal">
            {{ t('common.cancel') }}
          </UButton>
          <UButton type="submit" :loading="renameModal.loading">
            {{ t('server.files.rename') }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="deleteModal.open" :title="t('server.files.delete')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <p class="text-sm text-muted-foreground">
        {{ t('common.delete') }}
        <strong>{{ deleteModal.file?.name }}</strong>? {{ t('common.delete') }}
      </p>
      <div class="mt-6 flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="deleteModal.loading" @click="closeDeleteModal">
          {{ t('common.cancel') }}
        </UButton>
        <UButton color="error" :loading="deleteModal.loading" @click="submitDelete">
          {{ t('server.files.delete') }}
        </UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="chmodModal.open" :title="t('server.files.title')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <UForm class="space-y-4" @submit.prevent="submitChmod">
        <UFormField :label="t('server.files.title')" name="fileMode" :help="t('server.files.title')" required>
          <UInput v-model="chmodModal.value" placeholder="755" autofocus />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="chmodModal.loading" @click="closeChmodModal">
            {{ t('common.cancel') }}
          </UButton>
          <UButton type="submit" :loading="chmodModal.loading">
            {{ t('common.update') }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="pullModal.open" :title="t('server.files.title')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <UForm class="space-y-4" @submit.prevent="submitPull">
        <UFormField :label="t('server.files.title')" name="fileUrl" :help="t('server.files.title')" required>
          <UInput v-model="pullModal.url" type="url" placeholder="https://example.com/file.zip" autofocus />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="pullModal.loading" @click="closePullModal">
            {{ t('common.cancel') }}
          </UButton>
          <UButton type="submit" :loading="pullModal.loading">
            {{ t('server.files.title') }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>

  <UModal v-model:open="bulkMoveModal.open" :title="t('server.files.moveSelectedItems')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <div class="space-y-4">
        <div class="rounded-md border border-default/60 bg-muted/10 p-3 text-xs text-muted-foreground">
          <p class="font-medium text-foreground">{{ selectionLabel }}</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in selectionPreview" :key="item.path" class="truncate">• {{ item.name }}</li>
            <li v-if="hasSelectionOverflow" class="italic text-muted-foreground">{{ t('server.files.andMore', { count: selectionOverflow }) }}</li>
          </ul>
        </div>

        <UForm class="space-y-4" @submit.prevent="submitBulkMove">
          <UFormField :label="t('server.files.destinationDirectory')" name="destination" :help="t('server.files.destinationDirectoryHelp')" required>
            <UInput v-model="bulkMoveModal.destination" :placeholder="t('server.files.destinationDirectoryPlaceholder')" :disabled="bulkMoveModal.loading" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" :disabled="bulkMoveModal.loading" @click="closeBulkMoveModal">
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

  <UModal v-model:open="bulkDeleteModal.open" :title="t('server.files.deleteSelectedItems')" :ui="{ footer: 'justify-end gap-2' }">
    <template #body>
      <div class="space-y-4 text-sm text-muted-foreground">
        <p>
          {{ t('server.files.deleteSelectedItemsDescription') }}
        </p>
        <div class="rounded-md border border-default/60 bg-muted/10 p-3 text-xs">
          <p class="font-medium text-foreground">{{ selectionLabel }}</p>
          <ul class="mt-2 space-y-1">
            <li v-for="item in selectionPreview" :key="item.path" class="truncate">• {{ item.name }}</li>
            <li v-if="hasSelectionOverflow" class="italic text-muted-foreground">{{ t('server.files.andMore', { count: selectionOverflow }) }}</li>
          </ul>
        </div>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" :disabled="bulkDeleteModal.loading" @click="closeBulkDeleteModal">
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
