<script setup lang="ts">
import { ref, computed } from 'vue'

const route = useRoute()
const router = useRouter()

definePageMeta({
  auth: true,
  layout: 'server',
})

const serverId = computed(() => route.params.id as string)
const scheduleId = computed(() => route.params.scheduleId as string)
const isNew = computed(() => scheduleId.value === 'new')

const form = ref({
  name: '',
  cron: '0 0 * * *',
  action: 'power',
  enabled: true,
})

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const cronPresets = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at noon', value: '0 12 * * *' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
  { label: 'Monthly (1st)', value: '0 0 1 * *' },
]

const actionTypes = [
  { label: 'Power Action', value: 'power', description: 'Start, stop, or restart the server' },
  { label: 'Command', value: 'command', description: 'Execute a console command' },
  { label: 'Backup', value: 'backup', description: 'Create a server backup' },
]

async function loadSchedule() {
  if (isNew.value) return

  loading.value = true
  error.value = null

  try {
    const response = await $fetch<{ data: { id: string; name: string; cron: string; action: string; enabled: boolean } }>(
      `/api/servers/${serverId.value}/schedules/${scheduleId.value}`,
    )

    form.value = {
      name: response.data.name,
      cron: response.data.cron,
      action: response.data.action,
      enabled: response.data.enabled,
    }
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load schedule'
  }
  finally {
    loading.value = false
  }
}

async function saveSchedule() {
  if (!form.value.name || !form.value.cron || !form.value.action) {
    error.value = 'Please fill in all required fields'
    return
  }

  saving.value = true
  error.value = null

  try {
    if (isNew.value) {

      await $fetch(`/api/servers/${serverId.value}/schedules/create`, {
        method: 'POST',
        body: form.value,
      })

      useToast().add({
        title: 'Schedule created',
        description: 'Your schedule has been created successfully',
        color: 'success',
      })
    }
    else {

      await $fetch(`/api/servers/${serverId.value}/schedules/${scheduleId.value}/update`, {
        method: 'PUT',
        body: form.value,
      })

      useToast().add({
        title: 'Schedule updated',
        description: 'Your changes have been saved successfully',
        color: 'success',
      })
    }

    router.push(`/server/${serverId.value}/schedules`)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save schedule'
    useToast().add({
      title: 'Save failed',
      description: error.value,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function deleteSchedule() {
  if (!confirm('Are you sure you want to delete this schedule?')) return

  try {
    await $fetch(`/api/servers/${serverId.value}/schedules/${scheduleId.value}/delete`, {
      method: 'DELETE',
    })

    useToast().add({
      title: 'Schedule deleted',
      description: 'The schedule has been deleted successfully',
      color: 'success',
    })

    router.push(`/server/${serverId.value}/schedules`)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete schedule'
    useToast().add({
      title: 'Delete failed',
      description: error.value,
      color: 'error',
    })
  }
}

function parseCron(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return 'Invalid cron expression'

  const minute = parts[0]
  const hour = parts[1]
  const dayOfMonth = parts[2]
  const month = parts[3]
  const dayOfWeek = parts[4]

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return 'Invalid cron expression'
  }

  const descriptions: string[] = []

  if (minute === '*') descriptions.push('every minute')
  else if (minute.startsWith('*/')) descriptions.push(`every ${minute.slice(2)} minutes`)
  else descriptions.push(`at minute ${minute}`)

  if (hour !== '*') {
    if (hour.startsWith('*/')) descriptions.push(`every ${hour.slice(2)} hours`)
    else descriptions.push(`at hour ${hour}`)
  }

  if (dayOfMonth !== '*') descriptions.push(`on day ${dayOfMonth}`)
  if (month !== '*') descriptions.push(`in month ${month}`)
  if (dayOfWeek !== '*') descriptions.push(`on day of week ${dayOfWeek}`)

  return descriptions.join(', ')
}

onMounted(() => {
  if (!isNew.value) {
    loadSchedule()
  }
})
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
                Back
              </UButton>
              <div>
                <h1 class="text-xl font-semibold">{{ isNew ? 'Create Schedule' : 'Edit Schedule' }}</h1>
                <p class="text-xs text-muted-foreground">Configure automated tasks for your server</p>
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
                Delete
              </UButton>
              <UButton
                icon="i-lucide-save"
                color="primary"
                :loading="saving"
                :disabled="loading"
                @click="saveSchedule"
              >
                {{ isNew ? 'Create' : 'Save' }}
              </UButton>
            </div>
          </div>

          <UAlert v-if="error" color="error" icon="i-lucide-alert-circle" :title="error" />

          <div v-if="loading" class="flex items-center justify-center rounded-lg border border-default bg-background p-12">
            <div class="text-center">
              <UIcon name="i-lucide-loader-2" class="mx-auto size-8 animate-spin text-primary" />
              <p class="mt-2 text-sm text-muted-foreground">Loading schedule...</p>
            </div>
          </div>

          <div v-else class="space-y-6">
            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Basic Information</h2>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="mb-2 block text-sm font-medium">Schedule Name</label>
                  <UInput
                    v-model="form.name"
                    placeholder="e.g., Daily Restart"
                    size="lg"
                  />
                </div>

                <div>
                  <label class="mb-2 block text-sm font-medium">Action Type</label>
                  <div class="grid gap-3 md:grid-cols-3">
                    <div
                      v-for="action in actionTypes"
                      :key="action.value"
                      class="cursor-pointer rounded-lg border p-4 transition"
                      :class="form.action === action.value ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/50'"
                      @click="form.action = action.value"
                    >
                      <div class="flex items-center gap-2">
                        <input
                          type="radio"
                          :checked="form.action === action.value"
                          class="text-primary"
                        >
                        <span class="font-medium">{{ action.label }}</span>
                      </div>
                      <p class="mt-1 text-xs text-muted-foreground">{{ action.description }}</p>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <USwitch v-model="form.enabled" />
                  <label class="text-sm font-medium">Enable this schedule</label>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold">Schedule Timing</h2>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="mb-2 block text-sm font-medium">Cron Expression</label>
                  <UInput
                    v-model="form.cron"
                    placeholder="* * * * *"
                    size="lg"
                    class="font-mono"
                  />
                  <p class="mt-2 text-xs text-muted-foreground">
                    {{ parseCron(form.cron) }}
                  </p>
                </div>

                <div>
                  <label class="mb-2 block text-sm font-medium">Quick Presets</label>
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
                  <h3 class="mb-2 text-sm font-semibold">Cron Format</h3>
                  <div class="space-y-1 text-xs text-muted-foreground">
                    <p><code class="rounded bg-background px-1 py-0.5">* * * * *</code></p>
                    <p>│ │ │ │ │</p>
                    <p>│ │ │ │ └─ Day of week (0-7, Sunday = 0 or 7)</p>
                    <p>│ │ │ └─── Month (1-12)</p>
                    <p>│ │ └───── Day of month (1-31)</p>
                    <p>│ └─────── Hour (0-23)</p>
                    <p>└───────── Minute (0-59)</p>
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
