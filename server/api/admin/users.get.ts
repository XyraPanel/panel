import { defineEventHandler } from 'h3'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

interface AdminUserResponse {
  id: string
  username: string
  email: string
  name?: string | null
  role: string
  createdAt: string
}

interface UsersResponse {
  data: AdminUserResponse[]
}

export default defineEventHandler((): UsersResponse => {
  const db = useDrizzle()

  const rows = db.select().from(tables.users).all()
  const users = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return {
    data: users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.nameFirst && user.nameLast ? `${user.nameFirst} ${user.nameLast}` : user.nameFirst || user.nameLast || null,
      role: user.rootAdmin ? 'admin' : 'user',
      createdAt: user.createdAt.toISOString(),
    })),
  }
})
