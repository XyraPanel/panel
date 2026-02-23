<script setup lang="ts">
import type { ServerStartupVariable } from '#shared/types/server';

const route = useRoute();

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const serverId = computed(() => route.params.id as string);
const toast = useToast();
const requestFetch = useRequestFetch();

type ClientStartupResponse = {
  data: {
    startup: string;
    dockerImage?: string;
    dockerImages?: Record<string, string>;
    environment?: Record<string, string>;
    variables?: ServerStartupVariable[];
  };
};

const {
  data: startupData,
  pending,
  error,
  refresh,
} = await useAsyncData(
  `server-${serverId.value}-startup`,
  () => requestFetch<ClientStartupResponse>(`/api/client/servers/${serverId.value}/startup`),
  {
    watch: [serverId],
  },
);

const startup = computed(() => {
  const response = startupData.value;
  return response &&
    typeof response === 'object' &&
    'data' in response &&
    typeof response.data === 'object' &&
    response.data &&
    'startup' in response.data &&
    typeof response.data.startup === 'string'
    ? response.data.startup
    : '';
});
const dockerImage = computed(() => startupData.value?.data?.dockerImage || '');
const dockerImages = computed(() => startupData.value?.data?.dockerImages || {});
const startupVariables = computed<ServerStartupVariable[]>(
  () => startupData.value?.data?.variables ?? [],
);

const hasMultipleDockerImages = computed(() => Object.keys(dockerImages.value).length > 1);

const isCustomDockerImage = computed(() => {
  const images = Object.values(dockerImages.value);
  return images.length > 0 && !images.includes(dockerImage.value);
});

const selectedDockerImage = ref<string>(dockerImage.value);
const isChangingDockerImage = ref(false);

watch(
  dockerImage,
  (newImage) => {
    selectedDockerImage.value = newImage;
  },
  { immediate: true },
);

const dockerImageOptions = computed(() => {
  return Object.entries(dockerImages.value).map(([key, value]) => ({
    label: `${key} (${value})`,
    value: value as string,
  }));
});

const variableValues = ref<Record<string, string>>({});
const savingVariables = ref<Record<string, boolean>>({});

watch(
  startupVariables,
  (variables) => {
    const mapped: Record<string, string> = {};
    variables.forEach((variable) => {
      mapped[variable.key] = variable.value ?? '';
    });
    variableValues.value = mapped;
  },
  { immediate: true },
);

function hasVariableChanged(variable: ServerStartupVariable) {
  return (variableValues.value[variable.key] ?? '') !== (variable.value ?? '');
}

async function saveVariable(variable: ServerStartupVariable) {
  if (!variable.isEditable || !hasVariableChanged(variable)) return;

  savingVariables.value[variable.key] = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/startup/variable`, {
      method: 'PUT',
      body: {
        key: variable.key,
        value: variableValues.value[variable.key] ?? '',
      },
    });

    toast.add({
      title: t('server.startup.variableUpdated'),
      description: t('server.startup.variableUpdatedDescription', { key: variable.key }),
      color: 'success',
    });

    await refresh();
  } catch (err) {
    toast.add({
      title: t('common.error'),
      description:
        (err as { data?: { message?: string } }).data?.message ||
        t('server.startup.variableUpdateFailed'),
      color: 'error',
    });
  } finally {
    savingVariables.value[variable.key] = false;
  }
}

async function updateDockerImage() {
  if (selectedDockerImage.value === dockerImage.value) {
    toast.add({
      title: t('server.startup.noChanges'),
      description: t('server.startup.noChangesDescription'),
      color: 'primary',
    });
    return;
  }

  const images = Object.values(dockerImages.value);

  if (images.length > 0 && !images.includes(selectedDockerImage.value)) {
    toast.add({
      title: t('server.startup.invalidImage'),
      description: t('server.startup.invalidImageDescription'),
      color: 'error',
    });
    return;
  }

  isChangingDockerImage.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/settings/docker-image`, {
      method: 'PUT',
      body: { docker_image: selectedDockerImage.value },
    });

    toast.add({
      title: t('server.startup.dockerImageUpdated'),
      description: t('server.startup.dockerImageUpdatedDescription'),
      color: 'success',
    });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: err.data?.message || t('server.startup.failedToUpdateDockerImage'),
      color: 'error',
    });

    selectedDockerImage.value = dockerImage.value;
  } finally {
    isChangingDockerImage.value = false;
  }
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <div
            v-if="error"
            class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error"
          >
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
              <div>
                <p class="font-medium">{{ t('server.startup.failedToLoad') }}</p>
                <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
              </div>
            </div>
          </div>

          <div v-else-if="pending" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
          </div>

          <template v-else>
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-rocket" class="size-5" />
                  <h2 class="text-lg font-semibold">{{ t('server.startup.startupCommand') }}</h2>
                </div>
              </template>

              <div class="space-y-4">
                <div class="rounded-md border border-default bg-muted/30 p-4">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    {{ t('server.startup.currentStartupCommand') }}
                  </p>
                  <code class="text-sm font-mono text-foreground">{{ startup }}</code>
                </div>

                <UAlert color="warning" icon="i-lucide-info" variant="subtle">
                  <template #description>
                    {{ t('server.startup.startupCommandInfo') }}
                  </template>
                </UAlert>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-container" class="size-5" />
                  <h2 class="text-lg font-semibold">{{ t('server.startup.dockerImage') }}</h2>
                </div>
              </template>

              <div class="space-y-4">
                <div v-if="hasMultipleDockerImages && !isCustomDockerImage">
                  <UFormField
                    :label="t('server.startup.dockerImage')"
                    name="dockerImage"
                    :description="t('server.startup.dockerImageDescription')"
                  >
                    <USelectMenu
                      v-model="selectedDockerImage"
                      :items="dockerImageOptions"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>

                  <div class="flex justify-end mt-4">
                    <UButton
                      icon="i-lucide-check"
                      color="primary"
                      variant="subtle"
                      :loading="isChangingDockerImage"
                      :disabled="isChangingDockerImage || selectedDockerImage === dockerImage"
                      @click="updateDockerImage"
                    >
                      {{ t('server.startup.updateDockerImage') }}
                    </UButton>
                  </div>
                </div>

                <div v-else class="rounded-md border border-default bg-muted/30 p-4">
                  <p class="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    {{ t('server.startup.currentDockerImage') }}
                  </p>
                  <code class="text-sm font-mono text-foreground">{{ dockerImage }}</code>

                  <UAlert
                    v-if="isCustomDockerImage"
                    color="warning"
                    icon="i-lucide-alert-triangle"
                    variant="subtle"
                    class="mt-4"
                  >
                    <template #description>
                      {{ t('server.startup.dockerImageCustomWarning') }}
                    </template>
                  </UAlert>

                  <UAlert v-else color="primary" icon="i-lucide-info" variant="subtle" class="mt-4">
                    <template #description>
                      {{ t('server.startup.dockerImageSingleInfo') }}
                    </template>
                  </UAlert>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-variable" class="size-5" />
                  <h2 class="text-lg font-semibold">
                    {{ t('server.startup.environmentVariables') }}
                  </h2>
                </div>
              </template>

              <template v-if="startupVariables.length === 0">
                <ServerEmptyState
                  icon="i-lucide-variable"
                  :title="t('server.startup.noEnvironmentVariables')"
                  :description="t('server.startup.noEnvironmentVariablesDescription')"
                />
              </template>

              <template v-else>
                <div class="space-y-3">
                  <div
                    v-for="variable in startupVariables.filter(
                      (v) => v.isEditable || (v.value ?? '') !== '',
                    )"
                    :key="variable.key"
                    class="rounded-lg border border-default bg-muted/20 p-4 space-y-3"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-xs uppercase tracking-wide text-muted-foreground">
                        {{ variable.key }}
                      </p>
                      <UBadge
                        v-if="!variable.isEditable"
                        size="xs"
                        variant="subtle"
                        color="neutral"
                      >
                        {{ t('common.readOnly') }}
                      </UBadge>
                      <UBadge v-else size="xs" variant="subtle" color="primary">
                        {{ t('common.userEditable') }}
                      </UBadge>
                    </div>
                    <p v-if="variable.description" class="text-xs text-muted-foreground">
                      {{ variable.description }}
                    </p>
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div class="flex-1">
                        <template v-if="variable.isEditable">
                          <UFormField
                            :label="t('server.startup.variableValue')"
                            :name="variable.key"
                          >
                            <UInput
                              v-model="variableValues[variable.key]"
                              size="sm"
                              :disabled="savingVariables[variable.key]"
                              @keyup.enter="saveVariable(variable)"
                            />
                          </UFormField>
                        </template>
                        <template v-else>
                          <span class="text-xs text-muted-foreground">{{
                            t('server.startup.variableValue')
                          }}</span>
                          <code
                            class="mt-1 block rounded border border-default bg-muted/40 px-3 py-2 text-sm font-mono break-all"
                            :class="
                              variableValues[variable.key]
                                ? 'text-foreground'
                                : 'text-muted-foreground italic'
                            "
                          >
                            {{ variableValues[variable.key] || t('server.startup.noValue') }}
                          </code>
                        </template>
                      </div>
                      <div v-if="variable.isEditable" class="flex gap-2">
                        <UButton
                          size="sm"
                          color="primary"
                          :loading="savingVariables[variable.key]"
                          :disabled="savingVariables[variable.key] || !hasVariableChanged(variable)"
                          @click="saveVariable(variable)"
                        >
                          {{ t('common.save') }}
                        </UButton>
                        <UButton
                          size="sm"
                          variant="ghost"
                          color="neutral"
                          :disabled="savingVariables[variable.key]"
                          @click="variableValues[variable.key] = variable.value ?? ''"
                        >
                          {{ t('common.reset') }}
                        </UButton>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <template #footer>
                <UAlert color="warning" icon="i-lucide-info" variant="subtle">
                  <template #description>
                    {{ t('server.startup.environmentVariablesInfo') }}
                  </template>
                </UAlert>
              </template>
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
