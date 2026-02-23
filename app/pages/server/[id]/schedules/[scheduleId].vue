<script setup lang="ts">
import { ref, computed } from 'vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

definePageMeta({
  auth: true,
});

const serverId = computed(() => route.params.id as string);
const scheduleId = computed(() => route.params.scheduleId as string);
const isNew = computed(() => scheduleId.value === 'new');

const form = ref({
  name: '',
  cron: '0 0 * * *',
  action: 'power',
  enabled: true,
});

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const cronPresets = computed(() => [
  { label: t('server.schedules.cronPresets.everyMinute'), value: '* * * * *' },
  { label: t('server.schedules.cronPresets.every5Minutes'), value: '*/5 * * * *' },
  { label: t('server.schedules.cronPresets.every15Minutes'), value: '*/15 * * * *' },
  { label: t('server.schedules.cronPresets.every30Minutes'), value: '*/30 * * * *' },
  { label: t('server.schedules.cronPresets.everyHour'), value: '0 * * * *' },
  { label: t('server.schedules.cronPresets.every6Hours'), value: '0 */6 * * *' },
  { label: t('server.schedules.cronPresets.every12Hours'), value: '0 */12 * * *' },
  { label: t('server.schedules.cronPresets.dailyAtMidnight'), value: '0 0 * * *' },
  { label: t('server.schedules.cronPresets.dailyAtNoon'), value: '0 12 * * *' },
  { label: t('server.schedules.cronPresets.weeklySunday'), value: '0 0 * * 0' },
  { label: t('server.schedules.cronPresets.monthly1st'), value: '0 0 1 * *' },
]);

const actionTypes = computed(() => [
  {
    label: t('server.schedules.actionTypes.powerAction'),
    value: 'power',
    description: t('server.schedules.actionTypes.powerActionDescription'),
  },
  {
    label: t('server.schedules.actionTypes.command'),
    value: 'command',
    description: t('server.schedules.actionTypes.commandDescription'),
  },
  {
    label: t('server.schedules.actionTypes.backup'),
    value: 'backup',
    description: t('server.schedules.actionTypes.backupDescription'),
  },
]);

async function loadSchedule() {
  if (isNew.value) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await $fetch<{
      data: { id: string; name: string; cron: string; action: string; enabled: boolean };
    }>(`/api/client/servers/${serverId.value}/schedules/${scheduleId.value}`);

    form.value = {
      name: response.data.name,
      cron: response.data.cron,
      action: response.data.action,
      enabled: response.data.enabled,
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('server.schedules.failedToLoadSchedule');
  } finally {
    loading.value = false;
  }
}

async function saveSchedule() {
  if (!form.value.name || !form.value.cron || !form.value.action) {
    error.value = t('validation.fillInAllRequiredFields');
    return;
  }

  saving.value = true;
  error.value = null;

  try {
    if (isNew.value) {
      await $fetch(`/api/client/servers/${serverId.value}/schedules`, {
        method: 'POST',
        body: form.value,
      });

      useToast().add({
        title: t('server.schedules.scheduleCreated'),
        description: t('server.schedules.scheduleCreatedDescription'),
        color: 'success',
      });
    } else {
      await $fetch(`/api/client/servers/${serverId.value}/schedules/${scheduleId.value}`, {
        method: 'POST',
        body: form.value,
      });

      useToast().add({
        title: t('server.schedules.scheduleUpdated'),
        description: t('server.schedules.changesSavedSuccessfully'),
        color: 'success',
      });
    }

    router.push(`/server/${serverId.value}/schedules`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('server.schedules.failedToSaveSchedule');
    useToast().add({
      title: t('server.schedules.saveFailed'),
      description: error.value,
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
}

async function deleteSchedule() {
  if (!confirm(t('server.schedules.confirmDeleteSchedule'))) return;

  try {
    await $fetch(`/api/client/servers/${serverId.value}/schedules/${scheduleId.value}`, {
      method: 'DELETE',
    });

    useToast().add({
      title: t('server.schedules.scheduleDeleted'),
      description: t('server.schedules.scheduleDeletedDescription'),
      color: 'success',
    });

    router.push(`/server/${serverId.value}/schedules`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('server.schedules.failedToDeleteSchedule');
    useToast().add({
      title: t('server.schedules.deleteFailed'),
      description: error.value,
      color: 'error',
    });
  }
}

function parseCron(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return t('server.schedules.invalidCronExpression');

  const minute = parts[0];
  const hour = parts[1];
  const dayOfMonth = parts[2];
  const month = parts[3];
  const dayOfWeek = parts[4];

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return t('server.schedules.invalidCronExpression');
  }

  const descriptions: string[] = [];

  if (minute === '*') descriptions.push(t('server.schedules.cronParse.everyMinute'));
  else if (minute.startsWith('*/'))
    descriptions.push(t('server.schedules.cronParse.everyNMinutes', { n: minute.slice(2) }));
  else descriptions.push(t('server.schedules.cronParse.atMinute', { minute }));

  if (hour !== '*') {
    if (hour.startsWith('*/'))
      descriptions.push(t('server.schedules.cronParse.everyNHours', { n: hour.slice(2) }));
    else descriptions.push(t('server.schedules.cronParse.atHour', { hour }));
  }

  if (dayOfMonth !== '*')
    descriptions.push(t('server.schedules.cronParse.onDay', { day: dayOfMonth }));
  if (month !== '*') descriptions.push(t('server.schedules.cronParse.inMonth', { month }));
  if (dayOfWeek !== '*')
    descriptions.push(t('server.schedules.cronParse.onDayOfWeek', { day: dayOfWeek }));

  return descriptions.join(', ');
}

onMounted(() => {
  if (!isNew.value) {
    loadSchedule();
  }
});
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UButton
                icon="i-lucide-arrow-left"
                variant="ghost"
                color="neutral"
                :to="`/server/${serverId}/schedules`"
              >
                {{ t('common.back') }}
              </UButton>
              <div>
                <h1 class="text-xl font-semibold">
                  {{
                    isNew
                      ? t('server.schedules.createSchedule')
                      : t('server.schedules.editSchedule')
                  }}
                </h1>
                <p class="text-xs text-muted-foreground">
                  {{ t('server.schedules.configureAutomatedTasks') }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <UButton
                v-if="!isNew"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                @click="deleteSchedule"
              >
                {{ t('common.delete') }}
              </UButton>
              <UButton
                icon="i-lucide-save"
                color="primary"
                :loading="saving"
                :disabled="loading"
                @click="saveSchedule"
              >
                {{ isNew ? t('common.create') : t('common.save') }}
              </UButton>
            </div>
          </div>

          <UAlert v-if="error" color="error" icon="i-lucide-alert-circle" :title="error" />

          <div
            v-if="loading"
            class="flex items-center justify-center rounded-lg border border-default bg-background p-12"
          >
            <div class="text-center">
              <UIcon name="i-lucide-loader-2" class="mx-auto size-8 animate-spin text-primary" />
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t('server.schedules.loadingSchedule') }}
              </p>
            </div>
          </div>

          <div v-else class="space-y-6">
            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('server.schedules.basicInformation') }}</h2>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="mb-2 block text-sm font-medium">{{
                    t('server.schedules.scheduleName')
                  }}</label>
                  <UInput
                    v-model="form.name"
                    :placeholder="t('server.schedules.scheduleNamePlaceholder')"
                    size="lg"
                  />
                </div>

                <div>
                  <label class="mb-2 block text-sm font-medium">{{
                    t('server.schedules.actionType')
                  }}</label>
                  <div class="grid gap-3 md:grid-cols-3">
                    <div
                      v-for="action in actionTypes"
                      :key="action.value"
                      class="cursor-pointer rounded-lg border p-4 transition"
                      :class="
                        form.action === action.value
                          ? 'border-primary bg-primary/5'
                          : 'border-default hover:border-primary/50'
                      "
                      @click="form.action = action.value"
                    >
                      <div class="flex items-center gap-2">
                        <input
                          type="radio"
                          :checked="form.action === action.value"
                          class="text-primary"
                        />
                        <span class="font-medium">{{ action.label }}</span>
                      </div>
                      <p class="mt-1 text-xs text-muted-foreground">{{ action.description }}</p>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <USwitch v-model="form.enabled" />
                  <label class="text-sm font-medium">{{
                    t('server.schedules.enableThisSchedule')
                  }}</label>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">{{ t('server.schedules.scheduleTiming') }}</h2>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="mb-2 block text-sm font-medium">{{
                    t('server.schedules.cronExpression')
                  }}</label>
                  <UInput v-model="form.cron" placeholder="* * * * *" size="lg" class="font-mono" />
                  <p class="mt-2 text-xs text-muted-foreground">
                    {{ parseCron(form.cron) }}
                  </p>
                </div>

                <div>
                  <label class="mb-2 block text-sm font-medium">{{
                    t('server.schedules.quickPresets')
                  }}</label>
                  <div class="grid gap-2 md:grid-cols-3">
                    <UButton
                      v-for="preset in cronPresets"
                      :key="preset.value"
                      variant="outline"
                      size="sm"
                      block
                      @click="form.cron = preset.value"
                    >
                      {{ preset.label }}
                    </UButton>
                  </div>
                </div>

                <div class="rounded-lg border border-default bg-muted/50 p-4">
                  <h3 class="mb-2 text-sm font-semibold">{{ t('server.schedules.cronFormat') }}</h3>
                  <div class="space-y-1 text-xs text-muted-foreground">
                    <p><code class="rounded bg-background px-1 py-0.5">* * * * *</code></p>
                    <p>│ │ │ │ │</p>
                    <p>│ │ │ │ └─ {{ t('server.schedules.cronFormatDayOfWeek') }}</p>
                    <p>│ │ │ └─── {{ t('server.schedules.cronFormatMonth') }}</p>
                    <p>│ │ └───── {{ t('server.schedules.cronFormatDayOfMonth') }}</p>
                    <p>│ └─────── {{ t('server.schedules.cronFormatHour') }}</p>
                    <p>└───────── {{ t('server.schedules.cronFormatMinute') }}</p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
