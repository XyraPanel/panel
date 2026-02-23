<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { EggWithVariables, CreateEggVariablePayload } from '#shared/types/admin';
import type { EggVariable } from '#shared/types/nest';

definePageMeta({
  auth: true,
});

const route = useRoute();
const { t } = useI18n();
const toast = useToast();
const requestFetch = useRequestFetch();

const eggId = computed(() => route.params.id as string);

const {
  data: eggData,
  pending,
  error,
  refresh,
} = await useAsyncData(`admin-egg-${eggId.value}`, () =>
  requestFetch<{ data: EggWithVariables }>(`/api/admin/eggs/${eggId.value}`),
);

const egg = computed(() => eggData.value?.data);

const showVariableModal = ref(false);
const showDeleteVariableModal = ref(false);
const editingVariable = ref<EggVariable | null>(null);
const variableToDelete = ref<EggVariable | null>(null);
const isSubmitting = ref(false);
const isSavingConfig = ref(false);
const isDeletingVariable = ref(false);

const resetDeleteVariableModal = () => {
  showDeleteVariableModal.value = false;
  variableToDelete.value = null;
};

const configForm = reactive({
  dockerImage: '',
  startup: '',
  configStop: '',
  scriptContainer: '',
  scriptEntry: '',
  scriptInstall: '',
});

watch(
  egg,
  (value) => {
    configForm.dockerImage = value?.dockerImage ?? '';
    configForm.startup = value?.startup ?? '';
    configForm.configStop = value?.configStop ?? '';
    configForm.scriptContainer = value?.scriptContainer ?? '';
    configForm.scriptEntry = value?.scriptEntry ?? '';
    configForm.scriptInstall = value?.scriptInstall ?? '';
  },
  { immediate: true },
);

const variableForm = ref<CreateEggVariablePayload>({
  eggId: eggId.value,
  name: '',
  description: '',
  envVariable: '',
  defaultValue: '',
  userViewable: true,
  userEditable: true,
  rules: '',
});

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
  };
  editingVariable.value = null;
}

function openCreateVariableModal() {
  resetVariableForm();
  showVariableModal.value = true;
}

function openEditVariableModal(variable: EggVariable) {
  editingVariable.value = variable;
  variableForm.value = {
    eggId: eggId.value,
    name: variable.name,
    description: variable.description || '',
    envVariable: variable.envVariable,
    defaultValue: variable.defaultValue || '',
    userViewable: variable.userViewable,
    userEditable: variable.userEditable,
    rules: variable.rules || '',
  };
  showVariableModal.value = true;
}

async function handleVariableSubmit() {
  if (!variableForm.value.name || !variableForm.value.envVariable) {
    toast.add({ title: t('admin.eggs.nameAndEnvVariableRequired'), color: 'error' });
    return;
  }

  isSubmitting.value = true;

  try {
    if (editingVariable.value) {
      await $fetch(`/api/admin/eggs/${eggId.value}/variables/${editingVariable.value.id}`, {
        method: 'patch',
        body: variableForm.value,
      });
      toast.add({ title: t('admin.eggs.variableUpdated'), color: 'success' });
    } else {
      await $fetch(`/api/admin/eggs/${eggId.value}/variables`, {
        method: 'POST',
        body: variableForm.value,
      });
      toast.add({ title: t('admin.eggs.variableCreated'), color: 'success' });
    }

    showVariableModal.value = false;
    resetVariableForm();
    await refresh();
  } catch (err) {
    toast.add({
      title: editingVariable.value ? t('admin.eggs.updateFailed') : t('admin.eggs.createFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleSaveConfig() {
  if (!configForm.dockerImage || !configForm.startup) {
    toast.add({
      title: t('common.error'),
      description: t('admin.eggs.nameAndEnvVariableRequired'),
      color: 'error',
    });
    return;
  }

  isSavingConfig.value = true;
  try {
    await $fetch(`/api/admin/eggs/${eggId.value}`, {
      method: 'PATCH',
      body: {
        dockerImage: configForm.dockerImage,
        startup: configForm.startup,
        configStop: configForm.configStop || null,
        scriptContainer: configForm.scriptContainer || null,
        scriptEntry: configForm.scriptEntry || null,
        scriptInstall: configForm.scriptInstall || null,
      },
    });

    toast.add({
      title: t('common.success'),
      description: t('admin.eggs.configuration'),
      color: 'success',
    });
    await refresh();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description: err instanceof Error ? err.message : t('admin.eggs.updateFailed'),
      color: 'error',
    });
  } finally {
    isSavingConfig.value = false;
  }
}

async function handleDeleteVariable() {
  if (!variableToDelete.value) return;

  isDeletingVariable.value = true;
  try {
    await $fetch(`/api/admin/eggs/${eggId.value}/variables/${variableToDelete.value.id}`, {
      method: 'DELETE',
    });
    toast.add({ title: t('admin.eggs.variableDeleted'), color: 'success' });
    resetDeleteVariableModal();
    await refresh();
  } catch (err) {
    toast.add({
      title: t('admin.eggs.deleteFailed'),
      description: err instanceof Error ? err.message : t('common.errorOccurred'),
      color: 'error',
    });
  } finally {
    isDeletingVariable.value = false;
  }
}

async function handleExportEgg() {
  try {
    const response = await fetch(`/api/admin/eggs/${eggId.value}/export`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egg-${egg.value?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.add({
      title: t('admin.eggs.eggExported'),
      description: t('admin.eggs.eggExportedDescription'),
      color: 'success',
    });
  } catch (err) {
    toast.add({
      title: t('admin.eggs.exportFailed'),
      description: err instanceof Error ? err.message : t('admin.eggs.failedToExportEgg'),
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
          <div v-if="pending" class="space-y-4">
            <USkeleton class="h-8 w-64" />
            <USkeleton class="h-48 w-full" />
          </div>

          <UAlert v-else-if="error" color="error" icon="i-lucide-alert-triangle">
            <template #title>{{ t('admin.eggs.failedToLoadEgg') }}</template>
            <template #description>{{ error.message }}</template>
          </UAlert>

          <template v-else-if="egg">
            <header class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <UButton
                    icon="i-lucide-arrow-left"
                    size="xs"
                    variant="ghost"
                    :to="`/admin/nests/${egg.nestId}`"
                  />
                  <h1 class="text-xl font-semibold">{{ egg.name }}</h1>
                </div>
                <p v-if="egg.description" class="mt-1 text-sm text-muted-foreground">
                  {{ egg.description }}
                </p>
                <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{{ t('admin.nests.author') }}: {{ egg.author }}</span>
                  <span>{{ t('admin.nests.uuid') }}: {{ egg.uuid }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  icon="i-lucide-download"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  @click="handleExportEgg"
                >
                  {{ t('admin.eggs.exportEgg') }}
                </UButton>
              </div>
            </header>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.eggs.configuration') }}</h2>
              </template>

              <div class="space-y-4">
                <UFormField
                  :label="t('admin.nests.createEgg.dockerImage')"
                  name="dockerImage"
                  required
                >
                  <UInput
                    v-model="configForm.dockerImage"
                    :placeholder="t('admin.nests.createEgg.dockerImage')"
                    class="w-full"
                    :disabled="isSavingConfig"
                  />
                </UFormField>

                <UFormField
                  :label="t('admin.nests.createEgg.startupCommand')"
                  name="startup"
                  required
                >
                  <UTextarea
                    v-model="configForm.startup"
                    :rows="4"
                    class="font-mono w-full"
                    :disabled="isSavingConfig"
                  />
                </UFormField>

                <UFormField :label="t('admin.eggs.stopCommand')" name="configStop">
                  <UInput
                    v-model="configForm.configStop"
                    :placeholder="t('admin.eggs.stopCommand')"
                    class="w-full"
                    :disabled="isSavingConfig"
                  />
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    color="primary"
                    variant="subtle"
                    :loading="isSavingConfig"
                    :disabled="isSavingConfig"
                    @click="handleSaveConfig"
                  >
                    {{ t('common.save') }}
                  </UButton>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <h2 class="text-lg font-semibold">
                      {{ t('admin.eggs.environmentVariables') }}
                    </h2>
                    <UBadge color="neutral" variant="outline" size="sm"
                      >{{ egg.variables.length }} {{ t('common.all') }}
                    </UBadge>
                  </div>
                  <UButton
                    icon="i-lucide-plus"
                    size="sm"
                    color="primary"
                    variant="subtle"
                    @click="openCreateVariableModal"
                  >
                    {{ t('admin.eggs.addVariable') }}
                  </UButton>
                </div>
              </template>

              <UEmpty
                v-if="egg.variables.length === 0"
                icon="i-lucide-variable"
                :title="t('admin.eggs.noVariablesDefined')"
                :description="t('admin.eggs.noVariablesDefinedDescription')"
              >
                <UButton class="mt-4" size="sm" @click="openCreateVariableModal"
                  >{{ t('admin.eggs.addFirstVariable') }}
                </UButton>
              </UEmpty>

              <div v-else class="divide-y divide-default">
                <div v-for="variable in egg.variables" :key="variable.id" class="py-4">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-medium">{{ variable.name }}</span>
                        <UBadge
                          v-if="variable.userEditable"
                          size="sm"
                          color="neutral"
                          variant="subtle"
                          >{{ t('admin.eggs.userEditable') }}</UBadge
                        >
                        <UBadge v-if="!variable.userViewable" size="xs" color="neutral"
                          >{{ t('admin.eggs.hidden') }}
                        </UBadge>
                      </div>
                      <p v-if="variable.description" class="mt-1 text-sm text-muted-foreground">
                        {{ variable.description }}
                      </p>
                      <div class="mt-2 space-y-1 text-xs">
                        <div class="flex items-center gap-2">
                          <span class="text-muted-foreground"
                            >{{ t('admin.eggs.environmentVariable') }}:</span
                          >
                          <code class="rounded bg-muted px-1 py-0.5">{{
                            variable.envVariable
                          }}</code>
                        </div>
                        <div v-if="variable.defaultValue" class="flex items-center gap-2">
                          <span class="text-muted-foreground"
                            >{{ t('admin.eggs.defaultValue') }}:</span
                          >
                          <code class="rounded bg-muted px-1 py-0.5">{{
                            variable.defaultValue
                          }}</code>
                        </div>
                        <div v-if="variable.rules" class="flex items-center gap-2">
                          <span class="text-muted-foreground"
                            >{{ t('admin.eggs.validation') }}:</span
                          >
                          <code class="rounded bg-muted px-1 py-0.5">{{ variable.rules }}</code>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <UButton
                        icon="i-lucide-pencil"
                        size="xs"
                        variant="ghost"
                        color="info"
                        @click="openEditVariableModal(variable)"
                      />
                      <UButton
                        icon="i-lucide-trash"
                        size="xs"
                        variant="ghost"
                        color="error"
                        @click="
                          variableToDelete = variable;
                          showDeleteVariableModal = true;
                        "
                      />
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('admin.eggs.installScript') }}</h2>
              </template>

              <div class="space-y-4">
                <UFormField :label="t('admin.eggs.container')" name="scriptContainer">
                  <UInput
                    v-model="configForm.scriptContainer"
                    placeholder="ghcr.io/ptero-eggs/installers:alpine"
                    class="w-full font-mono"
                    :disabled="isSavingConfig"
                  />
                </UFormField>

                <UFormField :label="t('admin.eggs.entrypoint')" name="scriptEntry">
                  <UInput
                    v-model="configForm.scriptEntry"
                    placeholder="ash"
                    class="w-full font-mono"
                    :disabled="isSavingConfig"
                  />
                </UFormField>

                <UFormField :label="t('admin.eggs.script')" name="scriptInstall">
                  <UTextarea
                    v-model="configForm.scriptInstall"
                    :rows="20"
                    class="w-full font-mono text-xs"
                    :disabled="isSavingConfig"
                  />
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    color="primary"
                    variant="subtle"
                    :loading="isSavingConfig"
                    :disabled="isSavingConfig"
                    @click="handleSaveConfig"
                  >
                    {{ t('common.save') }}
                  </UButton>
                </div>
              </div>
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>

    <UModal
      v-model:open="showVariableModal"
      :title="editingVariable ? t('admin.eggs.editVariable') : t('admin.eggs.createVariable')"
      :description="
        editingVariable
          ? t('admin.eggs.updateEnvironmentVariable')
          : t('admin.eggs.addNewEnvironmentVariable')
      "
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="handleVariableSubmit">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput
              v-model="variableForm.name"
              :placeholder="t('admin.eggs.variableNamePlaceholder')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.eggs.variableNameHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('common.description')" name="description">
            <UTextarea
              v-model="variableForm.description"
              :placeholder="t('admin.eggs.variableDescriptionPlaceholder')"
              class="w-full"
              :disabled="isSubmitting"
            />
          </UFormField>

          <UFormField :label="t('admin.eggs.environmentVariable')" name="envVariable" required>
            <UInput
              v-model="variableForm.envVariable"
              :placeholder="t('admin.eggs.envVariablePlaceholder')"
              required
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.eggs.envVariableHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.eggs.defaultValue')" name="defaultValue">
            <UInput
              v-model="variableForm.defaultValue"
              :placeholder="t('admin.eggs.defaultValuePlaceholder')"
              :disabled="isSubmitting"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('admin.eggs.validationRules')" name="rules">
            <UInput
              v-model="variableForm.rules"
              :placeholder="t('admin.eggs.validationRulesPlaceholder')"
              :disabled="isSubmitting"
              class="w-full"
            />
            <template #help>
              {{ t('admin.eggs.validationRulesHelp') }}
            </template>
          </UFormField>

          <div class="flex gap-4">
            <UFormField :label="t('admin.eggs.userViewable')" name="userViewable">
              <USwitch v-model="variableForm.userViewable" :disabled="isSubmitting" />
              <template #help>
                {{ t('admin.eggs.userViewableHelp') }}
              </template>
            </UFormField>

            <UFormField :label="t('admin.eggs.userEditable')" name="userEditable">
              <USwitch v-model="variableForm.userEditable" :disabled="isSubmitting" />
              <template #help>
                {{ t('admin.eggs.userEditableHelp') }}
              </template>
            </UFormField>
          </div>
        </form>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" :disabled="isSubmitting" @click="showVariableModal = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="primary" :loading="isSubmitting" @click="handleVariableSubmit">
            {{ editingVariable ? t('common.update') : t('common.create') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteVariableModal"
      :title="t('admin.eggs.deleteVariable')"
      :description="t('admin.eggs.confirmDeleteVariableDescription')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UAlert color="error" variant="soft" icon="i-lucide-alert-triangle" class="mb-4">
          <template #title>{{ t('common.warning') }}</template>
          <template #description>{{ t('admin.eggs.deleteVariableWarning') }}</template>
        </UAlert>
        <div v-if="variableToDelete" class="rounded-md bg-muted p-3 text-sm">
          <p class="font-medium">
            {{ t('common.name') }}: <span class="text-foreground">{{ variableToDelete.name }}</span>
          </p>
          <p class="text-muted-foreground mt-2">
            {{ t('admin.eggs.environmentVariable') }}:
            <code class="font-mono">{{ variableToDelete.envVariable }}</code>
          </p>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" :disabled="isDeletingVariable" @click="resetDeleteVariableModal">
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :loading="isDeletingVariable"
          @click="handleDeleteVariable"
        >
          {{ t('admin.eggs.deleteVariable') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
