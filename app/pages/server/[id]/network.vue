<script setup lang="ts">
import type { ServerAllocation, NetworkData } from '#shared/types/server';

const route = useRoute();
const { t } = useI18n();
const toast = useToast();
const requestFetch = useRequestFetch();

definePageMeta({
  auth: true,
});

const serverId = computed(() => route.params.id as string);

const {
  data: networkData,
  pending,
  error,
  refresh,
} = await useAsyncData(
  `server-${serverId.value}-network`,
  () => requestFetch<{ data: NetworkData }>(`/api/client/servers/${serverId.value}/network`),
  {
    watch: [serverId],
  },
);

const primaryAllocation = computed(() => networkData.value?.data.primary);
const additionalAllocations = computed(() => networkData.value?.data.allocations || []);
const allocationLimit = computed(() => networkData.value?.data.allocation_limit);
const canCreateAllocation = computed(() => {
  if (!allocationLimit.value) return false;
  const totalAllocations =
    (additionalAllocations.value?.length || 0) + (primaryAllocation.value ? 1 : 0);
  return totalAllocations < allocationLimit.value;
});

const isCreatingAllocation = ref(false);
const settingPrimaryId = ref<string | null>(null);

function formatIp(allocation: ServerAllocation): string {
  return allocation.ipAlias || allocation.ip;
}

async function setPrimaryAllocation(allocation: ServerAllocation) {
  settingPrimaryId.value = allocation.id;
  try {
    await $fetch(
      `/api/client/servers/${serverId.value}/network/allocations/${allocation.id}/primary`,
      {
        method: 'POST',
      },
    );
    toast.add({
      title: t('server.network.primaryUpdated'),
      description: t('server.network.primaryUpdatedDescription', {
        ip: formatIp(allocation),
        port: allocation.port,
      }),
      color: 'success',
    });
    await refresh();
  } catch (err) {
    const error = err as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: error.data?.message || t('server.network.failedToSetPrimary'),
      color: 'error',
    });
  } finally {
    settingPrimaryId.value = null;
  }
}

async function createAllocation() {
  isCreatingAllocation.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/network/allocations`, {
      method: 'POST',
    });
    toast.add({
      title: t('server.network.allocationCreated'),
      description: t('server.network.allocationCreatedDescription'),
      color: 'success',
    });
    await refresh();
  } catch (err) {
    const error = err as { data?: { message?: string } };
    toast.add({
      title: t('common.error'),
      description: error.data?.message || t('server.network.failedToCreateAllocation'),
      color: 'error',
    });
  } finally {
    isCreatingAllocation.value = false;
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
                <p class="font-medium">{{ t('server.network.failedToLoadNetworkData') }}</p>
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
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-semibold">
                      {{ t('server.network.primaryAllocation') }}
                    </h2>
                    <p class="text-xs text-muted-foreground">
                      {{ t('server.network.mainServerConnectionEndpoint') }}
                    </p>
                  </div>
                </div>
              </template>

              <ServerEmptyState
                v-if="!primaryAllocation"
                icon="i-lucide-network"
                :title="t('server.network.noPrimaryAllocation')"
                :description="t('server.network.noPrimaryAllocationDescription')"
              />

              <div v-else class="flex flex-col gap-4 lg:flex-row">
                <div class="flex-1 space-y-3">
                  <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ t('server.network.ipAddress') }}
                    </p>
                    <div class="mt-1 flex items-center justify-between gap-2">
                      <p class="text-lg font-semibold text-foreground">
                        {{ formatIp(primaryAllocation) }}
                      </p>
                      <ServerCopyButton
                        :text="formatIp(primaryAllocation)"
                        :label="t('server.network.ipAddress')"
                      />
                    </div>
                  </div>
                  <div class="rounded-md border border-default bg-muted/30 px-4 py-3">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ t('server.network.port') }}
                    </p>
                    <div class="mt-1 flex items-center justify-between gap-2">
                      <p class="text-lg font-semibold text-foreground">
                        {{ primaryAllocation.port }}
                      </p>
                      <ServerCopyButton
                        :text="String(primaryAllocation.port)"
                        :label="t('server.network.port')"
                      />
                    </div>
                  </div>
                </div>
                <div class="flex-1 space-y-3">
                  <UAlert
                    :title="t('server.network.connectionString')"
                    icon="i-lucide-info"
                    variant="subtle"
                  >
                    <template #description>
                      <div class="flex items-center justify-between gap-2">
                        <code class="text-xs"
                          >{{ formatIp(primaryAllocation) }}:{{ primaryAllocation.port }}</code
                        >
                        <ServerCopyButton
                          :text="`${formatIp(primaryAllocation)}:${primaryAllocation.port}`"
                          :label="t('server.network.connectionStringLabel')"
                        />
                      </div>
                    </template>
                  </UAlert>
                  <div
                    v-if="primaryAllocation.notes"
                    class="rounded-md border border-dashed border-default px-4 py-3 text-xs text-muted-foreground"
                  >
                    {{ primaryAllocation.notes }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">
                    {{ t('server.network.additionalAllocations') }}
                  </h2>
                  <UButton
                    v-if="canCreateAllocation"
                    :loading="isCreatingAllocation"
                    size="sm"
                    @click="createAllocation"
                  >
                    <UIcon name="i-lucide-plus" class="size-4" />
                    {{ t('server.network.createAllocation') }}
                  </UButton>
                </div>
              </template>

              <div
                v-if="additionalAllocations.length === 0"
                class="rounded-lg border border-dashed border-default p-8 text-center"
              >
                <UIcon name="i-lucide-network" class="mx-auto size-12 text-muted-foreground/50" />
                <p class="mt-3 text-sm font-medium">
                  {{ t('server.network.noAdditionalAllocations') }}
                </p>
                <p
                  v-if="!canCreateAllocation && allocationLimit"
                  class="mt-1 text-xs text-muted-foreground"
                >
                  {{ t('server.network.allocationLimitReached') }}
                </p>
                <p v-else-if="!allocationLimit" class="mt-1 text-xs text-muted-foreground">
                  {{ t('server.network.requestAdditionalPorts') }}
                </p>
              </div>

              <div v-else class="overflow-hidden rounded-lg border border-default">
                <div
                  class="grid grid-cols-12 bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <span class="col-span-4">{{ t('server.network.ip') }}</span>
                  <span class="col-span-2">{{ t('server.network.port') }}</span>
                  <span class="col-span-3">{{ t('common.notes') }}</span>
                  <span class="col-span-3 text-right">{{ t('common.actions') }}</span>
                </div>
                <div class="divide-y divide-default">
                  <div
                    v-for="allocation in additionalAllocations"
                    :key="allocation.id"
                    class="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
                  >
                    <span class="col-span-4 font-medium">{{ formatIp(allocation) }}</span>
                    <span class="col-span-2 text-muted-foreground">{{ allocation.port }}</span>
                    <span class="col-span-3 text-xs text-muted-foreground">{{
                      allocation.notes || t('common.na')
                    }}</span>
                    <div class="col-span-3 flex justify-end">
                      <UButton
                        size="xs"
                        variant="subtle"
                        color="primary"
                        icon="i-lucide-arrow-up-to-line"
                        :loading="settingPrimaryId === allocation.id"
                        :disabled="settingPrimaryId !== null"
                        @click="setPrimaryAllocation(allocation)"
                      >
                        {{ t('server.network.makePrimary') }}
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </template>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
