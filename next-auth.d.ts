import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: DefaultSession['user'] & {
      id: string
      username: string
      role: 'admin' | 'user'
      permissions: string[]
      useTotp: boolean
      totpAuthenticatedAt: string | Date | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    username?: string
    role?: string
    permissions?: string[]
    useTotp?: boolean
    totpAuthenticatedAt?: string | Date | null
    sessionToken?: string
  }
}
