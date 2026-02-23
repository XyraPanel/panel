<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AdminUserServerSummary, PaginatedServersResponse } from '#shared/types/admin';

interface Props {
  userId: string;
  itemsPerPage: number;
}

const props = defineProps<Props>();

const serversPage = ref(1);

const { data: serversData } = await useFetch<PaginatedServersResponse>(
  () => `/api/admin/users/${props.userId}/servers`,
  {
    key: `admin-user-servers-${props.userId}`,
    query: computed(() => ({
      page: serversPage.value,
      limit: props.itemsPerPage,
    })),
    default: () => ({
      data: [],
      pagination: { page: 1, perPage: props.itemsPerPage, total: 0, totalPages: 0 },
    }),
    watch: [serversPage, () => props.itemsPerPage],
  },
);

const servers = computed<AdminUserServerSummary[]>(() => serversData.value?.data ?? []);
const serversPagination = computed(() => serversData.value?.pagination);
</script>

<template>
  <UCard :ui="{ body: 'space-y-3' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Servers</h2>
        <UBadge color="neutral" variant="soft" size="xs"
          >{{ serversPagination?.total ?? 0 }} total</UBadge
        >
      </div>
    </template>

    <UCard
      v-if="servers.length === 0"
      variant="subtle"
      :ui="{ body: 'px-4 py-6 text-center space-y-2 text-sm text-muted-foreground' }"
    >
      This user does not own any servers.
    </UCard>
    <div v-else class="space-y-3">
      <div class="overflow-hidden rounded-md border border-default">
        <table class="min-w-full divide-y divide-default text-sm">
          <thead class="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left">Server</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Node</th>
              <th class="px-3 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="server in servers" :key="server.id">
              <td class="px-3 py-2">
                <div class="flex flex-col">
                  <NuxtLink
                    :to="`/admin/servers/${server.id}`"
                    class="font-medium hover:text-primary"
                  >
                    {{ server.name }}
                  </NuxtLink>
                  <span class="text-xs text-muted-foreground">{{ server.identifier }}</span>
                </div>
              </td>
              <td class="px-3 py-2">
                <UBadge v-if="server.suspended" size="xs" color="error" variant="soft"
                  >Suspended</UBadge
                >
                <span v-else class="text-xs text-muted-foreground">{{
                  server.status || 'Unknown'
                }}</span>
              </td>
              <td class="px-3 py-2 text-xs text-muted-foreground">
                {{ server.nodeName || 'Unassigned' }}
              </td>
              <td class="px-3 py-2 text-xs text-muted-foreground">
                <NuxtTime v-if="server.createdAt" :datetime="server.createdAt" />
                <span v-else>Unknown</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="serversPagination && serversPagination.totalPages > 1"
        class="flex items-center justify-between border-t border-default pt-4"
      >
        <div class="text-sm text-muted-foreground">
          Showing {{ (serversPagination.page - 1) * serversPagination.perPage + 1 }} to
          {{
            Math.min(serversPagination.page * serversPagination.perPage, serversPagination.total)
          }}
          of {{ serversPagination.total }} servers
        </div>
        <UPagination
          v-model:page="serversPage"
          :total="serversPagination.total"
          :items-per-page="serversPagination.perPage"
          size="sm"
        />
      </div>
    </div>
  </UCard>
</template>
