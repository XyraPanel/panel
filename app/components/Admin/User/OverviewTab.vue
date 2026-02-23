<script setup lang="ts">
import { computed } from 'vue';
import type { AdminUserProfilePayload } from '#shared/types/admin';

interface Props {
  profile: AdminUserProfilePayload | undefined;
}

const props = defineProps<Props>();

const user = computed(() => props.profile?.user);
const stats = computed(
  () =>
    props.profile?.stats ?? {
      serverCount: 0,
      apiKeyCount: 0,
    },
);
const security = computed(
  () =>
    props.profile?.security ?? {
      sessions: [],
      lastLogin: null,
      lastLoginIp: null,
      uniqueIps: [],
      activeSessions: 0,
      securityEvents: [],
    },
);

const isSuspended = computed(() => Boolean(user.value?.suspended));
const hasTwoFactor = computed(() => Boolean(user.value?.twoFactorEnabled));
const requiresPasswordReset = computed(() => Boolean(user.value?.passwordResetRequired));

function maskIp(ip: string) {
  if (!ip || ip === 'Unknown') return 'Unknown';
  return '**********';
}
</script>

<template>
  <div class="space-y-4">
    <UCard :ui="{ body: 'space-y-6' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-lg font-semibold">Profile overview</h2>
            <p class="text-xs text-muted-foreground">
              Consolidated account metadata, status, and metrics.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              v-if="user?.rootAdmin"
              size="sm"
              color="error"
              variant="subtle"
              class="uppercase"
              >Root admin</UBadge
            >
            <UBadge
              :color="user?.role === 'admin' ? 'error' : 'primary'"
              size="sm"
              variant="subtle"
              class="uppercase"
              >{{ user?.role?.toUpperCase() }}</UBadge
            >
            <UBadge v-if="isSuspended" size="sm" color="error" variant="solid" class="uppercase"
              >Suspended</UBadge
            >
            <UBadge
              v-if="requiresPasswordReset"
              size="sm"
              color="warning"
              variant="subtle"
              class="uppercase"
              >Reset required</UBadge
            >
          </div>
        </div>
      </template>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UCard variant="subtle" :ui="{ body: 'p-3 space-y-1' }">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">Owned servers</p>
          <p class="text-sm font-semibold">{{ stats.serverCount }}</p>
        </UCard>
        <UCard variant="subtle" :ui="{ body: 'p-3 space-y-1' }">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">API keys</p>
          <p class="text-sm font-semibold">{{ stats.apiKeyCount }}</p>
        </UCard>
        <UCard variant="subtle" :ui="{ body: 'p-3 space-y-1' }">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">Email verified</p>
          <UBadge size="sm" :color="user?.emailVerified ? 'success' : 'warning'" variant="subtle">
            {{ user?.emailVerified ? 'Yes' : 'No' }}
          </UBadge>
        </UCard>
        <UCard variant="subtle" :ui="{ body: 'p-3 space-y-1' }">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">Two-factor</p>
          <UBadge size="sm" :color="hasTwoFactor ? 'success' : 'warning'" variant="subtle">
            {{ hasTwoFactor ? 'Enabled' : 'Disabled' }}
          </UBadge>
        </UCard>
      </div>

      <USeparator />

      <div class="grid gap-4 md:grid-cols-2">
        <dl class="space-y-3 text-sm">
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Username</dt>
            <dd class="font-medium">{{ user?.username }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Email</dt>
            <dd class="font-medium">{{ user?.email || 'No email provided' }}</dd>
          </div>
          <div v-if="user?.name" class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Display name</dt>
            <dd class="font-medium">{{ user.name }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Language</dt>
            <dd class="font-medium">{{ user?.language?.toUpperCase() }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Created</dt>
            <dd class="font-medium">
              <NuxtTime v-if="user?.createdAt" :datetime="user.createdAt" />
              <span v-else>Unknown</span>
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Updated</dt>
            <dd class="font-medium">
              <NuxtTime v-if="user?.updatedAt" :datetime="user.updatedAt" />
              <span v-else>Unknown</span>
            </dd>
          </div>
        </dl>

        <dl class="space-y-3 text-sm">
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Two-factor</dt>
            <dd class="font-medium">{{ hasTwoFactor ? 'Enabled' : 'Disabled' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Password reset required</dt>
            <dd class="font-medium">{{ requiresPasswordReset ? 'Yes' : 'No' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Account status</dt>
            <dd>
              <UBadge size="sm" :color="isSuspended ? 'error' : 'success'" variant="subtle">
                {{ isSuspended ? 'Suspended' : 'Active' }}
              </UBadge>
            </dd>
          </div>
          <div v-if="user?.suspensionReason" class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Suspension reason</dt>
            <dd class="font-medium">{{ user.suspensionReason }}</dd>
          </div>
          <div v-if="user?.emailVerifiedAt" class="flex justify-between gap-3">
            <dt class="text-muted-foreground">Email verified at</dt>
            <dd class="font-medium">
              <NuxtTime :datetime="user.emailVerifiedAt" />
            </dd>
          </div>
        </dl>
      </div>

      <USeparator />

      <div>
        <h3 class="text-sm font-semibold mb-3">Security & Access</h3>
        <div class="grid gap-4 md:grid-cols-2">
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-muted-foreground">Active sessions</dt>
              <dd class="font-medium">{{ security.activeSessions }}</dd>
            </div>
            <div v-if="security.lastLogin" class="flex justify-between gap-3">
              <dt class="text-muted-foreground">Last login</dt>
              <dd class="font-medium">
                <NuxtTime :datetime="security.lastLogin" />
              </dd>
            </div>
            <div v-if="security.lastLoginIp" class="flex justify-between gap-3">
              <dt class="text-muted-foreground">Last login IP</dt>
              <dd class="font-medium font-mono text-xs">
                <UTooltip :delay-duration="0" :text="security.lastLoginIp">
                  <span class="cursor-help">{{ maskIp(security.lastLoginIp) }}</span>
                </UTooltip>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted-foreground">Unique IP addresses</dt>
              <dd class="font-medium">{{ security.uniqueIps.length }}</dd>
            </div>
          </dl>

          <div v-if="security.uniqueIps.length > 0" class="space-y-2">
            <p class="text-xs uppercase tracking-wide text-muted-foreground mb-2">IP Addresses</p>
            <div class="flex flex-wrap gap-2">
              <UTooltip
                v-for="ip in security.uniqueIps.slice(0, 5)"
                :key="ip"
                :delay-duration="0"
                :text="ip"
              >
                <UBadge size="xs" variant="subtle" color="neutral" class="font-mono cursor-help">
                  {{ maskIp(ip) }}
                </UBadge>
              </UTooltip>
              <UBadge
                v-if="security.uniqueIps.length > 5"
                size="xs"
                variant="subtle"
                color="neutral"
              >
                +{{ security.uniqueIps.length - 5 }} more
              </UBadge>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
