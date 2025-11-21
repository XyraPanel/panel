import { createError, readBody, getRequestIP, type H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { listServerSubusers } from '~~/server/utils/subusers'
import bcrypt from 'bcryptjs'
import type { SftpAuthRequest, SftpAuthResponse } from '#shared/types/api-responses'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW = 60000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= MAX_ATTEMPTS) {
    return false
  }

  record.count++
  return true
}

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle()
  const body = await readBody<SftpAuthRequest>(event)
  const clientIp = getRequestIP(event) || body.ip || 'unknown'

  if (!checkRateLimit(clientIp)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: 'Too many SFTP authentication attempts. Please try again later.',
    })
  }

  const { type, username, password: credential } = body

  if (!username) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Username is required',
    })
  }

  if (type !== 'password' && type !== 'public_key') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid authentication type',
    })
  }

  if (!credential) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Password or public key is required',
    })
  }

  const parts = username.split('.')
  if (parts.length < 2) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid SFTP credentials format',
    })
  }

  const serverIdentifier = parts[parts.length - 1]!
  const userIdentifier = parts.slice(0, -1).join('.')

  const server = db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverIdentifier))
    .limit(1)
    .get()

  if (!server) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid SFTP credentials',
    })
  }

  const user = db
    .select()
    .from(tables.users)
    .where(
      eq(tables.users.username, userIdentifier),
    )
    .limit(1)
    .get()

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid SFTP credentials',
    })
  }

  if (type === 'password') {
    const isValidPassword = await bcrypt.compare(credential, user.password)
    if (!isValidPassword) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: 'Invalid SFTP credentials',
      })
    }
  }
  else if (type === 'public_key') {

    const { createHash } = await import('node:crypto')

    try {
      const cleanKey = credential.trim().split(/\s+/)
      if (cleanKey.length < 2) {
        throw new Error('Invalid key format')
      }

      const keyData = cleanKey[1]
      if (!keyData) {
        throw new Error('Invalid key data')
      }

      const validKeyData = keyData as string
      const keyBuffer = Buffer.from(validKeyData, 'base64')
      const hash = createHash('sha256').update(keyBuffer).digest('base64')
      const fingerprint = `SHA256:${hash}`

      const sshKey = db
        .select()
        .from(tables.sshKeys)
        .where(eq(tables.sshKeys.userId, user.id))
        .limit(1)
        .all()
        .find(key => key.fingerprint === fingerprint)

      if (!sshKey) {
        throw createError({
          statusCode: 401,
          statusMessage: 'Unauthorized',
          message: 'Invalid SSH key',
        })
      }
    }
    catch {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: 'Invalid SSH key',
      })
    }
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  let permissions: string[] = []

  if (isAdmin || isOwner) {
    permissions = ['*']
  }
  else {
    const subusers = await listServerSubusers(server.id)
    const subuser = subusers.find(entry => entry.userId === user.id)

    if (!subuser) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'You do not have access to this server',
      })
    }

    permissions = subuser.permissions
  }

  await recordAuditEvent({
    actor: user.email,
    actorType: 'user',
    action: 'sftp.auth',
    targetType: 'server',
    targetId: server.uuid,
    metadata: {
      ip: clientIp,
      username,
      successful: true,
    },
  })

  const response: SftpAuthResponse = {
    server: server.uuid,
    user: user.username,
    permissions,
  }

  return response
})
