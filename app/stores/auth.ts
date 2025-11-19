import { computed, ref, watch } from 'vue'
import { defineStore, skipHydrate } from 'pinia'
import type { SessionUser } from '#shared/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const { data: authSession, status: authStatus, getSession, signOut, signIn } = useAuth()

  const isSyncing = ref(false)
  const lastSyncedAt = ref<number | null>(null)
  const error = ref<string | null>(null)

  const rawUser = computed<SessionUser | null>(() => (authSession.value?.user as SessionUser | undefined) ?? null)

  const user = computed(() => rawUser.value)
  const permissions = computed(() => rawUser.value?.permissions ?? [])
  const isAdmin = computed(() => rawUser.value?.role === 'admin')
  const isSuperUser = computed(() => isAdmin.value || Boolean(rawUser.value?.remember))
  const displayName = computed(() => rawUser.value?.username || rawUser.value?.email || rawUser.value?.name || null)
  const avatar = computed(() => {
    const fallback = displayName.value || 'User'
    return {
      alt: fallback,
      text: fallback.slice(0, 2).toUpperCase(),
    }
  })
  const isAuthenticated = computed(() => authStatus.value === 'authenticated' && Boolean(rawUser.value))
  const isAuthenticating = computed(() => authStatus.value === 'loading')

  function hasPermission(required: string | string[]) {
    const values = permissions.value

    if (Array.isArray(required)) {
      return required.some(permission => values.includes(permission))
    }

    return values.includes(required)
  }

  async function syncSession(options?: Parameters<typeof getSession>[0]) {
    const force = options?.force ?? false

    if (isSyncing.value && !force) {
      return
    }

    isSyncing.value = true
    try {
      await getSession(options)
      lastSyncedAt.value = Date.now()
      error.value = null
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to refresh session'
    }
    finally {
      isSyncing.value = false
    }
  }

  async function logout(options?: Parameters<typeof signOut>[0]) {
    error.value = null
    try {
      await signOut(options)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sign out'
      throw err
    }
  }

  async function login(provider: Parameters<typeof signIn>[0], options?: Parameters<typeof signIn>[1]) {
    error.value = null
    const result = await signIn(provider, options)
    if (result?.error) {
      error.value = result.error
    }
    return result
  }

  watch(authStatus, (value) => {
    if (value === 'authenticated') {
      syncSession()
    }
  }, { immediate: true })

  function $reset() {
    isSyncing.value = false
    lastSyncedAt.value = null
    error.value = null
  }

  return {
    session: skipHydrate(authSession),
    status: skipHydrate(authStatus),
    user,
    permissions,
    isAdmin,
    isSuperUser,
    displayName,
    avatar,
    isAuthenticated,
    isAuthenticating,
    isSyncing,
    lastSyncedAt,
    error,
    hasPermission,
    syncSession,
    logout,
    login,
    $reset,
  }
})
