<script setup lang="ts">
definePageMeta({
  auth: true,
  adminTitle: 'Example Hello',
  adminSubtitle: 'Reference addon — server.created / auth.login pings',
});

interface Ping {
  id: number;
  message: string;
  created_at: string;
}

const toast = useToast();
const message = ref('');
const isSubmitting = ref(false);

const { data: pingsData, refresh } = useFetch<{ pings: Ping[] }>(
  '/api/addons/example-hello/pings',
  { key: 'example-hello-pings' },
);

const pings = computed(() => pingsData.value?.pings ?? []);

async function submit() {
  if (!message.value.trim()) return;
  isSubmitting.value = true;
  try {
    await $fetch('/api/addons/example-hello/pings', {
      method: 'POST',
      body: { message: message.value.trim() },
    });
    message.value = '';
    await refresh();
  } catch (err) {
    toast.add({
      title: 'Failed to add ping',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <UCard>
      <template #header>
        <h2 class="text-base font-semibold">Add a ping</h2>
      </template>
      <div class="flex gap-2">
        <UInput v-model="message" placeholder="Message" class="flex-1" @keyup.enter="submit" />
        <UButton :loading="isSubmitting" @click="submit">Send</UButton>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-base font-semibold">Pings ({{ pings.length }})</h2>
      </template>
      <div v-if="pings.length === 0" class="text-sm text-muted">
        None yet — creating a server or logging in triggers one automatically, or use the form
        above.
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="ping in pings" :key="ping.id" class="text-sm">
          <span class="text-muted">{{ new Date(ping.created_at).toLocaleString() }}</span>
          — {{ ping.message }}
        </li>
      </ul>
    </UCard>
  </div>
</template>
