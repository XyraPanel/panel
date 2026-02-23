<script setup lang="ts">
import { z } from 'zod';
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui';
import type { Allocation } from '#shared/types/server';
import type { AdminNodeAllocationsResponse } from '#shared/types/admin';
import { nodeAllocationsCreateSchema } from '#shared/schema/admin/infrastructure';

const props = defineProps<{
  nodeId: string;
}>();

const { t } = useI18n();
const toast = useToast();
const page = ref(1);
const filter = ref<'all' | 'assigned' | 'unassigned'>('all');
const isCreating = ref(false);

const { data: paginationSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/settings/pagination',
  {
    key: 'settings-pagination',
    default: () => ({ paginationLimit: 25 }),
  },
);
const pageSize = computed(() => paginationSettings.value?.paginationLimit ?? 25);

const {
  data: allocationsData,
  pending,
  refresh,
} = await useAsyncData<AdminNodeAllocationsResponse>(
  () => `admin-node-allocations-${props.nodeId}`,
  () =>
    (
      $fetch as (
        input: string,
        init?: Record<string, unknown>,
      ) => Promise<AdminNodeAllocationsResponse>
    )(`/api/admin/nodes/${props.nodeId}/allocations`),
  {
    default: () => ({ data: [] }),
    watch: [() => props.nodeId],
  },
);

const allocations = computed<Allocation[]>(() => allocationsData.value?.data ?? []);

const filteredAllocations = computed(() => {
  if (filter.value === 'assigned') {
    return allocations.value.filter((a: Allocation) => a.serverId !== null);
  }
  if (filter.value === 'unassigned') {
    return allocations.value.filter((a: Allocation) => a.serverId === null);
  }
  return allocations.value;
});

const paginatedAllocations = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredAllocations.value.slice(start, end);
});

const _totalPages = computed(() => Math.ceil(filteredAllocations.value.length / pageSize.value));

const createSchema = nodeAllocationsCreateSchema
  .extend({
    ip: z.string().trim().min(1, t('admin.nodes.allocations.ipAddressOrCidrRequired')),
    ports: z.string().trim().min(1, t('admin.nodes.allocations.provideAtLeastOnePort')),
    ipAlias: z.string().trim().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (typeof data.ip === 'string') {
      const value = data.ip.trim();
      const parts = value.split('/');
      const ipv4Regex =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

      if (parts.length === 1) {
        if (!ipv4Regex.test(value)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ip'],
            message: t('admin.nodes.allocations.invalidIpAddressOrCidr'),
          });
        }
      } else if (parts.length === 2) {
        const [base, prefixRaw] = parts;
        const prefix = Number.parseInt(prefixRaw!, 10);
        if (!ipv4Regex.test(base!) || !Number.isFinite(prefix) || prefix < 25 || prefix > 32) {
          ctx.addIssue({
            code: 'custom',
            path: ['ip'],
            message: t('admin.nodes.allocations.invalidIpAddressOrCidr'),
          });
        }
      } else {
        ctx.addIssue({
          code: 'custom',
          path: ['ip'],
          message: t('admin.nodes.allocations.invalidIpAddressOrCidr'),
        });
      }
    }
  });

type CreateFormSchema = z.infer<typeof createSchema>;

const showCreateModal = ref(false);
const createForm = reactive<CreateFormSchema>({
  ip: '',
  ports: '',
  ipAlias: '',
});

function parsePorts(input: string): number[] {
  const normalized = input.replace(/\s+/g, '');
  if (normalized.includes('-')) {
    const [startRaw, endRaw] = normalized.split('-', 2);
    if (!startRaw || !endRaw) {
      throw new Error(t('admin.nodes.allocations.invalidPortRangeFormat'));
    }
    const start = Number.parseInt(startRaw, 10);
    const end = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end)
      throw new Error(t('admin.nodes.allocations.provideValidPortRange'));
    const ports: number[] = [];
    for (let port = start; port <= end; port++) {
      ports.push(port);
    }
    return ports;
  }

  const segments = normalized.split(',');
  const ports = segments.map((segment) => {
    const port = Number.parseInt(segment, 10);
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(t('admin.nodes.allocations.portsMustBePositiveIntegers'));
    return port;
  });

  return ports;
}

async function createAllocations(event: FormSubmitEvent<CreateFormSchema>) {
  if (isCreating.value) return;

  isCreating.value = true;

  try {
    const ports = parsePorts(event.data.ports);
    const isCidr = event.data.ip.includes('/');
    const estimatedCount = isCidr
      ? Math.pow(2, 32 - Number.parseInt(event.data.ip.split('/')[1]!, 10)) * ports.length
      : ports.length;

    if (estimatedCount > 10000) {
      const formattedCount = new Intl.NumberFormat().format(estimatedCount);
      if (!confirm(t('admin.nodes.confirmCreateManyAllocations', { count: formattedCount }))) {
        isCreating.value = false;
        return;
      }
    }

    await ($fetch as (input: string, init?: Record<string, unknown>) => Promise<unknown>)(
      `/api/admin/nodes/${props.nodeId}/allocations`,
      {
        method: 'POST',
        body: {
          ip: event.data.ip,
          ports,
          ipAlias: event.data.ipAlias ? event.data.ipAlias : undefined,
        },
      },
    );

    toast.add({
      title: t('admin.nodes.allocationsCreated'),
      description: t('admin.nodes.allocationsCreatedDescription', {
        ip: event.data.ip,
        count: ports.length,
      }),
      color: 'success',
    });

    showCreateModal.value = false;
    Object.assign(createForm, { ip: '', ports: '', ipAlias: '' });

    await refresh();
  } catch (error) {
    const err = error as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description:
        err.data?.message ||
        (error instanceof Error ? error.message : t('admin.nodes.failedToCreateAllocations')),
      color: 'error',
    });
  } finally {
    isCreating.value = false;
  }
}

const updatingAlias = ref<string | null>(null);

function handleAliasBlur(allocation: Allocation, event: Event) {
  const target = event.target as HTMLInputElement;
  const newAlias = target?.value || '';
  updateAlias(allocation, newAlias);
}

async function updateAlias(allocation: Allocation, newAlias: string) {
  updatingAlias.value = allocation.id;
  try {
    await ($fetch as (input: string, init?: Record<string, unknown>) => Promise<unknown>)(
      `/api/admin/allocations/${allocation.id}`,
      {
        method: 'patch',
        body: { ipAlias: newAlias || null },
      },
    );

    toast.add({
      title: t('admin.nodes.allocations.aliasUpdated'),
      color: 'success',
    });

    await refresh();
  } catch {
    toast.add({
      title: t('common.error'),
      description: t('admin.nodes.allocations.failedToUpdateAlias'),
      color: 'error',
    });
  } finally {
    updatingAlias.value = null;
  }
}

async function deleteAllocation(allocation: Allocation) {
  if (
    !confirm(t('admin.nodes.confirmDeleteAllocation', { ip: allocation.ip, port: allocation.port }))
  ) {
    return;
  }

  try {
    await ($fetch as (input: string, init?: Record<string, unknown>) => Promise<unknown>)(
      `/api/admin/allocations/${allocation.id}`,
      {
        method: 'DELETE',
      },
    );

    toast.add({
      title: t('admin.nodes.allocationDeleted'),
      color: 'success',
    });

    await refresh();
  } catch (err) {
    const error = err as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: error.data?.message || t('admin.nodes.failedToDeleteAllocation'),
      color: 'error',
    });
  }
}

const columns: TableColumn<Allocation>[] = [
  { accessorKey: 'ip', header: t('admin.nodes.ip') },
  { accessorKey: 'ipAlias', header: t('admin.nodes.allocations.ipAlias') },
  { accessorKey: 'port', header: t('admin.nodes.port') },
  { accessorKey: 'server', header: t('admin.nodes.allocations.assignedTo') },
  { id: 'actions', header: '' },
];

const assignedCount = computed(() => allocations.value.filter((a) => a.serverId !== null).length);
const unassignedCount = computed(() => allocations.value.filter((a) => a.serverId === null).length);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex gap-2">
        <UButton
          :color="filter === 'all' ? 'primary' : 'neutral'"
          variant="soft"
          @click="filter = 'all'"
        >
          {{ t('common.all') }} ({{ allocations.length }})
        </UButton>
        <UButton
          :color="filter === 'assigned' ? 'primary' : 'neutral'"
          variant="soft"
          @click="filter = 'assigned'"
        >
          {{ t('admin.nodes.allocations.assigned') }} ({{ assignedCount }})
        </UButton>
        <UButton
          :color="filter === 'unassigned' ? 'primary' : 'neutral'"
          variant="soft"
          @click="filter = 'unassigned'"
        >
          {{ t('admin.nodes.allocations.unassigned') }} ({{ unassignedCount }})
        </UButton>
      </div>

      <UButton
        icon="i-lucide-plus"
        color="primary"
        variant="subtle"
        @click="showCreateModal = true"
      >
        {{ t('admin.nodes.createAllocations') }}
      </UButton>
    </div>

    <UCard>
      <UTable :rows="paginatedAllocations" :columns="columns" :loading="pending">
        <template #ip-data="{ row }">
          <code class="text-sm">{{ (row as unknown as Allocation).ip }}</code>
        </template>

        <template #ipAlias-data="{ row }">
          <UInput
            :model-value="(row as unknown as Allocation).ipAlias || ''"
            :placeholder="t('common.none')"
            size="sm"
            :loading="updatingAlias === (row as unknown as Allocation).id"
            @blur="handleAliasBlur(row as unknown as Allocation, $event)"
          />
        </template>

        <template #port-data="{ row }">
          <code class="text-sm">{{ (row as unknown as Allocation).port }}</code>
        </template>

        <template #server-data="{ row }">
          <NuxtLink
            v-if="(row as unknown as Allocation).serverId"
            :to="`/admin/servers/${(row as unknown as Allocation).serverId}`"
            class="text-primary hover:underline"
          >
            {{ t('common.server') }}
          </NuxtLink>
          <span v-else class="text-sm text-muted-foreground">-</span>
        </template>

        <template #actions-data="{ row }">
          <UButton
            v-if="!(row as unknown as Allocation).serverId"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            @click="deleteAllocation(row as unknown as Allocation)"
          />
        </template>
      </UTable>

      <template #footer>
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            {{
              t('admin.nodes.allocations.showingAllocations', {
                start: (page - 1) * pageSize + 1,
                end: Math.min(page * pageSize, filteredAllocations.length),
                total: filteredAllocations.length,
              })
            }}
          </div>
          <UPagination v-model="page" :total="filteredAllocations.length" :page-size="pageSize" />
        </div>
      </template>
    </UCard>

    <UModal v-model="showCreateModal">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">{{ t('admin.nodes.createAllocations') }}</h3>
        </template>

        <UForm
          id="create-allocation-form"
          :schema="createSchema"
          :state="createForm"
          class="space-y-4"
          :disabled="isCreating"
          :validate-on="['input']"
          @submit="createAllocations"
        >
          <UAlert icon="i-lucide-info">
            <template #title>{{ t('admin.nodes.bulkCreation') }}</template>
            <template #description>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>{{ t('admin.nodes.bulkCreationIpAddresses') }}</li>
                <li>{{ t('admin.nodes.bulkCreationPorts') }}</li>
                <li>{{ t('admin.nodes.bulkCreationCidrRange') }}</li>
              </ul>
            </template>
          </UAlert>

          <UFormField :label="t('admin.nodes.allocations.ipAddressOrCidr')" name="ip" required>
            <UInput
              v-model="createForm.ip"
              :placeholder="t('admin.nodes.ipAddressOrCidrPlaceholder')"
            />
            <template #help>
              {{ t('admin.nodes.ipAddressOrCidrHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.nodes.allocations.ports')" name="ports" required>
            <UInput v-model="createForm.ports" :placeholder="t('admin.nodes.portsPlaceholder')" />
            <template #help>
              {{ t('admin.nodes.portsHelp') }}
            </template>
          </UFormField>

          <UFormField :label="t('admin.nodes.allocations.ipAlias')" name="ipAlias">
            <UInput
              v-model="createForm.ipAlias"
              :placeholder="t('admin.nodes.ipAliasPlaceholder')"
            />
            <template #help>
              {{ t('admin.nodes.ipAliasHelp') }}
            </template>
          </UFormField>
        </UForm>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" :disabled="isCreating" @click="showCreateModal = false">
              {{ t('common.cancel') }}
            </UButton>
            <UButton
              type="submit"
              form="create-allocation-form"
              color="primary"
              :loading="isCreating"
              :disabled="isCreating"
            >
              {{ t('admin.nodes.createAllocations') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
