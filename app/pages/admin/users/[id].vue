<script setup lang="ts">
import type { AdminUserProfilePayload } from '#shared/types/admin';
import { authClient } from '~/utils/auth-client';

definePageMeta({
  auth: true,
  adminTitle: 'User profile',
  adminSubtitle: 'Inspect panel access, owned servers, and activity',
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const actionLoading = ref<string | null>(null);
const isActionRunning = (key: string) => actionLoading.value === key;

const userId = computed(() => route.params.id as string);

const { data, pending, error, refresh } = await useFetch<{ data: AdminUserProfilePayload }>(
  () => `/api/admin/users/${userId.value}`,
  {
    immediate: true,
    watch: [userId],
  },
);

async function runAction<T>(
  key: string,
  task: () => Promise<T>,
  options: { refreshAfter?: boolean; successMessage?: string } = {},
): Promise<T | undefined> {
  if (actionLoading.value) {
    return undefined;
  }

  actionLoading.value = key;

  try {
    const result = await task();

    if (options.refreshAfter !== false) {
      await refresh();
    }

    if (options.successMessage) {
      toast.add({
        title: t('common.success'),
        description: options.successMessage,
        color: 'success',
      });
    }

    return result;
  } catch (error) {
    const description = error instanceof Error ? error.message : t('common.unexpectedError');
    toast.add({
      title: t('admin.users.actionFailed'),
      description,
      color: 'error',
    });
    return undefined;
  } finally {
    actionLoading.value = null;
  }
}

watch(error, (value) => {
  if (value) {
    toast.add({
      title: t('admin.users.failedToLoadUserProfile'),
      description: value.statusMessage || value.message,
      color: 'error',
    });

    if (value.statusCode === 404) {
      router.replace('/admin/users');
    }
  }
});

const profile = computed(() => data.value?.data);
const user = computed(() => profile.value?.user);

const { data: generalSettings } = await useFetch<{ paginationLimit: number }>(
  '/api/admin/settings/general',
  {
    key: 'admin-settings-general',
    default: () => ({ paginationLimit: 25 }),
  },
);
const itemsPerPage = computed(() => generalSettings.value?.paginationLimit ?? 25);

const userStats = computed(
  () =>
    profile.value?.stats ?? {
      serverCount: 0,
      apiKeyCount: 0,
    },
);
const serversCount = computed(
  () => userStats.value.serverCount ?? profile.value?.servers?.length ?? 0,
);
const apiKeysCount = computed(
  () => userStats.value.apiKeyCount ?? profile.value?.apiKeys?.length ?? 0,
);
const activityCount = computed(() => profile.value?.activity?.length ?? 0);

const isSuspended = computed(() => Boolean(user.value?.suspended));
const hasTwoFactor = computed(() => Boolean(user.value?.twoFactorEnabled));
const hasVerifiedEmail = computed(() => Boolean(user.value?.emailVerified));
const requiresPasswordReset = computed(() => Boolean(user.value?.passwordResetRequired));
const hasEmail = computed(() => Boolean(user.value?.email));

const tab = ref<'overview' | 'servers' | 'api-keys' | 'activity'>('overview');
const controlsOpen = ref(false);

const tabItems = computed(() => [
  { label: t('admin.users.tabs.overview'), value: 'overview', icon: 'i-lucide-layout-dashboard' },
  {
    label: `${t('admin.users.tabs.servers')} (${serversCount.value})`,
    value: 'servers',
    icon: 'i-lucide-server',
  },
  {
    label: `${t('admin.users.tabs.apiKeys')} (${apiKeysCount.value})`,
    value: 'api-keys',
    icon: 'i-lucide-key',
  },
  {
    label: `${t('admin.users.tabs.activity')} (${activityCount.value})`,
    value: 'activity',
    icon: 'i-lucide-activity',
  },
]);

const isLoading = computed(() => pending.value && !profile.value);

async function sendResetLink(notify = true) {
  if (!user.value) return;

  await runAction(
    'reset-link',
    async () => {
      return await $fetch<{ data: { success: boolean } }>(
        `/api/admin/users/${userId.value}/actions/reset-password`,
        {
          method: 'POST',
          body: {
            mode: 'link',
            notify,
          },
        },
      );
    },
    {
      successMessage: notify
        ? t('admin.users.passwordResetLinkGeneratedAndEmailed')
        : t('admin.users.passwordResetLinkGenerated'),
    },
  );
}

async function setTemporaryPassword() {
  if (!user.value) return;

  const response = await runAction('reset-temp', async () => {
    return await $fetch<{ data: { success: boolean; temporaryPassword: string } }>(
      `/api/admin/users/${userId.value}/actions/reset-password`,
      {
        method: 'POST',
        body: {
          mode: 'temporary',
        },
      },
    );
  });

  const temporaryPassword = response?.data?.temporaryPassword;
  if (!temporaryPassword) return;

  let copied = false;

  if (import.meta.client && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      copied = true;
    } catch (error) {
      console.error('Failed to copy temporary password to clipboard', error);
    }
  }

  if (!copied && import.meta.client && typeof window !== 'undefined')
    window.prompt(t('admin.users.temporaryPasswordCopyPrompt'), temporaryPassword);

  const baseMessage = t('admin.users.userMustUpdatePasswordOnNextLogin');
  toast.add({
    title: t('admin.users.temporaryPasswordGenerated'),
    description: copied
      ? `${t('admin.users.temporaryPasswordCopiedToClipboard')} ${baseMessage}`
      : `${t('admin.users.temporaryPassword')}: ${temporaryPassword}\n${baseMessage}`,
    color: 'success',
  });
}

async function disableTwoFactor() {
  if (!user.value) return;

  await runAction(
    'disable-2fa',
    async () => {
      return await $fetch<{ data: { success: boolean } }>(
        `/api/admin/users/${userId.value}/actions/disable-2fa`,
        {
          method: 'POST',
        },
      );
    },
    {
      successMessage: t('admin.users.twoFactorDisabledForUser'),
    },
  );
}

async function markEmailVerified() {
  if (!user.value || hasVerifiedEmail.value) return;

  await runAction(
    'email-verify',
    async () => {
      return await $fetch<{ data: { success: boolean } }>(
        `/api/admin/users/${userId.value}/actions/email-verification`,
        {
          method: 'POST',
          body: { action: 'mark-verified' },
        },
      );
    },
    {
      successMessage: t('admin.users.emailMarkedAsVerified'),
    },
  );
}

async function markEmailUnverified() {
  if (!user.value || !hasVerifiedEmail.value) return;

  await runAction(
    'email-unverify',
    async () => {
      return await $fetch<{ data: { success: boolean } }>(
        `/api/admin/users/${userId.value}/actions/email-verification`,
        {
          method: 'POST',
          body: { action: 'mark-unverified' },
        },
      );
    },
    {
      successMessage: t('admin.users.emailMarkedAsUnverified'),
    },
  );
}

async function resendVerificationEmail() {
  if (!user.value) return;

  if (!hasEmail.value) {
    toast.add({
      title: t('admin.users.noEmailAddressAvailable'),
      description: t('admin.users.addEmailBeforeResendingVerification'),
      color: 'error',
    });
    return;
  }

  await runAction(
    'email-resend',
    async () => {
      return await $fetch<{ data: { success: boolean } }>(
        `/api/admin/users/${userId.value}/actions/email-verification`,
        {
          method: 'POST',
          body: { action: 'resend-link' },
        },
      );
    },
    {
      refreshAfter: false,
      successMessage: t('admin.users.verificationEmailResent'),
    },
  );
}

async function toggleSuspension() {
  if (!user.value) return;

  if (isSuspended.value) {
    if (
      import.meta.client &&
      typeof window !== 'undefined' &&
      !window.confirm(t('admin.users.confirmUnsuspendUser'))
    )
      return;

    await runAction(
      'unsuspend',
      async () => {
        return await $fetch<{ data: { success: boolean } }>(
          `/api/admin/users/${userId.value}/actions/suspension`,
          {
            method: 'POST',
            body: { action: 'unsuspend' },
          },
        );
      },
      {
        successMessage: t('admin.users.userUnsuspended'),
      },
    );

    return;
  }

  if (
    import.meta.client &&
    typeof window !== 'undefined' &&
    !window.confirm(t('admin.users.confirmSuspendUser'))
  )
    return;

  let reason: string | undefined;
  if (import.meta.client && typeof window !== 'undefined') {
    const input = window.prompt(t('admin.users.provideSuspensionReason'))?.trim();
    reason = input && input.length > 0 ? input : undefined;
  }

  await runAction(
    'suspend',
    async () => {
      return await $fetch<{ data: { success: boolean } }>(
        `/api/admin/users/${userId.value}/actions/suspension`,
        {
          method: 'POST',
          body: {
            action: 'suspend',
            reason,
          },
        },
      );
    },
    {
      successMessage: t('admin.users.userSuspended'),
    },
  );
}

async function impersonateUser() {
  if (!user.value || isSuspended.value) return;

  const response = await runAction(
    'impersonate',
    async () => {
      await $fetch(`/api/admin/users/${userId.value}/actions/impersonate`, {
        method: 'POST',
      });
      return { success: true };
    },
    {
      refreshAfter: false,
    },
  );

  if (!response) return;

  await authClient.getSession({ fetchOptions: { cache: 'no-store' } });
  clearNuxtData();
  await refreshNuxtData();

  toast.add({
    title: t('admin.users.impersonationStarted'),
    description: t('admin.users.impersonationRedirecting'),
    color: 'success',
  });

  await navigateTo('/', { replace: true });
}
</script>

<template>
  <UPage>
    <UPageBody>
      <UContainer>
        <section class="space-y-6">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div v-if="user">
              <UUser
                :name="user.name || user.username"
                :description="user.email"
                :avatar="
                  (() => {
                    const name = user.name || user.username || user.email;
                    if (!name) return undefined;
                    return {
                      alt: name,
                      text: name.slice(0, 2).toUpperCase(),
                    };
                  })()
                "
                size="lg"
              />
            </div>
            <div v-else>
              <h1 class="text-xl font-semibold">{{ t('admin.users.loadingUser') }}</h1>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                icon="i-lucide-sliders-horizontal"
                color="warning"
                variant="subtle"
                @click="controlsOpen = true"
              >
                {{ t('admin.users.userControls') }}
              </UButton>
            </div>
          </header>

          <USlideover
            v-model:open="controlsOpen"
            :title="t('admin.users.userControls')"
            :description="t('admin.users.userControlsDescription')"
            :ui="{ body: 'space-y-6', footer: 'justify-end gap-2' }"
          >
            <template #body>
              <div class="flex flex-col gap-4">
                <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                  <div class="space-y-2">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ t('auth.password') }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        icon="i-lucide-mail"
                        size="xs"
                        variant="outline"
                        color="primary"
                        :loading="isActionRunning('reset-link')"
                        @click="sendResetLink()"
                      >
                        {{ t('admin.users.sendResetLink') }}
                      </UButton>
                      <UButton
                        icon="i-lucide-key"
                        size="xs"
                        variant="outline"
                        color="neutral"
                        :loading="isActionRunning('reset-temp')"
                        @click="setTemporaryPassword"
                      >
                        {{ t('admin.users.temporaryPassword') }}
                      </UButton>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      {{ t('admin.users.passwordResetDescription') }}
                    </p>
                  </div>
                </UCard>

                <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                  <div class="space-y-2">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ t('account.security.twoFactor.title') }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        icon="i-lucide-shield-off"
                        size="xs"
                        variant="outline"
                        color="neutral"
                        :disabled="!hasTwoFactor"
                        :loading="isActionRunning('disable-2fa')"
                        @click="disableTwoFactor"
                      >
                        {{ t('admin.users.disable2FA') }}
                      </UButton>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      {{ t('admin.users.disable2FADescription') }}
                    </p>
                  </div>
                </UCard>

                <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                  <div class="space-y-2">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ t('admin.users.emailVerification') }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        icon="i-lucide-badge-check"
                        size="xs"
                        variant="outline"
                        color="primary"
                        :disabled="hasVerifiedEmail"
                        :loading="isActionRunning('email-verify')"
                        @click="markEmailVerified"
                      >
                        {{ t('admin.users.markVerified') }}
                      </UButton>
                      <UButton
                        icon="i-lucide-badge-x"
                        size="xs"
                        variant="outline"
                        color="neutral"
                        :disabled="!hasVerifiedEmail"
                        :loading="isActionRunning('email-unverify')"
                        @click="markEmailUnverified"
                      >
                        {{ t('admin.users.markUnverified') }}
                      </UButton>
                      <UButton
                        icon="i-lucide-mail-plus"
                        size="xs"
                        variant="outline"
                        color="neutral"
                        :loading="isActionRunning('email-resend')"
                        @click="resendVerificationEmail"
                      >
                        {{ t('admin.users.resendEmail') }}
                      </UButton>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      {{ t('admin.users.emailVerificationDescription') }}
                    </p>
                  </div>
                </UCard>

                <UCard variant="outline" :ui="{ body: 'space-y-3' }">
                  <div class="space-y-2">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ t('admin.users.accountState') }}
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        :icon="isSuspended ? 'i-lucide-user-check' : 'i-lucide-user-x'"
                        size="xs"
                        variant="outline"
                        :color="isSuspended ? 'primary' : 'error'"
                        :loading="isActionRunning(isSuspended ? 'unsuspend' : 'suspend')"
                        @click="toggleSuspension"
                      >
                        {{
                          isSuspended
                            ? t('admin.users.unsuspendUser')
                            : t('admin.users.suspendUser')
                        }}
                      </UButton>
                      <UButton
                        icon="i-lucide-user-cog"
                        size="xs"
                        variant="outline"
                        color="primary"
                        :disabled="isSuspended"
                        :loading="isActionRunning('impersonate')"
                        @click="impersonateUser"
                      >
                        {{ t('admin.users.startImpersonation') }}
                      </UButton>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      {{ t('admin.users.accountStateDescription') }}
                    </p>
                  </div>
                </UCard>
              </div>
            </template>
          </USlideover>

          <div v-if="isLoading" class="grid gap-4 xl:grid-cols-3">
            <div
              v-for="i in 3"
              :key="`skeleton-${i}`"
              class="space-y-3 rounded-lg border border-dashed border-default/60 bg-muted/30 p-4"
            >
              <USkeleton class="h-4 w-32" />
              <USkeleton class="h-3 w-24" />
              <USkeleton class="h-24 w-full" />
            </div>
          </div>

          <div v-else-if="profile" class="space-y-6">
            <div v-if="isSuspended || requiresPasswordReset" class="space-y-3">
              <UAlert v-if="isSuspended" color="error" variant="soft" icon="i-lucide-ban">
                <template #title>{{ t('admin.users.accountSuspended') }}</template>
                <template #description>
                  <p>{{ t('admin.users.accountSuspendedDescription') }}</p>
                  <p v-if="user?.suspensionReason" class="mt-2 text-xs text-muted-foreground">
                    {{ t('common.reason') }}: {{ user.suspensionReason }}
                  </p>
                  <p v-if="user?.suspendedAt" class="mt-1 text-xs text-muted-foreground">
                    {{ t('admin.users.suspendedAt') }}
                    <NuxtTime :datetime="user.suspendedAt" />
                  </p>
                </template>
              </UAlert>
              <UAlert
                v-if="requiresPasswordReset"
                color="warning"
                variant="soft"
                icon="i-lucide-alert-triangle"
              >
                <template #title>{{ t('admin.users.passwordResetRequired') }}</template>
                <template #description>
                  <p>{{ t('admin.users.passwordResetRequiredDescription') }}</p>
                </template>
              </UAlert>
            </div>

            <UTabs v-model="tab" variant="link" :items="tabItems" class="w-full" />

            <AdminUserOverviewTab v-if="tab === 'overview'" :profile="profile" />
            <AdminUserServersTab
              v-else-if="tab === 'servers'"
              :user-id="userId"
              :items-per-page="itemsPerPage"
            />
            <AdminUserApiKeysTab
              v-else-if="tab === 'api-keys'"
              :user-id="userId"
              :items-per-page="itemsPerPage"
            />
            <AdminUserActivityTab
              v-else-if="tab === 'activity'"
              :user-id="userId"
              :items-per-page="itemsPerPage"
            />
          </div>
        </section>
      </UContainer>
    </UPageBody>
  </UPage>
</template>
