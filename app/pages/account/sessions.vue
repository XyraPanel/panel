<script setup lang="ts">
import { authClient } from '~/utils/auth-client';
import type { AccountSessionsResponse, UserSessionSummary } from '#shared/types/auth';

definePageMeta({
  auth: true,
  title: 'Sessions',
  subtitle: 'Manage your active sessions and connected devices',
});

const { t } = useI18n();
const currentPage = ref(1);
const updatingSessions = ref(false);
const sortOrder = ref<'newest' | 'oldest'>('newest');

const { data: paginationSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/settings/pagination',
  {
    key: 'settings-pagination',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => paginationSettings.value?.paginationLimit ?? 25);

const toast = useToast();

const {
  data: sessionsResponse,
  pending: sessionsPending,
  error: sessionsFetchError,
} = await useFetch<AccountSessionsResponse>('/api/account/sessions', {
  key: 'account-sessions',
  query: computed(() => ({
    page: currentPage.value,
    limit: itemsPerPage.value,
  })),
  default: () => ({
    data: [],
    currentToken: null,
    pagination: { page: 1, perPage: itemsPerPage.value, total: 0, totalPages: 0 },
  }),
  watch: [currentPage, itemsPerPage],
});

const sessions = computed<UserSessionSummary[]>(() => sessionsResponse.value?.data ?? []);
const currentSessionToken = computed<string | null>(
  () => sessionsResponse.value?.currentToken ?? null,
);
const hasSessions = computed(() => sessions.value.length > 0);
const sessionsPagination = computed(
  () =>
    (
      sessionsResponse.value as {
        pagination?: { page: number; perPage: number; total: number; totalPages: number };
      } | null
    )?.pagination,
);
const sessionsError = computed<string | null>(() => {
  const err = sessionsFetchError.value;
  if (!err) {
    return null;
  }

  return err instanceof Error ? err.message : t('account.sessions.unableToLoadSessions');
});

const sortOptions = [
  { label: t('common.newest'), value: 'newest' },
  { label: t('common.oldest'), value: 'oldest' },
];

const sortedSessions = computed(() => {
  const sorted = [...sessions.value];
  if (sortOrder.value === 'newest') {
    sorted.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  } else {
    sorted.sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
  }
  return sorted;
});

const expandedSessions = ref<Set<string>>(new Set());

function toggleSession(token: string) {
  if (expandedSessions.value.has(token)) {
    expandedSessions.value.delete(token);
  } else {
    expandedSessions.value.add(token);
  }
}

function maskIp(ip: string) {
  if (!ip || ip === 'Unknown') return t('common.unknown');
  return '**********';
}

function formatJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

function getFullSessionData(session: UserSessionSummary) {
  return {
    token: session.token,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    expiresAtTimestamp: session.expiresAtTimestamp,
    isCurrent: session.isCurrent,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    browser: session.browser,
    os: session.os,
    device: session.device,
    lastSeenAt: session.lastSeenAt,
    firstSeenAt: session.firstSeenAt,
    fingerprint: session.fingerprint,
  };
}

async function copyJson(session: UserSessionSummary) {
  const json = formatJson(getFullSessionData(session));
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = json;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    toast.add({
      title: t('common.copied'),
      description: t('common.copiedToClipboard'),
    });
  } catch (error) {
    toast.add({
      title: t('common.failedToCopy'),
      description: error instanceof Error ? error.message : t('common.failedToCopy'),
      color: 'error',
    });
  }
}

async function handleSignOut(token: string) {
  if (updatingSessions.value) return;

  updatingSessions.value = true;
  try {
    const client = authClient as Record<string, unknown>;
    if (
      'multiSession' in client &&
      client.multiSession &&
      typeof client.multiSession === 'object'
    ) {
      const multiSession = client.multiSession as Record<string, unknown>;
      if (typeof multiSession.revoke === 'function') {
        try {
          const result = (await multiSession.revoke({
            sessionToken: token,
          })) as { error?: { message?: string } } | undefined;

          if (result?.error) {
            throw new Error(result.error.message || t('account.sessions.failedToRevokeSession'));
          }

          const currentSession = await authClient.getSession();
          const currentSessionRevoked = !currentSession?.data;

          if (currentSessionRevoked) {
            await navigateTo('/auth/login');
            return;
          }

          await refreshNuxtData('account-sessions');
          toast.add({
            title: t('account.sessions.sessionRevokedTitle'),
            description: t('account.sessions.sessionRevokedDescription'),
          });
          return;
        } catch (err) {
          console.warn('Multi-session client revoke failed, falling back to API:', err);
        }
      }
    }

    const result = await $fetch<{ revoked: boolean; currentSessionRevoked: boolean }>(
      `/api/account/sessions/${encodeURIComponent(token)}`,
      {
        method: 'DELETE',
      },
    );
    const currentSessionRevoked = result.currentSessionRevoked;

    if (currentSessionRevoked) {
      await navigateTo('/auth/login');
      return;
    }

    await refreshNuxtData('account-sessions');
    toast.add({
      title: t('account.sessions.sessionRevokedTitle'),
      description: t('account.sessions.sessionRevokedDescription'),
    });
  } catch (error) {
    toast.add({
      title: t('account.sessions.failedToRevokeSession'),
      description:
        error instanceof Error
          ? error.message
          : t('account.sessions.unableToRevokeSelectedSession'),
      color: 'error',
    });
  } finally {
    updatingSessions.value = false;
  }
}

async function handleSignOutAll(includeCurrent = false) {
  if (updatingSessions.value) return;

  updatingSessions.value = true;
  try {
    if (includeCurrent) {
      await authClient.signOut();
      await navigateTo('/auth/login');
      return;
    }

    if (typeof authClient.revokeOtherSessions === 'function') {
      try {
        await authClient.revokeOtherSessions();
        await refreshNuxtData('account-sessions');
        toast.add({
          title: t('account.sessions.sessionsRevokedTitle'),
          description: t('account.sessions.sessionsRevokedDescription'),
        });
        return;
      } catch {
        // Error already handled by toast
      }
    }

    const result = await $fetch<{ revoked: number; currentSessionRevoked: boolean }>(
      '/api/account/sessions',
      {
        method: 'DELETE',
        query: { includeCurrent: 'false' },
      },
    );

    await refreshNuxtData('account-sessions');
    toast.add({
      title: t('account.sessions.sessionsRevokedTitle'),
      description:
        result.revoked > 0
          ? result.revoked === 1
            ? t('account.sessions.revokedSessionsSingular', { count: result.revoked })
            : t('account.sessions.revokedSessionsPlural', { count: result.revoked })
          : t('account.sessions.noSessionsRevoked'),
    });
  } catch (error) {
    toast.add({
      title: t('account.sessions.failedToRevokeSessions'),
      description:
        error instanceof Error ? error.message : t('account.sessions.unableToRevokeSessions'),
      color: 'error',
    });
  } finally {
    updatingSessions.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="sessions.length > 1" class="flex justify-end">
      <UButton
        variant="ghost"
        color="error"
        icon="i-lucide-log-out"
        :loading="updatingSessions"
        :disabled="!hasSessions || updatingSessions"
        @click="handleSignOutAll(true)"
      >
        {{ t('account.sessions.signOutAll') }}
      </UButton>
    </div>

    <div>
      <UCard :ui="{ body: 'space-y-3' }">
        <div v-if="hasSessions && !sessionsPending" class="flex items-center justify-end mb-2">
          <USelect
            v-model="sortOrder"
            :items="sortOptions"
            value-key="value"
            class="w-40"
            :aria-label="t('common.filter')"
          />
        </div>

        <div v-if="sessionsPending" class="space-y-3">
          <USkeleton v-for="i in 3" :key="`session-skeleton-${i}`" class="h-16 w-full rounded-lg" />
        </div>
        <UAlert
          v-else-if="sessionsError"
          icon="i-lucide-alert-triangle"
          color="error"
          :title="sessionsError"
        />
        <UEmpty
          v-else-if="!hasSessions"
          icon="i-lucide-monitor"
          :title="t('account.sessions.noActiveSessionsTitle')"
          :description="t('account.sessions.noBrowserSessionsDescription')"
          variant="subtle"
        />
        <div v-else class="space-y-3">
          <div
            v-for="session in sortedSessions"
            :key="session.token"
            class="rounded-lg border border-default overflow-hidden"
          >
            <div class="w-full flex items-center gap-3 p-3 hover:bg-elevated/50 transition-colors">
              <button
                type="button"
                class="flex flex-1 items-center gap-3 text-left cursor-pointer bg-transparent border-0 p-0 min-w-0"
                @click="toggleSession(session.token)"
              >
                <UIcon
                  :name="
                    session.device === 'Mobile'
                      ? 'i-lucide-smartphone'
                      : session.device === 'Tablet'
                        ? 'i-lucide-tablet'
                        : 'i-lucide-monitor'
                  "
                  class="size-5 shrink-0 text-primary"
                />

                <div
                  class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-sm font-medium">{{
                        session.device ?? t('common.unknown')
                      }}</span>
                      <UIcon
                        :name="
                          expandedSessions.has(session.token)
                            ? 'i-lucide-chevron-down'
                            : 'i-lucide-chevron-right'
                        "
                        class="size-4 text-muted-foreground shrink-0"
                      />
                    </div>
                    <span class="text-xs text-muted-foreground"
                      >{{ session.os ?? t('common.unknown') }} •
                      {{ session.browser ?? t('common.unknown') }}</span
                    >
                    <UBadge
                      v-if="session.token === currentSessionToken"
                      color="primary"
                      variant="soft"
                      size="xs"
                      class="shrink-0"
                    >
                      {{ t('account.sessions.current') }}
                    </UBadge>
                  </div>

                  <div
                    class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-muted-foreground shrink-0"
                  >
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="truncate">{{ t('account.sessions.ipAddress') }}:</span>
                      <UTooltip
                        v-if="session.ipAddress && session.ipAddress !== 'Unknown'"
                        :delay-duration="0"
                        :text="session.ipAddress"
                      >
                        <span class="cursor-help font-mono">{{ maskIp(session.ipAddress) }}</span>
                      </UTooltip>
                      <span v-else class="font-mono">{{
                        maskIp(session.ipAddress ?? t('common.unknown'))
                      }}</span>
                    </div>
                    <span class="hidden sm:inline">•</span>
                    <div class="flex items-center gap-2 shrink-0">
                      <span class="truncate">
                        {{ t('account.sessions.active') }}
                        <template v-if="session.isCurrent">
                          <span class="font-medium">{{ t('common.now') }}</span>
                        </template>
                        <template v-else-if="session.lastSeenAt">
                          <NuxtTime :datetime="session.lastSeenAt" class="font-medium" />
                        </template>
                        <span v-else class="text-muted-foreground">{{
                          t('account.sessions.neverUsed')
                        }}</span>
                      </span>
                      <span class="hidden sm:inline">•</span>
                      <span class="truncate">
                        {{ t('account.sessions.expires') }}
                        <NuxtTime :datetime="session.expiresAt" class="font-medium" />
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              <div class="flex items-center gap-2 shrink-0">
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  :loading="updatingSessions"
                  :disabled="session.token === currentSessionToken && updatingSessions"
                  @click.stop="handleSignOut(session.token)"
                >
                  {{ t('account.sessions.revoke') }}
                </UButton>
              </div>
            </div>

            <div
              v-if="expandedSessions.has(session.token)"
              class="border-t border-default bg-muted/30 p-4"
            >
              <div class="space-y-2">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {{ t('account.sessions.sessionData') }}
                  </p>
                  <UButton
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-copy"
                    @click.stop="copyJson(session)"
                  >
                    {{ t('account.sessions.copyJSON') }}
                  </UButton>
                </div>
                <pre
                  class="text-xs font-mono bg-default rounded-lg p-3 overflow-x-auto border border-default"
                ><code>{{ formatJson(getFullSessionData(session)) }}</code></pre>
              </div>
            </div>
          </div>

          <div
            v-if="sessionsPagination && sessionsPagination.totalPages > 1"
            class="flex items-center justify-between border-t border-default pt-4"
          >
            <div class="text-sm text-muted-foreground">
              {{
                t('account.sessions.showingEvents', {
                  count: sessionsPagination.total,
                })
              }}
            </div>

            <UPagination
              v-model:page="currentPage"
              :total="sessionsPagination.total"
              :items-per-page="sessionsPagination.perPage"
              size="sm"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
