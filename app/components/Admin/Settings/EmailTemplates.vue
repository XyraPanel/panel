<script setup lang="ts">
import { ref, computed } from 'vue';
import type { EditorToolbarItem } from '@nuxt/ui';

interface Template {
  id: string;
  name: string;
  description: string;
  variables: string[];
}

const toast = useToast();
const templates = ref<Template[]>([]);
const selectedTemplate = ref<Template | null>(null);
const templateContent = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const isPreviewing = ref(false);
const isResetting = ref(false);
const isPreviewMode = ref(false);
const previewHtml = ref('');
const previewData = ref<{ subject: string; variables: Record<string, string> } | null>(null);

const toolbarItems = computed<EditorToolbarItem[][]>(() => [
  [
    {
      kind: 'mark',
      mark: 'bold',
      icon: 'i-lucide-bold',
      tooltip: { text: 'Bold' },
    },
    {
      kind: 'mark',
      mark: 'italic',
      icon: 'i-lucide-italic',
      tooltip: { text: 'Italic' },
    },
    {
      kind: 'mark',
      mark: 'underline',
      icon: 'i-lucide-underline',
      tooltip: { text: 'Underline' },
    },
    {
      kind: 'mark',
      mark: 'code',
      icon: 'i-lucide-code',
      tooltip: { text: 'Code' },
    },
  ],
  [
    {
      icon: 'i-lucide-heading',
      tooltip: { text: 'Headings' },
      content: { align: 'start' },
      items: [
        {
          kind: 'heading',
          level: 1,
          icon: 'i-lucide-heading-1',
          label: 'Heading 1',
        },
        {
          kind: 'heading',
          level: 2,
          icon: 'i-lucide-heading-2',
          label: 'Heading 2',
        },
        {
          kind: 'heading',
          level: 3,
          icon: 'i-lucide-heading-3',
          label: 'Heading 3',
        },
      ],
    },
    {
      icon: 'i-lucide-list',
      tooltip: { text: 'Lists' },
      content: { align: 'start' },
      items: [
        {
          kind: 'bulletList',
          icon: 'i-lucide-list',
          label: 'Bullet List',
        },
        {
          kind: 'orderedList',
          icon: 'i-lucide-list-ordered',
          label: 'Ordered List',
        },
      ],
    },
    {
      kind: 'blockquote',
      icon: 'i-lucide-text-quote',
      tooltip: { text: 'Blockquote' },
    },
    {
      kind: 'codeBlock',
      icon: 'i-lucide-square-code',
      tooltip: { text: 'Code Block' },
    },
  ],
  [
    {
      kind: 'link',
      icon: 'i-lucide-link',
      tooltip: { text: 'Link' },
    },
  ],
]);

onMounted(async () => {
  await fetchTemplates();
});

async function fetchTemplates() {
  try {
    isLoading.value = true;
    const response = await $fetch<{ data: Template[] }>('/api/admin/settings/email-templates');
    templates.value = response.data;
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to load templates',
      color: 'error',
    });
  } finally {
    isLoading.value = false;
  }
}

async function selectTemplate(template: Template) {
  try {
    selectedTemplate.value = template;
    const response = await $fetch<{ data: { id: string; content: string; updatedAt: string } }>(
      `/api/admin/settings/email-templates/${template.id}`,
    );
    templateContent.value = response.data.content;
  } catch {
    toast.add({
      title: 'Error',
      description: `Failed to load template: ${template.name}`,
      color: 'error',
    });
  }
}

async function saveTemplate() {
  if (!selectedTemplate.value) return;

  try {
    isSaving.value = true;
    await $fetch(`/api/admin/settings/email-templates/${selectedTemplate.value.id}`, {
      method: 'PATCH',
      body: {
        content: templateContent.value,
      },
    });
    toast.add({
      title: 'Success',
      description: `Template "${selectedTemplate.value.name}" updated successfully`,
      color: 'success',
    });
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to save template',
      color: 'error',
    });
  } finally {
    isSaving.value = false;
  }
}

async function previewTemplate() {
  if (!selectedTemplate.value) return;

  try {
    isPreviewing.value = true;

    if (!previewData.value) {
      previewData.value = {
        subject: `Preview of ${selectedTemplate.value.name}`,
        variables: {},
      };

      for (const variable of selectedTemplate.value.variables) {
        if (!['appName', 'year'].includes(variable)) {
          previewData.value.variables[variable] = `{{ ${variable} }}`;
        }
      }
    }

    const response = await $fetch<{ data: { id: string; html: string; subject: string } }>(
      `/api/admin/settings/email-templates/${selectedTemplate.value.id}/preview`,
      {
        method: 'POST',
        body: {
          data: {
            subject: previewData.value.subject,
            ...previewData.value.variables,
          },
        },
      },
    );

    previewHtml.value = response.data.html || '';
    isPreviewMode.value = true;
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to preview template',
      color: 'error',
    });
  } finally {
    isPreviewing.value = false;
  }
}

async function resetTemplate() {
  if (!selectedTemplate.value) return;

  const confirmed = await new Promise<boolean>((resolve) => {
    toast.add({
      title: 'Confirm Reset',
      description: `Are you sure you want to reset "${selectedTemplate.value?.name}" to default?`,
      color: 'warning',
      actions: [
        {
          label: 'Reset',
          color: 'error',
          onClick: () => resolve(true),
        },
        {
          label: 'Cancel',
          color: 'neutral',
          variant: 'ghost',
          onClick: () => resolve(false),
        },
      ],
    });
  });

  if (!confirmed) return;

  try {
    isResetting.value = true;
    await $fetch(`/api/admin/settings/email-templates/${selectedTemplate.value.id}/reset`, {
      method: 'POST',
    });

    const response = await $fetch<{ data: { id: string; content: string; updatedAt: string } }>(
      `/api/admin/settings/email-templates/${selectedTemplate.value.id}`,
    );
    templateContent.value = response.data.content;

    toast.add({
      title: 'Success',
      description: `Template reset to default`,
      color: 'success',
    });
  } catch {
    toast.add({
      title: 'Error',
      description: 'Failed to reset template',
      color: 'error',
    });
  } finally {
    isResetting.value = false;
  }
}

function cancelEdit() {
  if (isPreviewMode.value) {
    isPreviewMode.value = false;
    previewData.value = null;
    previewHtml.value = '';
  } else {
    selectedTemplate.value = null;
    templateContent.value = '';
    previewData.value = null;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="animate-spin size-5" />
    </div>

    <div v-else-if="templates.length === 0" class="text-center py-8 text-muted-foreground">
      <p>No templates available</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div class="lg:col-span-1">
        <div class="space-y-2">
          <div
            v-for="template in templates"
            :key="template.id"
            :class="[
              'p-3 rounded-lg cursor-pointer transition-colors border-2',
              selectedTemplate?.id === template.id ? 'border-primary' : 'border-transparent',
            ]"
            @click="selectTemplate(template)"
          >
            <h3 class="font-semibold text-sm">{{ template.name }}</h3>
            <p class="text-xs text-muted-foreground mt-1">{{ template.description }}</p>
          </div>
        </div>
      </div>

      <div class="lg:col-span-3">
        <div v-if="selectedTemplate" class="space-y-4">
          <div v-if="isPreviewMode" class="space-y-4">
            <div>
              <label class="block text-sm font-semibold mb-2">Rendered Preview</label>
              <iframe
                :srcDoc="previewHtml"
                class="w-full h-96 border border-default rounded-lg"
                title="Email preview"
              />
            </div>

            <div class="flex justify-end gap-2">
              <UButton color="error" variant="ghost" @click="cancelEdit"> Back to Editor </UButton>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div class="space-y-2">
              <h3 class="font-semibold text-sm">Available Variables</h3>
              <div class="bg-muted/50 rounded-lg p-3 border border-default">
                <code class="text-xs font-mono text-foreground block space-y-1">
                  <div
                    v-for="variable in selectedTemplate.variables"
                    :key="variable"
                    class="text-primary"
                  >
                    {{ variable }}
                  </div>
                </code>
              </div>
              <p class="text-xs text-muted-foreground">
                Use
                <code class="bg-muted px-1.5 py-0.5 rounded"
                  >&#123;&#123; variableName &#125;&#125;</code
                >
                syntax in your template
              </p>
            </div>

            <div>
              <label class="block text-sm font-semibold mb-2">Template HTML</label>
              <UEditor
                v-slot="{ editor }"
                v-model="templateContent"
                content-type="html"
                placeholder="Enter HTML template..."
                class="w-full border border-default rounded-lg overflow-hidden"
                :ui="{ base: 'p-4 min-h-80' }"
              >
                <UEditorToolbar
                  :editor="editor"
                  :items="toolbarItems"
                  class="border-b border-default bg-muted/50 py-2 px-3 overflow-x-auto"
                />
              </UEditor>
              <p class="text-xs text-muted-foreground mt-2">
                Use
                <code class="bg-muted px-1.5 py-0.5 rounded">\{\{ variableName \}\}</code> syntax
                for dynamic content
              </p>
            </div>

            <div class="flex justify-end gap-2">
              <UButton color="error" variant="ghost" @click="cancelEdit"> Cancel </UButton>
              <UButton :loading="isResetting" color="warning" variant="soft" @click="resetTemplate">
                Reset to Default
              </UButton>
              <UButton :loading="isPreviewing" color="info" variant="soft" @click="previewTemplate">
                Preview
              </UButton>
              <UButton :loading="isSaving" color="primary" variant="subtle" @click="saveTemplate">
                Save Changes
              </UButton>
            </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center py-12 text-muted-foreground">
          <p>Select a template to edit</p>
        </div>
      </div>
    </div>
  </div>
</template>
