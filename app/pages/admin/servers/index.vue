<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  auth: true,
  layout: 'admin',
  adminTitle: 'Servers',
  adminSubtitle: 'Global view of panel servers synchronized with Wings',
})

interface AdminServerRow {
  id: string
  uuid: string
  identifier: string
  external_id: string | null
  name: string
  description: string | null
  status: string | null
  suspended: boolean
  owner: {
    id: string
    username: string
    email: string
  } | null
  node: {
    id: string
    name: string
  } | null
  egg: {
    id: string
    name: string
  } | null
  nest: {
    id: string
    name: string
  } | null
  created_at: Date | string
  updated_at: Date | string
}

const { t } = useI18n()
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const NuxtLink = resolveComponent('NuxtLink')
const toast = useToast()
const router = useRouter()

const {
  data: serversResponse,
  pending: serversPending,
  refresh: refreshServers,
} = await useFetch<{ data: AdminServerRow[]; meta: { pagination: { total: number; count: number; per_page: number; current_page: number; total_pages: number } } }>('/api/admin/servers')

const servers = computed(() => serversResponse.value?.data ?? [])

const isDeleting = ref<Record<string, boolean>>({})
const deleteConfirmOpen = ref(false)
const serverToDelete = ref<AdminServerRow | null>(null)

function confirmDelete(server: AdminServerRow) {
  serverToDelete.value = server
  deleteConfirmOpen.value = true
}

async function deleteServer(close?: () => void) {
  const server = serverToDelete.value
  if (!server || isDeleting.value[server.id]) {
    return
  }

  isDeleting.value[server.id] = true
  if (close) {
    close()
  } else {
    deleteConfirmOpen.value = false
  }

  try {
    await $fetch(`/api/admin/servers/${server.id}`, {
      method: 'DELETE',
    })

    toast.add({
      title: t('admin.servers.delete.serverDeleted'),
      description: t('admin.servers.delete.serverDeletedDescription', { name: server.name }),
      color: 'success',
    })

    await refreshServers()
  } catch (error) {
    const message = error instanceof Error ? error.message : t('admin.servers.delete.failedToDeleteServer')
    toast.add({
      title: t('admin.servers.delete.deleteFailed'),
      description: message,
      color: 'error',
    })
  } finally {
    isDeleting.value[server.id] = false
    serverToDelete.value = null
  }
}

function getStatusColor(status: string | null): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'installed':
      return 'success'
    case 'installing':
      return 'warning'
    case 'install_failed':
    case 'deletion_failed':
      return 'error'
    default:
      return 'neutral'
  }
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return t('common.na')
  }
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const columns = computed<TableColumn<AdminServerRow>[]>(() => [
  {
    accessorKey: 'name',
    header: t('common.server'),
    cell: ({ row }) => {
      const server = row.original
      return h('div', { class: 'space-y-1' }, [
        h(NuxtLink, {
          to: `/admin/servers/${server.id}`,
          class: 'text-sm font-semibold text-primary hover:underline',
        }, () => server.name),
        h('p', { class: 'text-xs text-muted-foreground font-mono' }, `${t('admin.servers.uuid')}: ${server.uuid}`),
      ])
    },
  },
  {
    accessorKey: 'identifier',
    header: t('admin.nodes.identifier'),
    cell: ({ row }) => h('span', { class: 'text-xs font-mono text-muted-foreground' }, row.getValue('identifier')),
  },
  {
    accessorKey: 'node',
    header: t('admin.nodes.node'),
    cell: ({ row }) => {
      const node = row.original.node
      return h('span', { class: 'text-sm' }, node?.name || t('common.notAssigned'))
    },
  },
  {
    accessorKey: 'status',
    header: t('common.status'),
    cell: ({ row }) => {
      const status = row.getValue('status') as string | null
      const color = getStatusColor(status)
      return h(UBadge, {
        size: 'xs',
        color,
        variant: 'subtle',
      }, () => status || t('common.unknown'))
    },
  },
  {
    accessorKey: 'owner',
    header: t('admin.servers.owner'),
    cell: ({ row }) => {
      const owner = row.original.owner
      return h('span', { class: 'text-sm' }, owner?.username || t('common.unknown'))
    },
  },
  {
    accessorKey: 'created_at',
    header: t('common.created'),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as Date | string
      return h('span', { class: 'text-sm text-muted-foreground' }, formatDate(date))
    },
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row }) => {
      const server = row.original
      const items = [
        {
          type: 'label' as const,
          label: t('common.actions'),
        },
        {
          label: t('admin.servers.viewDetails'),
          icon: 'i-lucide-eye',
          onSelect: () => {
            router.push(`/admin/servers/${server.id}`)
          },
        },
        {
          type: 'separator' as const,
        },
        {
          label: t('admin.servers.delete.deleteServer'),
          icon: 'i-lucide-trash',
          color: 'error' as const,
          disabled: isDeleting.value[server.id],
          onSelect: () => {
            confirmDelete(server)
          },
        },
      ]

      return h('div', { class: 'text-right' }, h(UDropdownMenu, {
        'content': {
          align: 'end',
        },
        items,
        'aria-label': t('admin.servers.serverActions'),
      }, () => h(UButton, {
        'icon': 'i-lucide-ellipsis-vertical',
        'color': 'neutral',
        'variant': 'ghost',
        'class': 'ml-auto',
        'aria-label': t('admin.servers.actionsDropdown'),
        'disabled': isDeleting.value[server.id],
      })))
    },
  },
])

const table = useTemplateRef('table')
</script>

<template>
  <div>
    <UPage>
      <UPageBody>
        <UContainer>
          <section class="space-y-6">
            <UCard :ui="{ body: 'space-y-3' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">{{ t('admin.servers.serverInventory') }}</h2>
                  <UButton icon="i-lucide-plus" color="primary" variant="subtle" to="/admin/servers/create">
                    {{ t('admin.servers.createServer') }}
                  </UButton>
                </div>
              </template>

              <UTable
                ref="table"
                :data="servers"
                :columns="columns"
                :loading="serversPending"
                class="flex-1"
              >
                <template #empty>
                  <div class="p-4 text-sm text-muted-foreground">
                    {{ t('admin.servers.noServersFound') }}
                  </div>
                </template>
              </UTable>
            </UCard>
          </section>
        </UContainer>
      </UPageBody>
    </UPage>

    <UModal
      v-model:open="deleteConfirmOpen"
      :title="t('admin.servers.delete.title')"
      :description="t('admin.servers.delete.description')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p class="text-sm text-muted-foreground">
          {{ t('admin.servers.delete.confirmDeleteServer', { name: serverToDelete?.name }) }}
        </p>
      </template>

      <template #footer="{ close }">
        <UButton
          color="neutral"
          variant="outline"
          :label="t('common.cancel')"
          @click="close"
        />
        <UButton
          color="error"
          :label="t('admin.servers.delete.deleteServer')"
          :loading="serverToDelete ? isDeleting[serverToDelete.id] : false"
          @click="deleteServer(close)"
        />
      </template>
    </UModal>
  </div>
</template>
