import { createError } from 'h3'
import { getAuth, normalizeHeadersForAuth } from '~~/server/utils/auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'

interface RequestBody {
  password: string
}

export default defineEventHandler(async (event) => {
  const auth = getAuth()
  
  const session = await auth.api.getSession({
    headers: normalizeHeadersForAuth(event.node.req.headers),
  })

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  const body = await readBody<RequestBody>(event)
  const { password } = body

  if (!password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password is required',
    })
  }

  const userId = session.user.id
  const db = useDrizzle()

  const user = db
    .select({ password: tables.users.password })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  const isValidPassword = await bcrypt.compare(password, user.password)
  if (!isValidPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid password',
    })
  }

  // CodeQL [js/insufficient-password-hash] SHA1 required by HIBP API, not for password storage
  const sha1Hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = sha1Hash.substring(0, 5)
  const suffix = sha1Hash.substring(5)

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'User-Agent': 'XyraPanel',
      },
    })

    if (!response.ok) {
      return {
        compromised: false,
        message: 'Unable to check password status',
      }
    }

    const data = await response.text()
    const hashes = data.split('\n').map(line => line.split(':')[0])
    
    const isCompromised = hashes.includes(suffix)

    if (isCompromised) {
      await db.update(tables.users)
        .set({
          passwordCompromised: true,
          updatedAt: new Date(),
        })
        .where(eq(tables.users.id, userId))
        .run()
    }
    else {
      await db.update(tables.users)
        .set({
          passwordCompromised: false,
          updatedAt: new Date(),
        })
        .where(eq(tables.users.id, userId))
        .run()
    }

    return {
      compromised: isCompromised,
      message: isCompromised
        ? 'This password has been found in a data breach. Please change it immediately.'
        : 'Your password has not been found in any known data breaches.',
    }
  }
  catch (error) {
    console.error('Failed to check password against Have I Been Pwned', error)
    return {
      compromised: false,
      message: 'Unable to check password status',
    }
  }
})

