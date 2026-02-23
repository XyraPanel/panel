<script setup lang="ts">
import type { TaskAction, PowerAction } from '#shared/types/server';

interface ScheduleTaskResponse {
  id: string;
  sequence_id: number;
  action: TaskAction;
  payload: string;
  time_offset: number;
  continue_on_failure: boolean;
  is_queued: boolean;
  created_at: string;
  updated_at: string;
}

interface ScheduleResponse {
  id: string;
  name: string;
  cron: string;
  is_active: boolean;
  is_processing: boolean;
  only_when_online: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  tasks: ScheduleTaskResponse[];
}

interface ScheduleTaskItem {
  id: string;
  action: TaskAction;
  payload: string;
  timeOffset: number;
  sequenceId: number;
  continueOnFailure: boolean;
  isQueued: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleListItem {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  tasks: ScheduleTaskItem[];
}

const route = useRoute();

definePageMeta({
  auth: true,
});

const { t } = useI18n();
const toast = useToast();
const serverId = computed(() => route.params.id as string);
const requestFetch = useRequestFetch();

const {
  data: schedulesData,
  pending,
  error,
  refresh: refreshSchedules,
} = await useAsyncData<{ data: ScheduleResponse[] }>(
  `server-${serverId.value}-schedules`,
  () =>
    requestFetch<{ data: ScheduleResponse[] }>(`/api/client/servers/${serverId.value}/schedules`),
  {
    watch: [serverId],
  },
);

const schedules = computed<ScheduleListItem[]>(() => {
  return (schedulesData.value?.data || []).map((schedule) => ({
    id: schedule.id,
    name: schedule.name,
    cron: schedule.cron,
    enabled: schedule.is_active,
    nextRunAt: schedule.next_run_at ? new Date(schedule.next_run_at).toISOString() : null,
    lastRunAt: schedule.last_run_at ? new Date(schedule.last_run_at).toISOString() : null,
    tasks: (schedule.tasks || []).map((task) => ({
      id: task.id,
      action: task.action,
      payload: task.payload,
      sequenceId: task.sequence_id,
      timeOffset: task.time_offset,
      continueOnFailure: task.continue_on_failure,
      isQueued: task.is_queued,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    })),
  }));
});

const showCreateModal = ref(false);
const creatingSchedule = ref(false);
const showTaskModal = ref(false);
const submittingTask = ref(false);
const deletingTaskId = ref<string | null>(null);
const selectedSchedule = ref<ScheduleListItem | null>(null);
const showDeleteModal = ref(false);
const schedulePendingDelete = ref<ScheduleListItem | null>(null);
const deletingSchedule = ref(false);
const showEditModal = ref(false);
const editingSchedule = ref(false);
const scheduleToEdit = ref<ScheduleListItem | null>(null);
const runningScheduleId = ref<string | null>(null);

const createForm = reactive({
  name: '',
  minute: '0',
  hour: '0',
  dayOfMonth: '*',
  month: '*',
  dayOfWeek: '*',
  isActive: true,
});

const taskForm = reactive({
  scheduleId: '',
  action: 'command' as TaskAction,
  payload: '',
  timeOffset: 0,
  continueOnFailure: false,
});

const availableActions: TaskAction[] = ['command', 'power', 'backup'];
const powerActions: PowerAction[] = ['start', 'stop', 'restart', 'kill'];

const cronExpression = computed(() =>
  [
    createForm.minute || '*',
    createForm.hour || '*',
    createForm.dayOfMonth || '*',
    createForm.month || '*',
    createForm.dayOfWeek || '*',
  ].join(' '),
);

const cronPresets = computed(() => [
  {
    label: t('server.schedules.cronPresets.everyMinute'),
    value: { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    label: t('server.schedules.cronPresets.every5Minutes'),
    value: { minute: '*/5', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    label: t('server.schedules.cronPresets.everyHour'),
    value: { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    label: t('server.schedules.cronPresets.dailyAtMidnight'),
    value: { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    label: t('server.schedules.cronPresets.weeklySunday'),
    value: { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '0' },
  },
]);

function applyCronPreset(preset: {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}) {
  createForm.minute = preset.minute;
  createForm.hour = preset.hour;
  createForm.dayOfMonth = preset.dayOfMonth;
  createForm.month = preset.month;
  createForm.dayOfWeek = preset.dayOfWeek;
}

function resetCreateForm() {
  createForm.name = '';
  createForm.minute = '0';
  createForm.hour = '0';
  createForm.dayOfMonth = '*';
  createForm.month = '*';
  createForm.dayOfWeek = '*';
  createForm.isActive = true;
}

const defaultPowerAction: PowerAction = powerActions[0] ?? 'start';

function resetTaskForm(action: TaskAction = 'command') {
  taskForm.action = action;
  taskForm.payload = action === 'power' ? defaultPowerAction : '';
  taskForm.timeOffset = 0;
  taskForm.continueOnFailure = false;
}

function openCreateModal() {
  resetCreateForm();
  showCreateModal.value = true;
}

function openTaskModal(schedule: ScheduleListItem) {
  selectedSchedule.value = schedule;
  taskForm.scheduleId = schedule.id;
  resetTaskForm();
  showTaskModal.value = true;
}

function openEditModal(schedule: ScheduleListItem) {
  scheduleToEdit.value = schedule;
  createForm.name = schedule.name;
  const parts = schedule.cron.split(' ');
  createForm.minute = parts[0] || '*';
  createForm.hour = parts[1] || '*';
  createForm.dayOfMonth = parts[2] || '*';
  createForm.month = parts[3] || '*';
  createForm.dayOfWeek = parts[4] || '*';
  createForm.isActive = schedule.enabled;
  showEditModal.value = true;
}

function requestDeleteSchedule(schedule: ScheduleListItem) {
  schedulePendingDelete.value = schedule;
  showDeleteModal.value = true;
}

function resetDeleteState() {
  showDeleteModal.value = false;
  schedulePendingDelete.value = null;
}

const selectedScheduleTasks = computed(() => selectedSchedule.value?.tasks || []);

const taskActionOptions = computed(() => ({
  command: t('server.schedules.actionCommand'),
  power: t('server.schedules.actionPower'),
  backup: t('server.schedules.actionBackup'),
}));

function selectTaskAction(action: TaskAction) {
  taskForm.action = action;
  if (action === 'power') {
    taskForm.payload = defaultPowerAction;
  } else {
    taskForm.payload = '';
  }
}

async function handleDeleteSchedule() {
  if (!schedulePendingDelete.value) {
    return;
  }

  deletingSchedule.value = true;
  try {
    await $fetch(
      `/api/client/servers/${serverId.value}/schedules/${schedulePendingDelete.value.id}`,
      {
        method: 'DELETE',
      },
    );

    toast.add({
      title: t('server.schedules.scheduleDeleted'),
      description: t('server.schedules.scheduleDeletedDescription', {
        name: schedulePendingDelete.value.name,
      }),
      color: 'success',
    });

    if (selectedSchedule.value?.id === schedulePendingDelete.value.id) {
      selectedSchedule.value = null;
      showTaskModal.value = false;
    }

    resetDeleteState();
    await refreshSchedules();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t('server.schedules.failedToDeleteSchedule');
    toast.add({
      title: t('server.schedules.deleteFailed'),
      description: message,
      color: 'error',
    });
  } finally {
    deletingSchedule.value = false;
  }
}

function taskActionLabel(action: TaskAction) {
  return taskActionOptions.value[action];
}

function getTaskDescription(task: ScheduleTaskItem) {
  switch (task.action) {
    case 'power':
      return t('server.schedules.taskPowerDescription', { action: task.payload });
    case 'backup':
      return t('server.schedules.taskBackupDescription', { name: task.payload });
    default:
      return task.payload;
  }
}

async function refreshScheduleListAndSelect(scheduleId?: string) {
  await refreshSchedules();
  const targetId = scheduleId || selectedSchedule.value?.id;
  if (!targetId) {
    return;
  }
  const updated = schedules.value.find((schedule) => schedule.id === targetId) || null;
  selectedSchedule.value = updated;
}

async function handleCreateSchedule() {
  if (!createForm.name.trim()) {
    toast.add({
      title: t('validation.fillInAllRequiredFields'),
      color: 'error',
    });
    return;
  }

  creatingSchedule.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/schedules`, {
      method: 'POST',
      body: {
        name: createForm.name.trim(),
        cron: {
          minute: createForm.minute,
          hour: createForm.hour,
          day_of_month: createForm.dayOfMonth,
          month: createForm.month,
          day_of_week: createForm.dayOfWeek,
        },
        is_active: createForm.isActive,
      },
    });

    toast.add({
      title: t('server.schedules.scheduleCreated'),
      description: t('server.schedules.scheduleCreatedDescription'),
      color: 'success',
    });

    showCreateModal.value = false;
    await refreshSchedules();
  } catch (err) {
    const message = err instanceof Error ? err.message : t('server.schedules.failedToSaveSchedule');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    creatingSchedule.value = false;
  }
}

async function handleEditSchedule() {
  if (!scheduleToEdit.value || !createForm.name.trim()) {
    toast.add({
      title: t('validation.fillInAllRequiredFields'),
      color: 'error',
    });
    return;
  }

  editingSchedule.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/schedules/${scheduleToEdit.value.id}`, {
      method: 'POST',
      body: {
        name: createForm.name.trim(),
        cron: {
          minute: createForm.minute,
          hour: createForm.hour,
          day_of_month: createForm.dayOfMonth,
          month: createForm.month,
          day_of_week: createForm.dayOfWeek,
        },
        is_active: createForm.isActive,
      },
    });

    toast.add({
      title: t('server.schedules.scheduleUpdated'),
      description: t('server.schedules.changesSavedSuccessfully'),
      color: 'success',
    });

    showEditModal.value = false;
    await refreshSchedules();
  } catch (err) {
    const message = err instanceof Error ? err.message : t('server.schedules.failedToSaveSchedule');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    editingSchedule.value = false;
  }
}

async function handleForceRunSchedule(scheduleId: string) {
  runningScheduleId.value = scheduleId;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/schedules/${scheduleId}/run`, {
      method: 'POST',
    });

    toast.add({
      title: t('server.schedules.scheduleExecuted'),
      description: t('server.schedules.scheduleExecutedDescription'),
      color: 'success',
    });

    await refreshSchedules();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : t('server.schedules.failedToExecuteSchedule');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    runningScheduleId.value = null;
  }
}

async function handleCreateTask() {
  if (!taskForm.scheduleId) {
    return;
  }

  const trimmedPayload = taskForm.action === 'power' ? taskForm.payload : taskForm.payload.trim();
  if (!trimmedPayload) {
    toast.add({
      title: t('server.schedules.taskPayloadRequired'),
      color: 'error',
    });
    return;
  }

  submittingTask.value = true;
  try {
    await $fetch(`/api/client/servers/${serverId.value}/schedules/${taskForm.scheduleId}/tasks`, {
      method: 'POST',
      body: {
        action: taskForm.action,
        payload: trimmedPayload,
        time_offset: taskForm.timeOffset,
        continue_on_failure: taskForm.continueOnFailure,
      },
    });

    toast.add({
      title: t('server.schedules.taskCreated'),
      color: 'success',
    });

    resetTaskForm(taskForm.action);
    await refreshScheduleListAndSelect(taskForm.scheduleId);
  } catch (err) {
    const message = err instanceof Error ? err.message : t('server.schedules.failedToSaveTask');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    submittingTask.value = false;
  }
}

async function handleDeleteTask(taskId: string) {
  if (!selectedSchedule.value) {
    return;
  }

  deletingTaskId.value = taskId;
  try {
    await $fetch(
      `/api/client/servers/${serverId.value}/schedules/${selectedSchedule.value.id}/tasks/${taskId}`,
      {
        method: 'DELETE',
      },
    );

    toast.add({
      title: t('server.schedules.taskDeleted'),
      color: 'success',
    });

    await refreshScheduleListAndSelect(selectedSchedule.value.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : t('server.schedules.failedToDeleteTask');
    toast.add({
      title: t('common.error'),
      description: message,
      color: 'error',
    });
  } finally {
    deletingTaskId.value = null;
  }
}

function getStatusColor(enabled: boolean) {
  return enabled ? 'primary' : 'warning';
}

function getStatusLabel(enabled: boolean) {
  return enabled ? t('server.schedules.enabled') : t('server.schedules.paused');
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <UModal
            v-model:open="showCreateModal"
            :ui="{ footer: 'justify-end gap-2' }"
            :title="t('server.schedules.createSchedule')"
            :description="t('server.schedules.description')"
          >
            <template #body>
              <div class="space-y-4">
                <UFormField :label="t('server.schedules.scheduleName')" required>
                  <UInput
                    v-model="createForm.name"
                    :placeholder="t('server.schedules.scheduleNamePlaceholder')"
                  />
                </UFormField>

                <UFormField :label="t('server.schedules.scheduleTiming')" required>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <UFormField
                      :label="t('server.schedules.cronMinute')"
                      class="space-y-1 text-xs font-medium text-muted-foreground"
                    >
                      <UInput v-model="createForm.minute" />
                    </UFormField>
                    <UFormField
                      :label="t('server.schedules.cronHour')"
                      class="space-y-1 text-xs font-medium text-muted-foreground"
                    >
                      <UInput v-model="createForm.hour" />
                    </UFormField>
                    <UFormField
                      :label="t('server.schedules.cronDayOfMonth')"
                      class="space-y-1 text-xs font-medium text-muted-foreground"
                    >
                      <UInput v-model="createForm.dayOfMonth" />
                    </UFormField>
                    <UFormField
                      :label="t('server.schedules.cronMonth')"
                      class="space-y-1 text-xs font-medium text-muted-foreground"
                    >
                      <UInput v-model="createForm.month" />
                    </UFormField>
                    <UFormField
                      :label="t('server.schedules.cronDayOfWeek')"
                      class="space-y-1 text-xs font-medium text-muted-foreground"
                    >
                      <UInput v-model="createForm.dayOfWeek" />
                    </UFormField>
                  </div>
                  <p class="mt-2 font-mono text-xs text-muted-foreground">{{ cronExpression }}</p>
                </UFormField>

                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">
                    {{ t('server.schedules.quickPresets') }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-for="preset in cronPresets"
                      :key="preset.label"
                      size="xs"
                      variant="ghost"
                      @click="applyCronPreset(preset.value)"
                    >
                      {{ preset.label }}
                    </UButton>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <USwitch v-model="createForm.isActive" />
                  <span class="text-sm text-muted-foreground">{{
                    t('server.schedules.enableThisSchedule')
                  }}</span>
                </div>
              </div>
            </template>

            <template #footer>
              <UButton variant="ghost" @click="showCreateModal = false">
                {{ t('common.cancel') }}
              </UButton>
              <UButton color="primary" :loading="creatingSchedule" @click="handleCreateSchedule">
                {{ t('common.create') }}
              </UButton>
            </template>
          </UModal>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-xs uppercase tracking-wide text-muted-foreground">
                    {{ t('server.schedules.scheduleInsights') }}
                  </p>
                  <h2 class="text-lg font-semibold">
                    {{ t('server.schedules.configuredSchedules') }}
                  </h2>
                </div>
                <UButton
                  icon="i-lucide-plus"
                  color="primary"
                  variant="soft"
                  class="ml-auto"
                  @click="openCreateModal"
                >
                  {{ t('server.schedules.newSchedule') }}
                </UButton>
              </div>
            </template>

            <div
              v-if="error"
              class="rounded-lg border border-error/20 bg-error/5 p-4 text-sm text-error"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4" />
                <div>
                  <p class="font-medium">{{ t('server.schedules.failedToLoad') }}</p>
                  <p class="mt-1 text-xs opacity-80">{{ error.message }}</p>
                </div>
              </div>
            </div>

            <div
              v-else-if="pending"
              class="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground"
            >
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-primary" />
              <span>{{ t('common.loading') }}</span>
            </div>

            <div
              v-else-if="schedules.length === 0"
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default p-8 text-center text-muted-foreground"
            >
              <UIcon name="i-lucide-calendar-clock" class="size-12 text-muted-foreground/50" />
              <div>
                <p class="text-sm font-medium text-foreground">
                  {{ t('server.schedules.noSchedules') }}
                </p>
                <p class="text-xs">{{ t('server.schedules.noSchedulesDescription') }}</p>
              </div>
              <UButton icon="i-lucide-plus" variant="soft" color="primary" @click="openCreateModal">
                {{ t('server.schedules.createSchedule') }}
              </UButton>
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="item in schedules"
                :key="item.id"
                class="rounded-xl border border-default/70 bg-muted/10 p-4 shadow-sm"
              >
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <h3 class="text-base font-semibold text-foreground">{{ item.name }}</h3>
                      <UBadge :color="getStatusColor(item.enabled)" size="xs">
                        {{ getStatusLabel(item.enabled) }}
                      </UBadge>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      {{ t('server.schedules.nextRun') }}:
                      <NuxtTime
                        v-if="item.nextRunAt"
                        :datetime="item.nextRunAt"
                        month="short"
                        day="numeric"
                        year="numeric"
                        hour="2-digit"
                        minute="2-digit"
                        time-zone-name="short"
                      />
                      <span v-else>{{ t('server.schedules.notScheduled') }}</span>
                    </p>
                  </div>

                  <div class="flex items-center gap-2">
                    <UButton
                      size="sm"
                      variant="solid"
                      color="primary"
                      icon="i-lucide-play"
                      :loading="runningScheduleId === item.id"
                      @click="handleForceRunSchedule(item.id)"
                    >
                      {{ t('server.schedules.forceRun') }}
                    </UButton>
                    <UButton
                      size="sm"
                      variant="solid"
                      color="primary"
                      icon="i-lucide-pencil"
                      @click="openEditModal(item)"
                    >
                      {{ t('common.edit') }}
                    </UButton>
                    <UButton
                      size="sm"
                      variant="solid"
                      color="primary"
                      icon="i-lucide-list"
                      @click="openTaskModal(item)"
                    >
                      {{ t('server.schedules.manageTasksAction') }}
                    </UButton>
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-trash-2"
                      @click="requestDeleteSchedule(item)"
                    >
                      {{ t('server.schedules.deleteScheduleAction') }}
                    </UButton>
                  </div>
                </div>

                <div class="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-clock" class="size-4 text-primary" />
                    <div>
                      <p class="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {{ t('server.schedules.cron') }}
                      </p>
                      <code class="rounded bg-muted px-2 py-1 text-xs text-foreground">{{
                        item.cron
                      }}</code>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-list-checks" class="size-4 text-primary" />
                    <div>
                      <p class="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {{ t('server.schedules.tasksTitle') }}
                      </p>
                      <p class="text-xs text-foreground">
                        {{ t('server.schedules.taskCount', { count: item.tasks.length }) }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-history" class="size-4 text-primary" />
                    <div>
                      <p class="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {{ t('server.schedules.last') }}
                      </p>
                      <p class="text-xs text-foreground">
                        <NuxtTime
                          v-if="item.lastRunAt"
                          :datetime="item.lastRunAt"
                          month="short"
                          day="numeric"
                          year="numeric"
                          hour="2-digit"
                          minute="2-digit"
                          time-zone-name="short"
                        />
                        <span v-else>{{ t('server.schedules.notScheduled') }}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  class="mt-4 rounded-lg border border-dashed border-default/80 bg-background/50 p-3"
                >
                  <div
                    class="flex items-center justify-between text-xs font-semibold text-muted-foreground"
                  >
                    <span>{{ t('server.schedules.tasksTitle') }}</span>
                    <UButton
                      size="xs"
                      variant="ghost"
                      icon="i-lucide-arrow-up-right"
                      @click="openTaskModal(item)"
                    >
                      {{ t('server.schedules.manageTasksAction') }}
                    </UButton>
                  </div>
                  <div v-if="item.tasks.length === 0" class="mt-2 text-xs text-muted-foreground">
                    {{ t('server.schedules.noTasksForSchedule') }}
                  </div>
                  <div v-else class="mt-3 space-y-2">
                    <div
                      v-for="task in item.tasks.slice(0, 3)"
                      :key="task.id"
                      class="flex items-start justify-between rounded-md border border-default/50 bg-muted/40 p-2 text-xs"
                    >
                      <div>
                        <p class="font-semibold capitalize text-foreground">
                          {{ taskActionLabel(task.action) }}
                        </p>
                        <p class="font-mono text-[11px] text-muted-foreground">
                          {{ getTaskDescription(task) }}
                        </p>
                      </div>
                      <div class="text-right text-[11px] text-muted-foreground/70">
                        <p>#{{ task.sequenceId }}</p>
                        <p>
                          {{
                            t('server.schedules.timeOffsetSeconds', { seconds: task.timeOffset })
                          }}
                        </p>
                      </div>
                    </div>
                    <div v-if="item.tasks.length > 3" class="text-[11px] text-muted-foreground">
                      +{{ item.tasks.length - 3 }}
                      {{ t('server.schedules.manageTasksAction').toLowerCase() }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </section>
      </UContainer>
    </UPageBody>

    <UModal
      v-model:open="showEditModal"
      :ui="{ footer: 'justify-end gap-2' }"
      :title="t('server.schedules.editSchedule')"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('server.schedules.scheduleName')" required>
            <UInput
              v-model="createForm.name"
              :placeholder="t('server.schedules.scheduleNamePlaceholder')"
            />
          </UFormField>

          <UFormField :label="t('server.schedules.scheduleTiming')" required>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField
                :label="t('server.schedules.cronMinute')"
                class="space-y-1 text-xs font-medium text-muted-foreground"
              >
                <UInput v-model="createForm.minute" />
              </UFormField>
              <UFormField
                :label="t('server.schedules.cronHour')"
                class="space-y-1 text-xs font-medium text-muted-foreground"
              >
                <UInput v-model="createForm.hour" />
              </UFormField>
              <UFormField
                :label="t('server.schedules.cronDayOfMonth')"
                class="space-y-1 text-xs font-medium text-muted-foreground"
              >
                <UInput v-model="createForm.dayOfMonth" />
              </UFormField>
              <UFormField
                :label="t('server.schedules.cronMonth')"
                class="space-y-1 text-xs font-medium text-muted-foreground"
              >
                <UInput v-model="createForm.month" />
              </UFormField>
              <UFormField
                :label="t('server.schedules.cronDayOfWeek')"
                class="space-y-1 text-xs font-medium text-muted-foreground"
              >
                <UInput v-model="createForm.dayOfWeek" />
              </UFormField>
            </div>
            <p class="mt-2 font-mono text-xs text-muted-foreground">{{ cronExpression }}</p>
          </UFormField>

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">
              {{ t('server.schedules.quickPresets') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="preset in cronPresets"
                :key="preset.label"
                size="xs"
                variant="ghost"
                @click="applyCronPreset(preset.value)"
              >
                {{ preset.label }}
              </UButton>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <USwitch v-model="createForm.isActive" />
            <span class="text-sm text-muted-foreground">{{
              t('server.schedules.enableThisSchedule')
            }}</span>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" @click="showEditModal = false">
          {{ t('common.cancel') }}
        </UButton>
        <UButton color="primary" :loading="editingSchedule" @click="handleEditSchedule">
          {{ t('common.save') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="showTaskModal"
      :title="
        selectedSchedule
          ? t('server.schedules.manageTasksFor', { name: selectedSchedule.name })
          : t('server.schedules.manageTasks')
      "
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-6">
          <div>
            <p class="text-xs font-semibold text-muted-foreground">
              {{ t('server.schedules.chooseTaskAction') }}
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                v-for="action in availableActions"
                :key="action"
                size="xs"
                :variant="taskForm.action === action ? 'solid' : 'soft'"
                @click="selectTaskAction(action)"
              >
                {{ taskActionLabel(action) }}
              </UButton>
            </div>
          </div>

          <div v-if="taskForm.action === 'command'" class="space-y-2">
            <UFormField :label="t('server.schedules.commandLabel')" required>
              <UTextarea
                v-model="taskForm.payload"
                :placeholder="t('server.schedules.commandPlaceholder')"
                autoresize
                :rows="3"
              />
            </UFormField>
          </div>

          <div v-else-if="taskForm.action === 'backup'" class="space-y-2">
            <UFormField :label="t('server.schedules.backupName')" required>
              <UInput
                v-model="taskForm.payload"
                :placeholder="t('server.schedules.backupPlaceholder')"
              />
            </UFormField>
          </div>

          <div v-else class="space-y-2">
            <p class="text-xs font-semibold text-muted-foreground">
              {{ t('server.schedules.powerAction') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="action in powerActions"
                :key="action"
                size="xs"
                :variant="taskForm.payload === action ? 'solid' : 'soft'"
                @click="taskForm.payload = action"
              >
                {{ t(`server.schedules.powerActions.${action}`) }}
              </UButton>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('server.schedules.timeOffsetLabel')"
              :description="t('server.schedules.timeOffsetHelp')"
            >
              <UInput v-model.number="taskForm.timeOffset" type="number" min="0" max="3600" />
            </UFormField>
            <div class="flex items-center gap-2">
              <USwitch v-model="taskForm.continueOnFailure" />
              <span class="text-sm text-muted-foreground">{{
                t('server.schedules.continueOnFailureLabel')
              }}</span>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold text-muted-foreground">
                {{ t('server.schedules.currentTasks') }}
              </p>
              <UButton
                size="xs"
                color="primary"
                :loading="submittingTask"
                @click="handleCreateTask"
              >
                {{ t('server.schedules.addTask') }}
              </UButton>
            </div>
            <div
              v-if="selectedScheduleTasks.length === 0"
              class="rounded border border-dashed border-default p-3 text-xs text-muted-foreground"
            >
              {{ t('server.schedules.noTasksYet') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="task in selectedScheduleTasks"
                :key="task.id"
                class="flex flex-col gap-1 rounded border border-default/70 p-3 text-xs"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 font-semibold capitalize">
                    <UIcon name="i-lucide-bolt" class="size-4 text-primary" />
                    {{ taskActionLabel(task.action) }}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] text-muted-foreground">#{{ task.sequenceId }}</span>
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      color="error"
                      variant="ghost"
                      :loading="deletingTaskId === task.id"
                      @click="handleDeleteTask(task.id)"
                    />
                  </div>
                </div>
                <p class="font-mono text-[11px] text-muted-foreground">
                  {{ getTaskDescription(task) }}
                </p>
                <div class="flex flex-wrap gap-3 text-[11px] text-muted-foreground/80">
                  <span>{{
                    t('server.schedules.timeOffsetSeconds', { seconds: task.timeOffset })
                  }}</span>
                  <span v-if="task.continueOnFailure">{{
                    t('server.schedules.continueOnFailureLabel')
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton variant="ghost" @click="showTaskModal = false">
          {{ t('common.close') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteModal"
      :ui="{ footer: 'justify-end gap-2' }"
      :title="t('server.schedules.confirmDeleteSchedule')"
    >
      <template #body>
        <p class="text-sm text-muted-foreground">
          {{
            t('server.schedules.confirmDeleteScheduleDescription', {
              name: schedulePendingDelete?.name || '',
            })
          }}
        </p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="resetDeleteState">
          {{ t('common.cancel') }}
        </UButton>
        <UButton color="error" :loading="deletingSchedule" @click="handleDeleteSchedule">
          {{ t('server.schedules.deleteScheduleAction') }}
        </UButton>
      </template>
    </UModal>
  </UPage>
</template>
