<script setup lang="ts">
import type { ServerFileListItem } from '#shared/types/server';

const props = defineProps<{
  currentEntries: ServerFileListItem[];
  directoryPending: boolean;
  directoryError: Error | null;
  canNavigateUp: boolean;
  parentDirectoryLabel: string;
  onNavigateUp: () => void;
  allSelected: boolean;
  indeterminateSelection: boolean;
  toggleSelectAllEntries: (value: boolean) => void;
  isEntrySelected: (entry: ServerFileListItem) => boolean;
  toggleEntrySelection: (entry: ServerFileListItem, value: boolean) => void;
  handleEntryClick: (entry: ServerFileListItem) => void;
  availableFileActions: (
    entry: ServerFileListItem | null,
  ) => Array<{ label: string; icon: string; onClick: () => void }>;
  hasSelection: boolean;
  selectionLabel: string;
  canCopySelection: boolean;
  canMoveSelection: boolean;
  canArchiveSelection: boolean;
  canUnarchiveSelection: boolean;
  canDeleteSelection: boolean;
  copyStatusActive: boolean;
  moveStatusActive: boolean;
  compressStatusActive: boolean;
  decompressStatusActive: boolean;
  deleteStatusActive: boolean;
  directoryDisabled: boolean;
  handleBulkCopy: () => void;
  openBulkMoveModalWithDefaults: () => void;
  handleBulkArchive: () => void;
  handleBulkUnarchive: () => void;
  openBulkDeleteModal: () => void;
  clearSelection: () => void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <div v-if="props.canNavigateUp" class="flex justify-end">
      <UButton
        icon="i-lucide-corner-up-left"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="props.onNavigateUp()"
      >
        {{ t('server.files.upTo', { directory: props.parentDirectoryLabel }) }}
      </UButton>
    </div>

    <UAlert v-if="props.directoryError" color="error" icon="i-lucide-alert-circle">
      {{ props.directoryError.message }}
    </UAlert>

    <div class="flex flex-col rounded-md border border-default h-full">
      <div
        class="grid grid-cols-[auto_minmax(0,1.5fr)_110px_140px_64px] items-center gap-3 border-b border-default bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0"
      >
        <UCheckbox
          :model-value="props.allSelected"
          :indeterminate="props.indeterminateSelection"
          :disabled="props.currentEntries.length === 0"
          :aria-label="t('server.files.selectAllEntries')"
          @update:model-value="props.toggleSelectAllEntries($event as boolean)"
        />
        <span class="truncate">{{ t('common.name') }}</span>
        <span>{{ t('server.files.file') }}</span>
        <span class="text-right">{{ t('server.files.modified') }}</span>
        <span class="text-right">{{ t('common.actions') }}</span>
      </div>

      <div
        class="overflow-y-auto flex-1"
        tabindex="0"
        role="region"
        :aria-label="t('server.files.title')"
      >
        <div v-if="props.directoryPending" class="space-y-2 p-3 text-xs text-muted-foreground">
          <div v-for="index in 5" :key="index" class="h-5 animate-pulse rounded bg-muted/60" />
        </div>

        <div
          v-else-if="props.currentEntries.length === 0"
          class="px-3 py-4 text-xs text-muted-foreground"
        >
          {{ t('server.files.noFilesDescription') }}
        </div>

        <template v-else>
          <div
            v-for="entry in props.currentEntries"
            :key="entry.path"
            class="grid w-full grid-cols-[auto_minmax(0,1.5fr)_110px_140px_64px] items-center gap-3 px-3 py-2 text-sm transition hover:bg-muted"
            :class="{
              'border-l-2 border-primary bg-primary/10 text-foreground':
                props.isEntrySelected(entry),
              'text-muted-foreground': !props.isEntrySelected(entry),
            }"
          >
            <UCheckbox
              :model-value="props.isEntrySelected(entry)"
              :aria-label="t('server.files.selectEntry')"
              @update:model-value="props.toggleEntrySelection(entry, $event as boolean)"
            />

            <button
              class="flex items-center gap-2 truncate text-left"
              type="button"
              @click="props.handleEntryClick(entry)"
            >
              <UIcon
                :name="entry.type === 'directory' ? 'i-lucide-folder' : 'i-lucide-file-text'"
                class="size-4 text-primary"
              />
              <span class="truncate">{{ entry.name }}</span>
            </button>

            <span
              class="text-xs uppercase"
              :class="entry.type === 'directory' ? 'text-primary' : 'text-muted-foreground'"
            >
              {{ entry.type }}
            </span>

            <span class="truncate text-right text-xs text-muted-foreground">
              <NuxtTime v-if="entry.modified" :datetime="entry.modified" />
              <span v-else>Unknown</span>
            </span>

            <UDropdownMenu
              :items="
                props.availableFileActions(entry).map((action) => ({
                  label: action.label,
                  icon: action.icon,
                  onSelect: action.onClick,
                  color: action.label.includes('Delete') ? 'error' : undefined,
                }))
              "
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                variant="ghost"
                size="xs"
                color="neutral"
              />
            </UDropdownMenu>
          </div>
        </template>
      </div>
    </div>

    <Transition name="fade">
      <div
        v-if="props.hasSelection"
        class="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-default bg-background/95 px-4 py-3 text-sm"
      >
        <div class="flex items-center gap-3 text-sm font-medium">
          <UIcon name="i-lucide-check-square" class="size-4 text-primary" />
          <span>{{ props.selectionLabel }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            icon="i-lucide-copy"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!props.canCopySelection || props.copyStatusActive || props.directoryDisabled"
            @click="props.handleBulkCopy"
          >
            {{ t('common.copy') }}
          </UButton>

          <UButton
            icon="i-lucide-move"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="!props.canMoveSelection || props.moveStatusActive || props.directoryDisabled"
            @click="props.openBulkMoveModalWithDefaults"
          >
            {{ t('server.files.move') }}
          </UButton>

          <UButton
            icon="i-lucide-archive"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="
              !props.canArchiveSelection || props.compressStatusActive || props.directoryDisabled
            "
            @click="props.handleBulkArchive"
          >
            {{ t('server.files.archive') }}
          </UButton>

          <UButton
            icon="i-lucide-box"
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="
              !props.canUnarchiveSelection ||
              props.decompressStatusActive ||
              props.directoryDisabled
            "
            @click="props.handleBulkUnarchive"
          >
            {{ t('server.files.extract') }}
          </UButton>

          <UButton
            icon="i-lucide-trash"
            size="xs"
            variant="soft"
            color="error"
            :disabled="
              !props.canDeleteSelection || props.deleteStatusActive || props.directoryDisabled
            "
            @click="props.openBulkDeleteModal"
          >
            {{ t('common.delete') }}
          </UButton>

          <UButton
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            color="neutral"
            :disabled="props.directoryDisabled"
            @click="props.clearSelection"
          >
            {{ t('common.clear') }}
          </UButton>
        </div>
      </div>
    </Transition>
  </div>
</template>
