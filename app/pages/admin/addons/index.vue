<script setup lang="ts">
definePageMeta({
  auth: true,
  adminTitle: 'Addons',
  adminSubtitle: 'Installed panel addons',
});

interface InstalledAddon {
  name: string;
  version: string;
}

interface PageBlock {
  html: string;
}

const { data: addonsData, pending, error } = useFetch<{ addons: InstalledAddon[] }>(
  '/api/admin/addons',
  { key: 'admin-addons-list' },
);

const { data: blocksData } = useFetch<{ blocks: PageBlock[] }>('/api/admin/addons/pages/home', {
  key: 'admin-addons-home-blocks',
});

const addons = computed(() => addonsData.value?.addons ?? []);
const blocks = computed(() => blocksData.value?.blocks ?? []);
</script>

<template>
  <div class="flex flex-col gap-6">
    <UCard>
      <template #header>
        <h2 class="text-base font-semibold">Installed addons</h2>
      </template>

      <UAlert v-if="error" color="error" variant="subtle" :title="error.message" />

      <div v-else-if="pending" class="text-sm text-muted">Loading…</div>

      <div v-else-if="addons.length === 0" class="text-sm text-muted">
        No addons installed. Drop a folder with an <code>addon.ts</code> manifest into
        <code>addons/</code> and restart the server.
      </div>

      <UTable
        v-else
        :data="addons"
        :columns="[
          { accessorKey: 'name', header: 'Name' },
          { accessorKey: 'version', header: 'Version' },
        ]"
      />
    </UCard>

    <UCard v-for="(block, i) in blocks" :key="i">
      <template #header>
        <h2 class="text-base font-semibold">Addon content block</h2>
      </template>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="block.html" />
    </UCard>
  </div>
</template>
