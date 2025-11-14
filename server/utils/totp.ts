import { authenticator } from 'otplib'
import { randomBytes } from 'node:crypto'

export function generateTotpSecret(): string {
  return authenticator.generateSecret()
}

export function generateTotpUri(secret: string, username: string, issuer: string = 'XyraPanel'): string {
  return authenticator.keyuri(username, issuer, secret)
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret })
  }
  catch {
    return false
  }
}

export function generateRecoveryTokens(count: number = 8): string[] {
  const tokens: string[] = []
  for (let i = 0; i < count; i++) {

    const token = randomBytes(4).toString('hex').toUpperCase()
    tokens.push(token)
  }
  return tokens
}

export async function hashRecoveryToken(token: string): Promise<string> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.default.hash(token, 10)
}

export async function verifyRecoveryToken(token: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.default.compare(token, hash)
}
