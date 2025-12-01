<script setup lang="ts">
import type { CreateServerPayload } from '#shared/types/admin'
import type { Nest, Egg, EggVariable } from '#shared/types/nest'


import type { NodeOption, UserOption } from '#shared/types/ui'

definePageMeta({
  auth: true,
  layout: 'admin',
})

const { t } = useI18n()
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

const { data: nodesData } = await useAsyncData(
  'admin-nodes-for-server',
  () => $fetch<{ data: NodeOption[] }>('/api/wings/nodes'),
)

const { data: usersData } = await useAsyncData(
  'admin-users-for-server',
  () => $fetch<{ data: UserOption[] }>('/api/admin/users'),
)

const authStore = useAuthStore()
const currentUser = computed(() => authStore.user)

const nests = computed(() => nestsData.value?.data ?? [])
const nodes = computed(() => nodesData.value?.data ?? [])
const users = computed(() => usersData.value?.data ?? [])

const nestSelectItems = computed(() => {
  return nests.value.map((n: Nest) => ({
    label: n.name,
    value: n.id,
  }))
})

const eggSelectItems = computed(() => {
  return availableEggs.value.map((e: Egg) => ({
    label: e.name,
    value: e.id,
  }))
})

const nodeSelectItems = computed(() => {
  return nodes.value.map((n: NodeOption) => ({
    label: n.name,
    value: n.id,
  }))
})

const allocationSelectItems = computed(() => {
  return availableAllocations.value.map(alloc => ({
    label: `${alloc.ip}:${alloc.port}`,
    value: alloc.id,
    description: `IP: ${alloc.ip} | Port: ${alloc.port}`,
  }))
})

const userSelectItems = computed(() => {
  return users.value.map((u: UserOption) => ({
    label: u.username,
    value: u.id,
    description: u.email,
  }))
})

watch(() => currentUser.value?.id, (userId) => {
  if (userId && !form.value.ownerId) {
    form.value.ownerId = userId
  }
}, { immediate: true })

const selectedNest = ref<Nest | null>(null)
const availableEggs = ref<Egg[]>([])
const selectedEgg = ref<Egg | null>(null)
const eggVariables = ref<EggVariable[]>([])

const availableAllocations = ref<Array<{ id: string; ip: string; port: number }>>([])
const isLoadingAllocations = ref(false)

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

watch(() => form.value.nodeId, async (nodeId) => {
  if (!nodeId) {
    availableAllocations.value = []
    form.value.allocationId = ''
    return
  }

  isLoadingAllocations.value = true
  try {
    const response = await $fetch<{ data: Array<{ id: string; ip: string; port: number; serverId: string | null; isPrimary: boolean }> }>(`/api/admin/wings/nodes/${nodeId}/allocations`, {
      query: { perPage: 1000 },
    })
    availableAllocations.value = response.data
      .filter(alloc => !alloc.serverId)
      .map(alloc => ({
        id: alloc.id,
        ip: alloc.ip,
        port: alloc.port,
      }))
  } catch (err) {
    console.error('Failed to load allocations', err)
    availableAllocations.value = []
  } finally {
    isLoadingAllocations.value = false
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
            <UFormField :label="t('admin.servers.create.serverName')" name="name" required>
              <UInput v-model="form.name" :placeholder="t('admin.servers.create.serverNamePlaceholder')" required class="w-full" />
              <template #help>
                {{ t('admin.servers.create.serverNameHelp') }}
              </template>
            </UFormField>

            <UFormField :label="t('admin.servers.create.description')" name="description">
              <UTextarea v-model="form.description" :placeholder="t('admin.servers.create.descriptionPlaceholder')" class="w-full" />
            </UFormField>

            <UFormField :label="t('admin.servers.create.serverOwner')" name="ownerId" required>
              <USelectMenu 
                v-model="form.ownerId" 
                :items="userSelectItems"
                value-key="value"
                :placeholder="t('admin.servers.create.serverOwnerPlaceholder')"
                :search-input="{ placeholder: t('admin.servers.create.serverOwnerSearchPlaceholder') }"
                :filter-fields="['label', 'description']"
              >
                <template #item-label="{ item }">
                  <div class="flex flex-col">
                    <span>{{ item.label }}</span>
                    <span v-if="item.description" class="text-xs text-muted-foreground">{{ item.description }}</span>
                  </div>
                </template>
              </USelectMenu>
              <template #help>
                {{ t('admin.servers.create.serverOwnerHelp') }}
              </template>
            </UFormField>
          </div>

          <div v-if="currentStep === 2" class="space-y-4">
            <UFormField :label="t('admin.servers.create.selectNest')" name="nestId" required>
              <USelect 
                v-model="form.nestId" 
                :items="nestSelectItems"
                value-key="value"
                :placeholder="t('admin.servers.create.selectNestPlaceholder')" 
                required 
                class="w-full"
              />
              <template #help>
                {{ t('admin.servers.create.selectNestHelp') }}
              </template>
            </UFormField>

            <UFormField v-if="form.nestId" :label="t('admin.servers.create.selectEgg')" name="eggId" required>
              <USelect 
                v-model="form.eggId" 
                :items="eggSelectItems"
                value-key="value"
                :placeholder="t('admin.servers.create.selectEggPlaceholder')" 
                required 
                :disabled="availableEggs.length === 0"
                class="w-full"
              />
              <template #help>
                {{ t('admin.servers.create.selectEggHelp') }}
              </template>
            </UFormField>

            <UAlert v-if="selectedEgg" color="primary" icon="i-lucide-info">
              <template #title>{{ selectedEgg.name }}</template>
              <template #description>
                <p v-if="selectedEgg.description" class="text-sm">
                  {{ selectedEgg.description }}
                </p>
                <p class="mt-2 text-xs">
                  {{ t('admin.servers.create.dockerImage') }}: <code class="rounded bg-primary/10 px-1">{{ selectedEgg.dockerImage }}</code>
                </p>
              </template>
            </UAlert>
          </div>

          <div v-if="currentStep === 3" class="space-y-4">
            <UFormField :label="t('admin.servers.create.selectNode')" name="nodeId" required>
              <USelect 
                v-model="form.nodeId" 
                :items="nodeSelectItems"
                value-key="value"
                :placeholder="t('admin.servers.create.selectNodePlaceholder')" 
                required 
                class="w-full"
              />
              <template #help>
                {{ t('admin.servers.create.selectNodeHelp') }}
              </template>
            </UFormField>

            <div v-if="nodes.length === 0" class="rounded-lg border border-warning bg-warning/10 p-4">
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-warning" />
                <div>
                  <p class="font-medium text-warning">{{ t('admin.servers.create.noNodesAvailable') }}</p>
                  <p class="mt-1 text-sm text-muted-foreground">
                    {{ t('admin.servers.create.noNodesAvailableDescription') }}
                  </p>
                  <NuxtLink to="/admin/nodes" class="mt-2 inline-block text-sm text-primary hover:underline">
                    {{ t('admin.servers.create.goToNodes') }}
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <div v-if="currentStep === 4" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <UFormField :label="t('admin.servers.create.memory')" name="memory" required>
                <UInput v-model.number="form.memory" type="number" :placeholder="t('admin.servers.create.memoryPlaceholder')" required class="w-full" />
                <template #help>
                  {{ t('admin.servers.create.memoryHelp') }}
                </template>
              </UFormField>

              <UFormField :label="t('admin.servers.create.swap')" name="swap">
                <UInput v-model.number="form.swap" type="number" :placeholder="t('admin.servers.create.swapPlaceholder')" class="w-full" />
                <template #help>
                  {{ t('admin.servers.create.swapHelp') }}
                </template>
              </UFormField>

              <UFormField :label="t('admin.servers.create.diskSpace')" name="disk" required>
                <UInput v-model.number="form.disk" type="number" :placeholder="t('admin.servers.create.diskSpacePlaceholder')" required class="w-full" />
                <template #help>
                  {{ t('admin.servers.create.diskSpaceHelp') }}
                </template>
              </UFormField>

              <UFormField :label="t('admin.servers.create.cpuLimit')" name="cpu" required>
                <UInput v-model.number="form.cpu" type="number" :placeholder="t('admin.servers.create.cpuLimitPlaceholder')" required class="w-full" />
                <template #help>
                  {{ t('admin.servers.create.cpuLimitHelp') }}
                </template>
              </UFormField>

              <UFormField :label="t('admin.servers.create.ioWeight')" name="io">
                <UInput v-model.number="form.io" type="number" :placeholder="t('admin.servers.create.ioWeightPlaceholder')" class="w-full" />
                <template #help>
                  {{ t('admin.servers.create.ioWeightHelp') }}
                </template>
              </UFormField>

              <UFormField :label="t('admin.servers.create.cpuThreads')" name="threads">
                <UInput v-model="form.threads" :placeholder="t('admin.servers.create.cpuThreadsPlaceholder')" class="w-full" />
                <template #help>
                  {{ t('admin.servers.create.cpuThreadsHelp') }}
                </template>
              </UFormField>
            </div>

            <UFormField :label="t('admin.servers.create.oomKiller')" name="oomDisabled">
              <USwitch v-model="form.oomDisabled" />
              <template #help>
                {{ t('admin.servers.create.oomKillerHelp') }}
              </template>
            </UFormField>
          </div>

          <div v-if="currentStep === 5" class="space-y-4">
            <UFormField :label="t('admin.servers.create.primaryAllocation')" name="allocationId" required>
              <USelectMenu 
                v-model="form.allocationId" 
                :items="allocationSelectItems"
                value-key="value"
                :placeholder="t('admin.servers.create.primaryAllocationPlaceholder')"
                :disabled="!form.nodeId || isLoadingAllocations || availableAllocations.length === 0"
                :loading="isLoadingAllocations"
                class="w-full"
              >
                <template #item-label="{ item }">
                  <div class="flex flex-col">
                    <span class="font-mono">{{ item.label }}</span>
                    <span v-if="item.description" class="text-xs text-muted-foreground">{{ item.description }}</span>
                  </div>
                </template>
              </USelectMenu>
              <template #help>
                <span v-if="!form.nodeId">{{ t('admin.servers.create.primaryAllocationHelpSelectNode') }}</span>
                <span v-else-if="isLoadingAllocations">{{ t('admin.servers.create.primaryAllocationHelpLoading') }}</span>
                <span v-else-if="availableAllocations.length === 0">{{ t('admin.servers.create.primaryAllocationHelpNoAllocations') }}</span>
                <span v-else>{{ t('admin.servers.create.primaryAllocationHelp') }}</span>
              </template>
            </UFormField>

            <UAlert v-if="form.nodeId && availableAllocations.length === 0 && !isLoadingAllocations" color="warning" icon="i-lucide-alert-triangle">
              <template #title>{{ t('admin.servers.create.noAvailableAllocations') }}</template>
              <template #description>
                {{ t('admin.servers.create.noAvailableAllocationsDescription') }}
                <NuxtLink :to="`/admin/nodes/${form.nodeId}`" class="mt-2 inline-block text-sm text-primary hover:underline">
                  {{ t('admin.servers.create.goToNodeAllocations') }}
                </NuxtLink>
              </template>
            </UAlert>

            <UFormField :label="t('admin.servers.create.startupCommand')" name="startup">
              <UTextarea v-model="form.startup"
                :placeholder="selectedEgg?.startup || t('admin.servers.create.startupCommandPlaceholder')" class="w-full" />
              <template #help>
                {{ t('admin.servers.create.startupCommandHelp') }}
              </template>
            </UFormField>

            <div v-if="eggVariables.length > 0" class="space-y-3">
              <h3 class="text-sm font-semibold">{{ t('admin.servers.create.environmentVariables') }}</h3>
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
              <UFormField :label="t('admin.servers.create.skipInstallScripts')" name="skipScripts">
                <USwitch v-model="form.skipScripts" />
              </UFormField>

              <UFormField :label="t('admin.servers.create.startAfterInstall')" name="startOnCompletion">
                <USwitch v-model="form.startOnCompletion" />
              </UFormField>
            </div>
          </div>

          <div v-if="currentStep === 6" class="space-y-4">
            <UAlert color="primary" icon="i-lucide-info">
              <template #title>{{ t('admin.servers.create.reviewConfiguration') }}</template>
              <template #description>
                {{ t('admin.servers.create.reviewConfigurationDescription') }}
              </template>
            </UAlert>

            <div class="space-y-3 rounded-lg border border-default p-4">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.serverNameLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">{{ form.name }}</span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.ownerLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">
                    {{users.find((u: any) => u.id === form.ownerId)?.username}}
                  </span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.nestLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">{{ selectedNest?.name }}</span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.eggLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">{{ selectedEgg?.name }}</span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.nodeLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">
                    {{nodes.find((n: any) => n.id === form.nodeId)?.name}}
                  </span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.memoryLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">{{ form.memory }} MB</span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.diskLabel') }}</span>
                  <span class="ml-2 text-muted-foreground">{{ form.disk }} MB</span>
                </div>
                <div>
                  <span class="font-medium">{{ t('admin.servers.create.cpuLabel') }}</span>
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
                <UButton variant="ghost" color="error" @click="router.push('/admin/servers')">
                  Cancel
                </UButton>

                <UButton v-if="currentStep < totalSteps" color="primary" variant="subtle" :disabled="!canProceed(currentStep)"
                  @click="nextStep">
                  Next
                  <UIcon name="i-lucide-chevron-right" class="ml-1 size-4" />
                </UButton>

                <UButton v-else color="primary" variant="subtle" :loading="isSubmitting" @click="createServer">
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
