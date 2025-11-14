<script setup lang="ts">
import type { CreateServerPayload } from '#shared/types/admin-servers'
import type { Nest, Egg, EggVariable } from '#shared/types/nest'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const toast = useToast()
const router = useRouter()

const currentStep = ref(1)
const totalSteps = 6
const isSubmitting = ref(false)

const form = ref<Partial<CreateServerPayload>>({
  name: '',
  description: '',
  ownerId: '',
  eggId: '',
  nestId: '',
  nodeId: '',
  memory: 1024,
  swap: 0,
  disk: 5120,
  io: 500,
  cpu: 100,
  allocationId: '',
  startup: '',
  environment: {},
  dockerImage: '',
  skipScripts: false,
  startOnCompletion: true,
  oomDisabled: false,
})

const { data: nestsData } = await useAsyncData(
  'admin-nests-for-server',
  () => $fetch<{ data: Nest[] }>('/api/admin/nests'),
)

interface NodeOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  username: string
}

const { data: nodesData } = await useAsyncData(
  'admin-nodes-for-server',
  () => $fetch<{ data: NodeOption[] }>('/api/admin/nodes'),
)

const { data: usersData } = await useAsyncData(
  'admin-users-for-server',
  () => $fetch<{ data: UserOption[] }>('/api/admin/users'),
)

const nests = computed(() => nestsData.value?.data ?? [])
const nodes = computed(() => nodesData.value?.data ?? [])
const users = computed(() => usersData.value?.data ?? [])

const selectedNest = ref<Nest | null>(null)
const availableEggs = ref<Egg[]>([])
const selectedEgg = ref<Egg | null>(null)
const eggVariables = ref<EggVariable[]>([])

watch(() => form.value.nestId, async (nestId) => {
  if (!nestId) {
    availableEggs.value = []
    selectedNest.value = null
    return
  }

  try {
    const response = await $fetch<{ data: Nest & { eggs: Egg[] } }>(`/api/admin/nests/${nestId}`)
    selectedNest.value = response.data
    availableEggs.value = response.data.eggs || []
  } catch (err) {
    console.error('Failed to load eggs', err)
    availableEggs.value = []
  }
})

watch(() => form.value.eggId, async (eggId) => {
  if (!eggId) {
    selectedEgg.value = null
    eggVariables.value = []
    return
  }

  try {
    const response = await $fetch<{ data: Egg & { variables: EggVariable[] } }>(`/api/admin/eggs/${eggId}`)
    selectedEgg.value = response.data
    eggVariables.value = response.data.variables || []

    form.value.startup = response.data.startup
    form.value.dockerImage = response.data.dockerImage

    const env: Record<string, string> = {}
    eggVariables.value.forEach((variable: EggVariable) => {
      env[variable.envVariable] = variable.defaultValue || ''
    })
    form.value.environment = env
  } catch (err) {
    console.error('Failed to load egg', err)
    selectedEgg.value = null
    eggVariables.value = []
  }
})

function canProceed(step: number): boolean {
  switch (step) {
    case 1:
      return !!(form.value.name && form.value.ownerId)
    case 2:
      return !!(form.value.nestId && form.value.eggId)
    case 3:
      return !!(form.value.nodeId)
    case 4:
      return !!(form.value.memory && form.value.disk && form.value.cpu)
    case 5:
      return !!(form.value.allocationId)
    case 6:
      return true
    default:
      return false
  }
}

function nextStep() {
  if (!canProceed(currentStep.value)) {
    toast.add({ title: 'Please fill in all required fields', color: 'error' })
    return
  }

  if (currentStep.value < totalSteps) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

async function createServer() {
  if (!canProceed(currentStep.value)) {
    toast.add({ title: 'Please complete all steps', color: 'error' })
    return
  }

  isSubmitting.value = true

  try {
    const response = await $fetch('/api/admin/servers', {
      method: 'POST',
      body: form.value as CreateServerPayload,
    })

    toast.add({ title: 'Server created successfully', color: 'success' })
    router.push(`/admin/servers/${response.data.id}`)
  } catch (err) {
    toast.add({
      title: 'Failed to create server',
      description: err instanceof Error ? err.message : 'An error occurred',
      color: 'error',
    })
  } finally {
    isSubmitting.value = false
  }
}

const stepTitles = [
  'Basic Information',
  'Select Nest & Egg',
  'Choose Node',
  'Configure Resources',
  'Allocations & Startup',
  'Review & Create',
]
</script>

<template>
  <UPage>
    <UPageBody>
      <div class="mx-auto max-w-4xl space-y-6">
        <header>
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <NuxtLink to="/admin/servers" class="hover:text-foreground">Servers</NuxtLink>
            <UIcon name="i-lucide-chevron-right" class="size-4" />
            <span>Create Server</span>
          </div>
          <h1 class="mt-2 text-2xl font-bold">Create New Server</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Follow the steps below to create a new game server
          </p>
        </header>

        <UCard>
          <div class="flex items-center justify-between">
            <div v-for="step in totalSteps" :key="step" class="flex flex-1 items-center">
              <div class="flex flex-col items-center">
                <div
                  class="flex size-10 items-center justify-center rounded-full border-2 font-semibold transition-colors"
                  :class="step === currentStep
                      ? 'border-primary bg-primary text-primary-foreground'
                      : step < currentStep
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-muted bg-background text-muted-foreground'
                    ">
                  <UIcon v-if="step < currentStep" name="i-lucide-check" class="size-5" />
                  <span v-else>{{ step }}</span>
                </div>
                <span class="mt-2 text-xs font-medium"
                  :class="step === currentStep ? 'text-foreground' : 'text-muted-foreground'">
                  {{ stepTitles[step - 1] }}
                </span>
              </div>
              <div v-if="step < totalSteps" class="mx-2 h-0.5 flex-1 transition-colors"
                :class="step < currentStep ? 'bg-primary' : 'bg-muted'" />
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">{{ stepTitles[currentStep - 1] }}</h2>
          </template>

          <div v-if="currentStep === 1" class="space-y-4">
            <UFormField label="Server Name" name="name" required>
              <UInput v-model="form.name" placeholder="My Minecraft Server" required class="w-full" />
              <template #help>
                A unique name for this server
              </template>
            </UFormField>

            <UFormField label="Description" name="description">
              <UTextarea v-model="form.description" placeholder="A fun survival server for friends" class="w-full" />
            </UFormField>

            <UFormField label="Server Owner" name="ownerId" required>
              <USelect v-model="form.ownerId" :options="users.map((u: any) => ({ label: u.username, value: u.id }))"
                placeholder="Select owner" required />
              <template #help>
                The user who will own this server
              </template>
            </UFormField>
          </div>

          <div v-if="currentStep === 2" class="space-y-4">
            <UFormField label="Select Nest" name="nestId" required>
              <USelect v-model="form.nestId" :options="nests.map((n: any) => ({ label: n.name, value: n.id }))"
                placeholder="Select nest" required />
              <template #help>
                Choose the game type category
              </template>
            </UFormField>

            <UFormField v-if="form.nestId" label="Select Egg" name="eggId" required>
              <USelect v-model="form.eggId" :options="availableEggs.map((e: Egg) => ({ label: e.name, value: e.id }))"
                placeholder="Select egg" required :disabled="availableEggs.length === 0" />
              <template #help>
                Choose the specific server type
              </template>
            </UFormField>

            <UAlert v-if="selectedEgg" color="primary" icon="i-lucide-info">
              <template #title>{{ selectedEgg.name }}</template>
              <template #description>
                <p v-if="selectedEgg.description" class="text-sm">
                  {{ selectedEgg.description }}
                </p>
                <p class="mt-2 text-xs">
                  Docker Image: <code class="rounded bg-primary/10 px-1">{{ selectedEgg.dockerImage }}</code>
                </p>
              </template>
            </UAlert>
          </div>

          <div v-if="currentStep === 3" class="space-y-4">
            <UFormField label="Select Node" name="nodeId" required>
              <USelect v-model="form.nodeId" :options="nodes.map((n: any) => ({ label: n.name, value: n.id }))"
                placeholder="Select node" required />
              <template #help>
                Choose which node will host this server
              </template>
            </UFormField>

            <div v-if="nodes.length === 0" class="rounded-lg border border-warning bg-warning/10 p-4">
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-warning" />
                <div>
                  <p class="font-medium text-warning">No nodes available</p>
                  <p class="mt-1 text-sm text-muted-foreground">
                    You need to create at least one node before creating servers.
                  </p>
                  <NuxtLink to="/admin/nodes" class="mt-2 inline-block text-sm text-primary hover:underline">
                    Go to Nodes →
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <div v-if="currentStep === 4" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Memory (MB)" name="memory" required>
                <UInput v-model.number="form.memory" type="number" placeholder="1024" required class="w-full" />
                <template #help>
                  RAM allocated to the server
                </template>
              </UFormField>

              <UFormField label="Swap (MB)" name="swap">
                <UInput v-model.number="form.swap" type="number" placeholder="0" class="w-full" />
                <template #help>
                  Swap memory (0 to disable)
                </template>
              </UFormField>

              <UFormField label="Disk Space (MB)" name="disk" required>
                <UInput v-model.number="form.disk" type="number" placeholder="5120" required class="w-full" />
                <template #help>
                  Storage space for the server
                </template>
              </UFormField>

              <UFormField label="CPU Limit (%)" name="cpu" required>
                <UInput v-model.number="form.cpu" type="number" placeholder="100" required class="w-full" />
                <template #help>
                  CPU usage limit (100 = 1 core)
                </template>
              </UFormField>

              <UFormField label="I/O Weight" name="io">
                <UInput v-model.number="form.io" type="number" placeholder="500" class="w-full" />
                <template #help>
                  Block I/O weight (10-1000)
                </template>
              </UFormField>

              <UFormField label="CPU Threads" name="threads">
                <UInput v-model="form.threads" placeholder="0,1,2,3" class="w-full" />
                <template #help>
                  Specific CPU threads (optional)
                </template>
              </UFormField>
            </div>

            <UFormField label="OOM Killer" name="oomDisabled">
              <UToggle v-model="form.oomDisabled" />
              <template #help>
                Disable Out-of-Memory killer (not recommended)
              </template>
            </UFormField>
          </div>

          <div v-if="currentStep === 5" class="space-y-4">
            <UFormField label="Primary Allocation" name="allocationId" required>
              <UInput v-model="form.allocationId" placeholder="Allocation ID (temporary - needs allocation selector)"
                required class="w-full" />
              <template #help>
                The primary IP:Port for this server
              </template>
            </UFormField>

            <UAlert color="warning" icon="i-lucide-info">
              <template #title>Allocation Management</template>
              <template #description>
                Allocation selection UI will be implemented in a future update.
                For now, you'll need to manually enter an allocation ID.
              </template>
            </UAlert>

            <UFormField label="Startup Command" name="startup">
              <UTextarea v-model="form.startup"
                :placeholder="selectedEgg?.startup || 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar'" class="w-full" />
              <template #help>
                Command to start the server (uses egg default if empty)
              </template>
            </UFormField>

            <div v-if="eggVariables.length > 0" class="space-y-3">
              <h3 class="text-sm font-semibold">Environment Variables</h3>
              <div v-for="variable in eggVariables" :key="variable.id" class="space-y-1">
                <UFormField :label="variable.name" :name="variable.envVariable">
                  <UInput v-model="form.environment![variable.envVariable]"
                    :placeholder="variable.defaultValue || ''" />
                  <template v-if="variable.description" #help>
                    {{ variable.description }}
                  </template>
                </UFormField>
              </div>
            </div>

            <div class="flex gap-4">
              <UFormField label="Skip Install Scripts" name="skipScripts">
                <UToggle v-model="form.skipScripts" />
              </UFormField>

              <UFormField label="Start After Install" name="startOnCompletion">
                <UToggle v-model="form.startOnCompletion" />
              </UFormField>
            </div>
          </div>

          <div v-if="currentStep === 6" class="space-y-4">
            <UAlert color="primary" icon="i-lucide-info">
              <template #title>Review Your Configuration</template>
              <template #description>
                Please review all settings before creating the server
              </template>
            </UAlert>

            <div class="space-y-3 rounded-lg border border-default p-4">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="font-medium">Server Name:</span>
                  <span class="ml-2 text-muted-foreground">{{ form.name }}</span>
                </div>
                <div>
                  <span class="font-medium">Owner:</span>
                  <span class="ml-2 text-muted-foreground">
                    {{users.find((u: any) => u.id === form.ownerId)?.username}}
                  </span>
                </div>
                <div>
                  <span class="font-medium">Nest:</span>
                  <span class="ml-2 text-muted-foreground">{{ selectedNest?.name }}</span>
                </div>
                <div>
                  <span class="font-medium">Egg:</span>
                  <span class="ml-2 text-muted-foreground">{{ selectedEgg?.name }}</span>
                </div>
                <div>
                  <span class="font-medium">Node:</span>
                  <span class="ml-2 text-muted-foreground">
                    {{nodes.find((n: any) => n.id === form.nodeId)?.name}}
                  </span>
                </div>
                <div>
                  <span class="font-medium">Memory:</span>
                  <span class="ml-2 text-muted-foreground">{{ form.memory }} MB</span>
                </div>
                <div>
                  <span class="font-medium">Disk:</span>
                  <span class="ml-2 text-muted-foreground">{{ form.disk }} MB</span>
                </div>
                <div>
                  <span class="font-medium">CPU:</span>
                  <span class="ml-2 text-muted-foreground">{{ form.cpu }}%</span>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-between">
              <UButton v-if="currentStep > 1" variant="ghost" @click="prevStep">
                <UIcon name="i-lucide-chevron-left" class="mr-1 size-4" />
                Previous
              </UButton>
              <div v-else />

              <div class="flex gap-2">
                <UButton variant="ghost" @click="router.push('/admin/servers')">
                  Cancel
                </UButton>

                <UButton v-if="currentStep < totalSteps" color="primary" :disabled="!canProceed(currentStep)"
                  @click="nextStep">
                  Next
                  <UIcon name="i-lucide-chevron-right" class="ml-1 size-4" />
                </UButton>

                <UButton v-else color="primary" :loading="isSubmitting" @click="createServer">
                  <UIcon name="i-lucide-rocket" class="mr-1 size-4" />
                  Create Server
                </UButton>
              </div>
            </div>
          </template>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>
