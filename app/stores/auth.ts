import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SessionUser } from '#shared/types/auth'
import { authClient } from '~/utils/auth-client'

export const useAuthStore = defineStore('auth', () => {
  const sessionRef = authClient.useSession()
  const sessionData = computed(() => sessionRef.value?.data ?? null)
  const isPending = computed(() => {
    if (sessionData.value) return false
    return sessionRef.value?.isPending ?? false
  })
  const refetchSession = async (options?: { bypassCache?: boolean }) => {
    try {
      await authClient.getSession({
        query: options?.bypassCache ? { disableCookieCache: true } : undefined,
      })
    }
    catch (err) {
      console.error('Failed to refetch session', err)
    }
  }
  
  const authStatus = computed(() => {
    if (sessionData.value) return 'authenticated'
    if (isPending.value) return 'loading'
    return 'unauthenticated'
  })

  const isSyncing = ref(false)
  const lastSyncedAt = ref<number | null>(null)
  const error = ref<string | null>(null)

  const rawUser = computed<SessionUser | null>(() => {
    const session = sessionData.value
    if (!session) return null
    const user = (session as { user?: SessionUser }).user
    return user ?? null
  })

  const user = computed(() => rawUser.value)
  const permissions = computed(() => rawUser.value?.permissions ?? [])
  const isAdmin = computed(() => rawUser.value?.role === 'admin')
  const isSuperUser = computed(() => isAdmin.value || Boolean(rawUser.value?.remember))
  const displayName = computed(() => {
    if (!rawUser.value) return null
    return rawUser.value.username || rawUser.value.email || rawUser.value.name || null
  })
  const requiresPasswordReset = computed(() => Boolean(rawUser.value?.passwordResetRequired))
  const avatar = computed(() => {
    if (!rawUser.value || !displayName.value) {
      return null
    }
    return {
      alt: displayName.value,
      text: displayName.value.slice(0, 2).toUpperCase(),
    }
  })
  const isAuthenticated = computed(() => authStatus.value === 'authenticated' && Boolean(rawUser.value))
  const isAuthenticating = computed(() => isPending.value)

  function hasPermission(required: string | string[]) {
    const values = permissions.value

    if (Array.isArray(required)) {
      return required.some(permission => values.includes(permission))
    }

    return values.includes(required)
  }

  async function syncSession(options?: { force?: boolean; bypassCache?: boolean }) {
    const force = options?.force ?? false
    const bypassCache = options?.bypassCache ?? false

    if (isSyncing.value && !force) {
      return
    }

    isSyncing.value = true
    try {
      await refetchSession({ bypassCache })
      await new Promise(resolve => setTimeout(resolve, 50))
      
      lastSyncedAt.value = Date.now()
      error.value = null
    }
    catch (err) {
      const { t } = useI18n()
      error.value = err instanceof Error ? err.message : t('auth.failedToRefreshSession')
    }
    finally {
      isSyncing.value = false
    }
  }

  async function logout() {
    error.value = null
    try {
      await authClient.signOut()
    }
    catch (err) {
      const { t } = useI18n()
      error.value = err instanceof Error ? err.message : t('auth.failedToSignOut')
      throw err
    }
  }

  async function login(identity: string, password: string, token?: string, captchaToken?: string) {
    error.value = null
    try {
      const isEmail = identity.includes('@')
      
      const fetchOptions = captchaToken ? {
        headers: {
          'x-captcha-response': captchaToken,
        },
      } : undefined
      
      if (isEmail) {
        const emailResult = await authClient.signIn.email({
          email: identity,
          password,
          fetchOptions,
        })

        if (emailResult.error) {
          const usernameResult = await authClient.signIn.username({
            username: identity,
            password,
            fetchOptions,
          })

          if (usernameResult.error) {
            error.value = (emailResult.error.message || usernameResult.error.message) ?? null
            return { error: emailResult.error.message || usernameResult.error.message }
          }

          if (token) {
            const twoFactorResult = await authClient.twoFactor.verifyTotp({
              code: token,
              trustDevice: true,
            })

            if (twoFactorResult.error) {
              error.value = twoFactorResult.error.message ?? null
              return { error: twoFactorResult.error.message }
            }
          }

          return usernameResult
        }

        if (token) {
          const twoFactorResult = await authClient.twoFactor.verifyTotp({
            code: token,
            trustDevice: true,
          })

          if (twoFactorResult.error) {
            error.value = twoFactorResult.error.message ?? null
            return { error: twoFactorResult.error.message }
          }
        }

        return emailResult
      } else {
        const usernameResult = await authClient.signIn.username({
          username: identity,
          password,
          fetchOptions,
        })

        if (usernameResult.error) {
          const emailResult = await authClient.signIn.email({
            email: identity,
            password,
          })

          if (emailResult.error) {
            error.value = (usernameResult.error.message || emailResult.error.message) ?? null
            return { error: usernameResult.error.message || emailResult.error.message }
          }

          if (token) {
            const twoFactorResult = await authClient.twoFactor.verifyTotp({
              code: token,
              trustDevice: true,
            })

            if (twoFactorResult.error) {
              error.value = twoFactorResult.error.message ?? null
              return { error: twoFactorResult.error.message }
            }
          }

          return emailResult
        }

        if (token) {
          const twoFactorResult = await authClient.twoFactor.verifyTotp({
            code: token,
            trustDevice: true,
          })

          if (twoFactorResult.error) {
            error.value = twoFactorResult.error.message ?? null
            return { error: twoFactorResult.error.message }
          }
        }

        return usernameResult
      }
    }
    catch (err) {
      const { t } = useI18n()
      const message = err instanceof Error ? err.message : t('auth.failedToSignIn')
      error.value = message
      return { error: message }
    }
  }

  function $reset() {
    isSyncing.value = false
    lastSyncedAt.value = null
    error.value = null
  }

  return {
    session: sessionData,
    status: authStatus,
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
    requiresPasswordReset,
    $reset,
  }
})
