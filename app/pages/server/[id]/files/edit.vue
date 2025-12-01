<script setup lang="ts">
import { ref, computed } from 'vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)
const filePath = computed(() => route.query.file as string || '')

const content = ref('')
const originalContent = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const hasChanges = computed(() => content.value !== originalContent.value)

const language = computed(() => {
  const ext = filePath.value.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'json': 'json',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
    'sh': 'shell',
    'bash': 'shell',
    'py': 'python',
    'java': 'java',
    'php': 'php',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'cpp': 'cpp',
    'c': 'c',
    'sql': 'sql',
    'properties': 'ini',
    'conf': 'ini',
    'cfg': 'ini',
    'ini': 'ini',
    'toml': 'toml',
    'txt': 'plaintext',
  }
  return languageMap[ext || ''] || 'plaintext'
})

const fileName = computed(() => {
  return filePath.value.split('/').pop() || 'Untitled'
})

async function loadFile() {
  if (!filePath.value) {
    error.value = t('server.files.noFileSpecified')
    return
  }

  loading.value = true
  error.value = null

  try {
    const response = await $fetch<{ data: { path: string; content: string } }>(
      `/api/servers/${serverId.value}/files/contents`,
      {
        query: { file: filePath.value },
      },
    )

    content.value = response.data.content
    originalContent.value = response.data.content
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : t('server.files.failedToLoadFile')
  }
  finally {
    loading.value = false
  }
}

async function saveFile() {
  saving.value = true
  error.value = null

  try {
    await $fetch(`/api/servers/${serverId.value}/files/write`, {
      method: 'POST',
      body: {
        file: filePath.value,
        content: content.value,
      },
    })

    originalContent.value = content.value

    useToast().add({
      title: t('server.files.fileSaved'),
      description: t('server.files.changesSavedSuccessfully'),
      color: 'success',
    })
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : t('server.files.failedToSaveFile')
    useToast().add({
      title: t('server.files.saveFailed'),
      description: error.value,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

function cancel() {
  if (hasChanges.value) {
    if (confirm(t('server.files.confirmLeaveUnsavedChanges'))) {
      router.back()
    }
  }
  else {
    router.back()
  }
}

function handleKeyDown(event: KeyboardEvent) {

  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    saveFile()
  }
}

onMounted(() => {
  loadFile()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

onBeforeRouteLeave((to, from, next) => {
  if (hasChanges.value) {
    const answer = window.confirm(t('server.files.confirmLeaveUnsavedChanges'))
    if (answer) {
      next()
    }
    else {
      next(false)
    }
  }
  else {
    next()
  }
})
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div class="space-y-4">

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              @click="cancel"
            >
              {{ t('common.back') }}
            </UButton>
            <div>
              <h1 class="text-xl font-semibold">{{ fileName }}</h1>
              <p class="text-xs text-muted-foreground">{{ filePath }}</p>
            </div>
            <UBadge v-if="hasChanges" color="warning" size="xs">
              {{ t('server.files.unsavedChanges') }}
            </UBadge>
          </div>

          <div class="flex items-center gap-2">
            <UBadge variant="soft" size="xs">
              {{ language }}
            </UBadge>
            <UButton
              icon="i-lucide-save"
              color="primary"
              :loading="saving"
              :disabled="!hasChanges || loading"
              @click="saveFile"
            >
              {{ t('server.files.saveWithShortcut') }}
            </UButton>
          </div>
        </div>

        <UAlert v-if="error" color="error" icon="i-lucide-alert-circle" :title="error" />

        <div v-if="loading" class="flex items-center justify-center rounded-lg border border-default bg-background p-12">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="mx-auto size-8 animate-spin text-primary" />
            <p class="mt-2 text-sm text-muted-foreground">{{ t('server.files.loadingFile') }}</p>
          </div>
        </div>

        <UCard v-else class="overflow-hidden">
          <ClientOnly>
            <MonacoEditor
              v-model="content"
              :lang="language"
              :options="{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                roundedSelection: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
              }"
              class="h-[600px]"
            />
            <template #fallback>
              <div class="flex h-[600px] items-center justify-center">
                <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
              </div>
            </template>
          </ClientOnly>
        </UCard>

        <div class="text-xs text-muted-foreground">
          <p>{{ t('server.files.saveKeyboardShortcut') }}</p>
        </div>
        </div>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
