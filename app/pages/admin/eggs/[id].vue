<script setup lang="ts">
import type { EggWithVariables, CreateEggVariablePayload } from '#shared/types/admin-nests'
import type { EggVariable } from '#shared/types/nest'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const route = useRoute()
const toast = useToast()

const eggId = computed(() => route.params.id as string)

const { data: eggData, pending, error, refresh } = await useAsyncData(
  `admin-egg-${eggId.value}`,
  () => $fetch<{ data: EggWithVariables }>(`/api/admin/eggs/${eggId.value}`),
)

const egg = computed(() => eggData.value?.data)

const showVariableModal = ref(false)
const editingVariable = ref<EggVariable | null>(null)
const isSubmitting = ref(false)

const variableForm = ref<CreateEggVariablePayload>({
  eggId: eggId.value,
  name: '',
  description: '',
  envVariable: '',
  defaultValue: '',
  userViewable: true,
  userEditable: true,
  rules: '',
})

function resetVariableForm() {
  variableForm.value = {
    eggId: eggId.value,
    name: '',
    description: '',
    envVariable: '',
    defaultValue: '',
    userViewable: true,
    userEditable: true,
    rules: '',
  }
  editingVariable.value = null
}

function openCreateVariableModal() {
  resetVariableForm()
  showVariableModal.value = true
}

function openEditVariableModal(variable: EggVariable) {
  editingVariable.value = variable
  variableForm.value = {
    eggId: eggId.value,
    name: variable.name,
    description: variable.description || '',
    envVariable: variable.envVariable,
    defaultValue: variable.defaultValue || '',
    userViewable: variable.userViewable,
    userEditable: variable.userEditable,
    rules: variable.rules || '',
  }
  showVariableModal.value = true
}

async function handleVariableSubmit() {
  if (!variableForm.value.name || !variableForm.value.envVariable) {
    toast.add({ title: 'Name and environment variable are required', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    if (editingVariable.value) {

      await $fetch(`/api/admin/eggs/${eggId.value}/variables/${editingVariable.value.id}`, {
        method: 'PATCH',
        body: variableForm.value,
      })
      toast.add({ title: 'Variable updated', color: 'success' })
    } else {

      await $fetch(`/api/admin/eggs/${eggId.value}/variables`, {
        method: 'POST',
        body: variableForm.value,
      })
      toast.add({ title: 'Variable created', color: 'success' })
    }

    showVariableModal.value = false
    resetVariableForm()
    await refresh()
  } catch (err) {
    toast.add({
      title: editingVariable.value ? 'Update failed' : 'Create failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

async function handleDeleteVariable(variable: EggVariable) {
  if (!confirm(`Delete variable "${variable.name}"? This cannot be undone.`)) {
    return
  }

  try {
    await $fetch(`/api/admin/eggs/${eggId.value}/variables/${variable.id}`, {
      method: 'DELETE',
    })
    toast.add({ title: 'Variable deleted', color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({
      title: 'Delete failed',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  }
}

async function handleExportEgg() {
  try {

    const response = await fetch(`/api/admin/eggs/${eggId.value}/export`)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `egg-${egg.value?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    toast.add({
      title: 'Egg exported',
      description: 'Egg configuration downloaded successfully',
      color: 'success',
    })
  } catch (err) {
    toast.add({
      title: 'Export failed',
      description: err instanceof Error ? err.message : 'Failed to export egg',
      color: 'error',
    })
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <div v-if="pending" class="space-y-4">
            <USkeleton class="h-8 w-64" />
            <USkeleton class="h-48 w-full" />
          </div>

          <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
            <template #title>Failed to load egg</template>
            <template #description>{{ error.message }}</template>
          </UAlert>

          <template v-else-if="egg">
            <header class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <UButton icon="i-lucide-arrow-left" size="xs" variant="ghost" :to="`/admin/nests/${egg.nestId}`" />
                  <h1 class="text-xl font-semibold">{{ egg.name }}</h1>
                </div>
                <p v-if="egg.description" class="mt-1 text-sm text-muted-foreground">
                  {{ egg.description }}
                </p>
                <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Author: {{ egg.author }}</span>
                  <span>UUID: {{ egg.uuid }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton icon="i-lucide-download" size="sm" variant="outline" @click="handleExportEgg">
                  Export Egg
                </UButton>
              </div>
            </header>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Configuration</h2>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Docker Image</label>
                  <p class="mt-1 font-mono text-sm">{{ egg.dockerImage }}</p>
                </div>

                <div>
                  <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Startup Command</label>
                  <pre class="mt-1 overflow-auto rounded bg-muted/40 p-3 text-xs">{{ egg.startup }}</pre>
                </div>

                <div v-if="egg.configStop">
                  <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stop Command</label>
                  <p class="mt-1 font-mono text-sm">{{ egg.configStop }}</p>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <h2 class="text-lg font-semibold">Environment Variables</h2>
                    <UBadge color="neutral">{{ egg.variables.length }} total</UBadge>
                  </div>
                  <UButton icon="i-lucide-plus" size="xs" @click="openCreateVariableModal">
                    Add Variable
                  </UButton>
                </div>
              </template>

              <div v-if="egg.variables.length === 0" class="py-8 text-center">
                <UIcon name="i-lucide-variable" class="mx-auto size-10 text-muted-foreground opacity-50" />
                <p class="mt-3 text-sm text-muted-foreground">No variables defined</p>
                <UButton class="mt-4" size="sm" @click="openCreateVariableModal">Add your first variable</UButton>
              </div>

              <div v-else class="divide-y divide-default">
                <div v-for="variable in egg.variables" :key="variable.id" class="py-4">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-medium">{{ variable.name }}</span>
                        <UBadge v-if="variable.userEditable" size="xs" color="primary">User Editable</UBadge>
                        <UBadge v-if="!variable.userViewable" size="xs" color="neutral">Hidden</UBadge>
                      </div>
                      <p v-if="variable.description" class="mt-1 text-sm text-muted-foreground">
                        {{ variable.description }}
                      </p>
                      <div class="mt-2 space-y-1 text-xs">
                        <div class="flex items-center gap-2">
                          <span class="text-muted-foreground">Environment Variable:</span>
                          <code class="rounded bg-muted px-1 py-0.5">{{ variable.envVariable }}</code>
                        </div>
                        <div v-if="variable.defaultValue" class="flex items-center gap-2">
                          <span class="text-muted-foreground">Default Value:</span>
                          <code class="rounded bg-muted px-1 py-0.5">{{ variable.defaultValue }}</code>
                        </div>
                        <div v-if="variable.rules" class="flex items-center gap-2">
                          <span class="text-muted-foreground">Validation:</span>
                          <code class="rounded bg-muted px-1 py-0.5">{{ variable.rules }}</code>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <UButton icon="i-lucide-pencil" size="xs" variant="ghost"
                        @click="openEditVariableModal(variable)" />
                      <UButton icon="i-lucide-trash" size="xs" variant="ghost" color="error"
                        @click="handleDeleteVariable(variable)" />
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-if="egg.scriptInstall">
              <template #header>
                <h2 class="text-lg font-semibold">Install Script</h2>
              </template>

              <div class="space-y-4">
                <div v-if="egg.scriptContainer">
                  <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Container</label>
                  <p class="mt-1 font-mono text-sm">{{ egg.scriptContainer }}</p>
                </div>

                <div v-if="egg.scriptEntry">
                  <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entrypoint</label>
                  <p class="mt-1 font-mono text-sm">{{ egg.scriptEntry }}</p>
                </div>

                <div>
                  <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Script</label>
                  <pre class="mt-1 max-h-96 overflow-auto rounded bg-muted/40 p-3 text-xs">{{ egg.scriptInstall }}</pre>
                </div>
              </div>
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>

    <UModal v-model:open="showVariableModal" :title="editingVariable ? 'Edit Variable' : 'Create Variable'"
      :description="editingVariable ? 'Update environment variable' : 'Add a new environment variable'">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleVariableSubmit">
          <UFormField label="Name" name="name" required>
            <UInput v-model="variableForm.name" placeholder="Server Memory" required :disabled="isSubmitting" />
            <template #help>
              Display name for the variable
            </template>
          </UFormField>

          <UFormField label="Description" name="description">
            <UTextarea v-model="variableForm.description" placeholder="Amount of memory allocated to the server"
              :disabled="isSubmitting" />
          </UFormField>

          <UFormField label="Environment Variable" name="envVariable" required>
            <UInput v-model="variableForm.envVariable" placeholder="SERVER_MEMORY" required :disabled="isSubmitting" />
            <template #help>
              Variable name used in startup command (e.g., SERVER_MEMORY)
            </template>
          </UFormField>

          <UFormField label="Default Value" name="defaultValue">
            <UInput v-model="variableForm.defaultValue" placeholder="1024" :disabled="isSubmitting" />
          </UFormField>

          <UFormField label="Validation Rules" name="rules">
            <UInput v-model="variableForm.rules" placeholder="required|numeric|min:512" :disabled="isSubmitting" />
            <template #help>
              Laravel validation rules (e.g., required|numeric|min:512)
            </template>
          </UFormField>

          <div class="flex gap-4">
            <UFormField label="User Viewable" name="userViewable">
              <UToggle v-model="variableForm.userViewable" :disabled="isSubmitting" />
              <template #help>
                Can users see this variable?
              </template>
            </UFormField>

            <UFormField label="User Editable" name="userEditable">
              <UToggle v-model="variableForm.userEditable" :disabled="isSubmitting" />
              <template #help>
                Can users modify this variable?
              </template>
            </UFormField>
          </div>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showVariableModal = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="isSubmitting" @click="handleVariableSubmit">
            {{ editingVariable ? 'Update' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UPage>
</template>
