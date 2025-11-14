import { randomUUID, createHash } from 'node:crypto'
import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

function parseSSHPublicKey(publicKey: string): { fingerprint: string; valid: boolean } {
  try {

    const cleanKey = publicKey.trim().split(/\s+/)

    if (cleanKey.length < 2) {
      return { fingerprint: '', valid: false }
    }

    const keyType = cleanKey[0]
    const keyData = cleanKey[1]

    if (!keyType || !keyData) {
      return { fingerprint: '', valid: false }
    }

    const validKeyType = keyType as string
    const validKeyData = keyData as string

    const validTypes = ['ssh-rsa', 'ssh-dss', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521']
    if (!validTypes.includes(validKeyType)) {
      return { fingerprint: '', valid: false }
    }

    const keyBuffer = Buffer.from(validKeyData, 'base64')
    const hash = createHash('sha256').update(keyBuffer).digest('base64')
    const fingerprint = `SHA256:${hash}`

    return { fingerprint, valid: true }
  }
  catch {
    return { fingerprint: '', valid: false }
  }
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<{ name: string; public_key: string }>(event)

  if (!body.name || !body.public_key) {
    throw createError({ statusCode: 400, statusMessage: 'Name and public key are required' })
  }

  const { fingerprint, valid } = parseSSHPublicKey(body.public_key)

  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid SSH public key format' })
  }

  const db = useDrizzle()

  const existing = db
    .select()
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.fingerprint, fingerprint))
    .get()

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'This SSH key already exists' })
  }

  const userKeys = db
    .select()
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.userId, user.id))
    .all()

  if (userKeys.length >= 25) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum of 25 SSH keys allowed per account' })
  }

  const now = Date.now()
  const keyId = randomUUID()

  db.insert(tables.sshKeys)
    .values({
      id: keyId,
      userId: user.id,
      name: body.name,
      fingerprint,
      publicKey: body.public_key.trim(),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .run()

  const key = db
    .select()
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.id, keyId))
    .get()

  return {
    data: {
      id: key!.id,
      name: key!.name,
      fingerprint: key!.fingerprint,
      public_key: key!.publicKey,
      created_at: key!.createdAt,
    },
  }
})
