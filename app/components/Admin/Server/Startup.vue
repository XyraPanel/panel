<script setup lang="ts">
import type { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import type { Server, EnvironmentEntry, EnvironmentInputValue } from '#shared/types/server';
import { serverStartupSchema } from '#shared/schema/admin/server';

const props = defineProps<{
  server: Server;
}>();

const toast = useToast();
const isSubmitting = ref(false);

const schema = serverStartupSchema;

type FormSchema = z.infer<typeof schema>;

const serverAsDetails = props.server as import('#shared/types/server').AdminServerDetails;

const dockerImages = computed<Record<string, string>>(() => {
  return serverAsDetails.egg?.dockerImages ?? {};
});

const hasMultipleDockerImages = computed(() => Object.keys(dockerImages.value).length > 1);
const isCustomDockerImage = computed(() => {
  const currentImage = form.dockerImage;
  if (!currentImage) return false;
  return !Object.values(dockerImages.value).includes(currentImage);
});

function buildEnv(): Record<string, string> {
  const env = serverAsDetails.environment ?? {};
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    clean[k] = v === null || v === undefined ? '' : String(v);
  }
  return clean;
}

const form = reactive<FormSchema>({
  startup: props.server.startup ?? '',
  dockerImage: props.server.image ?? '',
  environment: buildEnv(),
});

const environmentVars = computed(() =>
  Object.entries(form.environment).map(
    ([key, value]) => ({ key, value: String(value) }) as EnvironmentEntry,
  ),
);

function updateEnvVar(key: string, value: EnvironmentInputValue) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  form.environment[key] = stringValue;
}

function removeEnvVar(key: string) {
  const { [key]: _, ...rest } = form.environment;
  form.environment = rest;
}

const newEnvKey = ref('');
const newEnvValue = ref('');

const canAddEnv = computed(
  () => newEnvKey.value.trim().length > 0 && newEnvValue.value.trim().length > 0,
);

function addEnvVar() {
  if (!canAddEnv.value) return;

  form.environment[newEnvKey.value] = newEnvValue.value;
  newEnvKey.value = '';
  newEnvValue.value = '';
}

async function handleSubmit(event: FormSubmitEvent<FormSchema>) {
  if (isSubmitting.value) {
    return;
  }

  isSubmitting.value = true;

  try {
    await $fetch(`/api/admin/servers/${props.server.id}/startup`, {
      method: 'patch',
      body: event.data,
    });

    Object.assign(form, event.data);

    toast.add({
      title: 'Startup updated',
      description: 'Server startup configuration has been saved',
      color: 'success',
    });
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to update startup configuration',
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="form"
    class="space-y-6"
    :disabled="isSubmitting"
    :validate-on="['input']"
    @submit="handleSubmit"
  >
    <UAlert icon="i-lucide-info" variant="subtle">
      <template #title>Startup Configuration</template>
      <template #description>
        Configure the startup command and environment variables for this server.
      </template>
    </UAlert>

    <div class="space-y-4">
      <UFormField label="Startup Command" name="startup" required>
        <UTextarea
          v-model="form.startup"
          placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
          :rows="4"
          class="w-full"
        />
        <template #help>
          Use &#123;&#123;VARIABLE&#125;&#125; syntax for environment variables
        </template>
      </UFormField>

      <UFormField label="Docker Image" name="dockerImage" required>
        <USelect
          v-if="hasMultipleDockerImages && !isCustomDockerImage"
          v-model="form.dockerImage"
          :items="
            Object.entries(dockerImages).map(([key, value]) => ({
              label: `${key} (${value})`,
              value,
            }))
          "
          value-key="value"
          placeholder="Select Docker image"
          class="w-full"
        />
        <UInput
          v-else
          v-model="form.dockerImage"
          placeholder="ghcr.io/pterodactyl/yolks:java-21"
          class="w-full"
        />
        <template #help>
          <span v-if="hasMultipleDockerImages && !isCustomDockerImage">
            Select a Docker image from the egg's available images.
          </span>
          <span v-else-if="!hasMultipleDockerImages">
            The Docker image to use for this server (from egg:
            {{ Object.keys(dockerImages)[0] || 'N/A' }})
          </span>
          <span v-else> Custom Docker image. Select from dropdown above to use an egg image. </span>
        </template>
      </UFormField>
    </div>

    <div class="space-y-4">
      <h3 class="text-sm font-semibold">Environment Variables</h3>

      <div
        v-if="environmentVars.length === 0"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon name="i-lucide-variable" class="mx-auto size-8 text-muted-foreground" />
        <p class="mt-2 text-sm text-muted-foreground">No environment variables defined</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="envVar in environmentVars"
          :key="envVar.key"
          class="flex items-center gap-2 rounded-lg border border-default p-3"
        >
          <div class="flex-1 grid gap-2 md:grid-cols-2">
            <div>
              <p class="text-xs text-muted-foreground">Key</p>
              <code class="text-sm font-medium">{{ envVar.key }}</code>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Value</p>
              <UInput
                :model-value="envVar.value"
                size="sm"
                class="w-full"
                @update:model-value="updateEnvVar(envVar.key, $event)"
              />
            </div>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            :disabled="isSubmitting"
            @click="removeEnvVar(envVar.key)"
          />
        </div>
      </div>

      <div class="flex gap-2">
        <UInput v-model="newEnvKey" placeholder="VARIABLE_NAME" size="sm" class="flex-1" />
        <UInput v-model="newEnvValue" placeholder="value" size="sm" class="flex-1" />
        <UButton
          icon="i-lucide-plus"
          color="primary"
          variant="soft"
          size="sm"
          :disabled="!canAddEnv || isSubmitting"
          @click="addEnvVar"
        >
          Add
        </UButton>
      </div>
    </div>

    <div class="flex justify-end">
      <UButton
        type="submit"
        color="primary"
        variant="subtle"
        :loading="isSubmitting"
        :disabled="isSubmitting"
      >
        Save Startup Configuration
      </UButton>
    </div>
  </UForm>
</template>
