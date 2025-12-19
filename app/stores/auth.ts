import { computed } from 'vue'
import { defineStore } from 'pinia'
import type { SessionUser } from '#shared/types/auth'
import { authClient } from '~/utils/auth-client'

export const useAuthStore = defineStore('auth', () => {
  const sessionRef = authClient.useSession()
  const sessionData = computed(() => sessionRef.value?.data ?? null)
  const isPending = computed(() => sessionRef.value?.isPending ?? false)
  
  const authStatus = computed(() => {
    if (sessionData.value) return 'authenticated'
    if (isPending.value) return 'loading'
    return 'unauthenticated'
  })

  const user = computed<SessionUser | null>(() => {
    const session = sessionData.value
    if (!session) return null
    const sessionUser = (session as { user?: SessionUser }).user
    return sessionUser ?? null
  })

  const permissions = computed(() => user.value?.permissions ?? [])
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isSuperUser = computed(() => isAdmin.value || Boolean(user.value?.remember))
  const displayName = computed(() => {
    if (!user.value) return null
    return user.value.username || user.value.email || user.value.name || null
  })
  const requiresPasswordReset = computed(() => Boolean(user.value?.passwordResetRequired))
  const avatar = computed(() => {
    if (!user.value || !displayName.value) {
      return null
    }
    return {
      alt: displayName.value,
      text: displayName.value.slice(0, 2).toUpperCase(),
    }
  })
  const isAuthenticated = computed(() => authStatus.value === 'authenticated' && Boolean(user.value))

  function hasPermission(required: string | string[]) {
    const values = permissions.value

    if (Array.isArray(required)) {
      return required.some(permission => values.includes(permission))
    }

    return values.includes(required)
  }

  async function syncSession() {
    await authClient.getSession()
  }

  async function logout(options?: { revokeOthersFirst?: boolean }) {
    try {
      if (options?.revokeOthersFirst && typeof authClient.revokeOtherSessions === 'function') {
        await authClient.revokeOtherSessions()
      }

      await authClient.signOut()
    }
    catch (err) {
      const { t } = useI18n()
      throw new Error(err instanceof Error ? err.message : t('auth.failedToSignOut'))
    }
  }

  async function login(identity: string, password: string, token?: string, captchaToken?: string) {
    const isEmail = identity.includes('@')
    
    const fetchOptions = captchaToken ? {
      headers: {
        'x-captcha-response': captchaToken,
      },
    } : undefined
    
    let result
    
    if (isEmail) {
      result = await authClient.signIn.email({
        email: identity,
        password,
        fetchOptions,
      })

      if (result.error) {
        result = await authClient.signIn.username({
          username: identity,
          password,
          fetchOptions,
        })
      }
    } else {
      result = await authClient.signIn.username({
        username: identity,
        password,
        fetchOptions,
      })

      if (result.error) {
        result = await authClient.signIn.email({
          email: identity,
          password,
          fetchOptions,
        })
      }
    }

    if (result.error) {
      return { error: result.error.message }
    }

    if (token) {
      const twoFactorResult = await authClient.twoFactor.verifyTotp({
        code: token,
        trustDevice: true,
      })

      if (twoFactorResult.error) {
        return { error: twoFactorResult.error.message }
      }
    }

    if (typeof authClient.revokeOtherSessions === 'function') {
      try {
        await authClient.revokeOtherSessions()
      }
      catch (error) {
        console.warn('[auth] Failed to revoke other sessions after login:', error)
      }
    }

    await syncSession()

    return result
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
    hasPermission,
    syncSession,
    logout,
    login,
    requiresPasswordReset,
  }
})
