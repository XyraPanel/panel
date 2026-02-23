<script setup lang="ts">
import type { WingsNodeConfiguration } from '#shared/types/wings';

const props = defineProps<{
  nodeId: string;
}>();

const toast = useToast();
const requestFetch = useRequestFetch();
const isGenerating = ref(false);
const showConfig = ref(false);

const {
  data: configData,
  pending: configPending,
  refresh,
} = await useAsyncData<WingsNodeConfiguration | null>(
  `node-config-${props.nodeId}`,
  async () => {
    try {
      const response = await requestFetch<{ data: WingsNodeConfiguration }>(
        `/api/admin/wings/nodes/${props.nodeId}/configuration`,
      );
      return response.data;
    } catch {
      return null;
    }
  },
  {
    default: () => null,
  },
);

const configuration = computed(() => configData.value);

watch(configuration, (value) => {
  if (value) showConfig.value = true;
});

async function generateToken() {
  if (
    !confirm(
      'Generate a new deployment token? The previous token will be invalidated and Wings will need to be reconfigured.',
    )
  ) {
    return;
  }

  isGenerating.value = true;

  try {
    await $fetch(`/api/admin/wings/nodes/${props.nodeId}/token`, {
      method: 'POST',
    });

    toast.add({
      title: 'Token generated',
      description: 'A new deployment token has been generated. Save the configuration below.',
      color: 'success',
    });

    await refresh();
    showConfig.value = true;
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: 'Error',
      description: err.data?.message || 'Failed to generate token',
      color: 'error',
    });
  } finally {
    isGenerating.value = false;
  }
}

async function copyToClipboard(text: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.add({
        title: 'Copied',
        description: 'Configuration copied to clipboard',
        color: 'success',
      });
    } else {
      throw new Error('Clipboard API not available');
    }
  } catch (error) {
    toast.add({
      title: 'Copy failed',
      description: error instanceof Error ? error.message : 'Unable to copy to clipboard',
      color: 'error',
    });
  }
}

async function downloadConfigFile() {
  if (!configuration.value) {
    toast.add({
      title: 'Nothing to download',
      description: 'Generate a token to create a configuration file first.',
      color: 'error',
    });
    return;
  }

  if (typeof window === 'undefined') return;

  const blob = new Blob([configYaml.value], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'config.yml';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.add({
    title: 'Download started',
    description: 'Saved as config.yml',
    color: 'success',
  });
}

const configYaml = computed(() => {
  const value = configuration.value as WingsNodeConfiguration | null;
  if (!value) return '';

  const allowedMounts = value.allowed_mounts ?? [];
  const allowedMountLines =
    Array.isArray(allowedMounts) && allowedMounts.length > 0
      ? allowedMounts.map((mount: string) => `  - ${mount}`)
      : ['  []'];

  return [
    `debug: ${value.debug}`,
    `uuid: ${value.uuid}`,
    `token_id: ${value.token_id}`,
    `token: ${value.token}`,
    'api:',
    `  host: ${value.api.host}`,
    `  port: ${value.api.port}`,
    '  ssl:',
    `    enabled: ${value.api.ssl.enabled}`,
    `    cert: ${value.api.ssl.cert}`,
    `    key: ${value.api.ssl.key}`,
    `  upload_limit: ${value.api.upload_limit}`,
    'system:',
    `  data: ${value.system.data}`,
    '  sftp:',
    `    bind_port: ${value.system.sftp.bind_port}`,
    'allowed_mounts:',
    ...allowedMountLines,
    `remote: ${value.remote ?? ''}`,
  ].join('\n');
});
</script>

<template>
  <div class="space-y-6">
    <UAlert icon="i-lucide-info" variant="subtle">
      <template #title>Auto-Deploy Configuration</template>
      <template #description>
        Generate a configuration file for Wings to automatically connect to this panel. This token
        is valid for one-time use and will be invalidated after the node connects.
      </template>
    </UAlert>

    <div class="flex items-center justify-between rounded-lg border border-default p-4">
      <div class="space-y-1">
        <div class="text-sm font-medium">Generate Deployment Token</div>
        <div class="text-xs text-muted-foreground">
          Create a new auto-deploy configuration for Wings
        </div>
      </div>
      <UButton
        icon="i-lucide-key"
        color="primary"
        variant="subtle"
        :loading="isGenerating"
        :disabled="configPending"
        @click="generateToken"
      >
        Generate Token
      </UButton>
    </div>

    <div v-if="configPending" class="space-y-4">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-48 w-full" />
    </div>

    <div v-else-if="configuration && showConfig" class="space-y-4">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">Configuration File (config.yml)</label>
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-copy"
              variant="soft"
              size="sm"
              @click="copyToClipboard(configYaml)"
            >
              Copy
            </UButton>
            <UButton icon="i-lucide-download" variant="soft" size="sm" @click="downloadConfigFile">
              Download
            </UButton>
          </div>
        </div>
        <div class="rounded-lg border border-default bg-muted/30 p-4">
          <pre class="overflow-x-auto text-xs"><code>{{ configYaml }}</code></pre>
        </div>
      </div>

      <UAlert color="warning" variant="subtle" icon="i-lucide-alert-triangle">
        <template #title>Save this configuration now!</template>
        <template #description>
          This token will only be shown once. Save it to your Wings config.yml file before closing
          this page.
        </template>
      </UAlert>

      <div class="space-y-2">
        <label class="text-sm font-medium">Installation Steps</label>
        <ol class="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Copy the configuration above</li>
          <li>
            Save it to
            <code class="rounded bg-muted px-1 py-0.5">/etc/pterodactyl/config.yml</code> on your
            Wings server
          </li>
          <li>
            Restart Wings: <code class="rounded bg-muted px-1 py-0.5">systemctl restart wings</code>
          </li>
          <li>Wings will automatically connect to the panel</li>
        </ol>
      </div>
    </div>

    <div v-else class="rounded-lg border border-default p-8 text-center">
      <UIcon name="i-lucide-file-code" class="mx-auto size-8 text-muted-foreground" />
      <p class="mt-2 text-sm text-muted-foreground">
        No configuration available. Generate a token to get started.
      </p>
    </div>
  </div>
</template>
