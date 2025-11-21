import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { recordAuditEvent } from '~~/server/utils/audit'
import { randomUUID, createHash } from 'crypto'
import type {
  SSHKeyManagerOptions,
  SSHKeyInfo,
  CreateSSHKeyOptions,
} from '#shared/types/ssh-keys'

export class SSHKeyManager {
  private db = useDrizzle()

  private generateFingerprint(publicKey: string): string {
    const keyParts = publicKey.trim().split(' ')
    if (keyParts.length < 2) {
      throw new Error('Invalid SSH public key format')
    }

    const keyData = keyParts[1]
    if (!keyData) {
      throw new Error('Invalid SSH public key format')
    }

    try {
      const keyBuffer = Buffer.from(keyData, 'base64')
      const hash = createHash('sha256').update(keyBuffer).digest('base64')

      return `SHA256:${hash}`
    }
    catch {
      throw new Error('Invalid SSH public key format')
    }
  }

  private validateSSHKey(publicKey: string): { keyType: string; isValid: boolean } {
    const supportedTypes = ['ssh-rsa', 'ssh-ed25519', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521']
    
    const trimmedKey = publicKey.trim()
    const keyParts = trimmedKey.split(' ')
    
    if (keyParts.length < 2) {
      return { keyType: 'unknown', isValid: false }
    }
    
    const keyType = keyParts[0]
    const keyData = keyParts[1]
    if (!keyType || !keyData) {
      return { keyType: 'unknown', isValid: false }
    }
    
    if (!supportedTypes.includes(keyType)) {
      return { keyType, isValid: false }
    }
    
    try {
      Buffer.from(keyData, 'base64')
      return { keyType, isValid: true }
    } catch {
      return { keyType, isValid: false }
    }
  }

  async createSSHKey(options: CreateSSHKeyOptions): Promise<SSHKeyInfo> {
    if (!options.userId) {
      throw new Error('User ID is required')
    }

    const { name, publicKey } = options
    
    const validation = this.validateSSHKey(publicKey)
    if (!validation.isValid) {
      throw new Error('Invalid SSH public key format')
    }

    const fingerprint = this.generateFingerprint(publicKey)
    
    const existingKey = await this.db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.fingerprint, fingerprint))
      .get()

    if (existingKey) {
      throw new Error('SSH key already exists')
    }

    const keyId = randomUUID()
    const now = new Date()

    const sshKeyRecord = {
      id: keyId,
      userId: options.userId,
      name,
      fingerprint,
      publicKey: publicKey.trim(),
      createdAt: now,
      updatedAt: now,
    }

    await this.db.insert(tables.sshKeys).values(sshKeyRecord)

    if (!options.skipAudit) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'user.ssh_key.create',
        targetType: 'user',
        targetId: keyId,
        metadata: { 
          name,
          fingerprint,
          keyType: validation.keyType,
        },
      })
    }

    return {
      id: keyId,
      userId: options.userId,
      name,
      fingerprint,
      publicKey: publicKey.trim(),
      createdAt: now,
      updatedAt: now,
    }
  }

  async deleteSSHKey(keyId: string, options: SSHKeyManagerOptions = {}): Promise<void> {
    const sshKey = await this.db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.id, keyId))
      .get()

    if (!sshKey) {
      throw new Error('SSH key not found')
    }

    if (options.userId && sshKey.userId !== options.userId) {
      throw new Error('Permission denied')
    }

    await this.db
      .delete(tables.sshKeys)
      .where(eq(tables.sshKeys.id, keyId))
      .run()

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'user.ssh_key.delete',
        targetType: 'user',
        targetId: keyId,
        metadata: { 
          name: sshKey.name,
          fingerprint: sshKey.fingerprint,
        },
      })
    }
  }

  async listSSHKeys(userId: string): Promise<SSHKeyInfo[]> {
    const keys = await this.db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.userId, userId))
      .orderBy(tables.sshKeys.createdAt)
      .all()

    return keys.map(key => ({
      id: key.id,
      userId: key.userId,
      name: key.name,
      fingerprint: key.fingerprint,
      publicKey: key.publicKey,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }))
  }

  async getSSHKey(keyId: string, userId?: string): Promise<SSHKeyInfo | null> {
    const key = await this.db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.id, keyId))
      .get()

    if (!key) {
      return null
    }

    if (userId && key.userId !== userId) {
      return null
    }

    return {
      id: key.id,
      userId: key.userId,
      name: key.name,
      fingerprint: key.fingerprint,
      publicKey: key.publicKey,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }
  }

  async getSSHKeyByFingerprint(fingerprint: string): Promise<SSHKeyInfo | null> {
    const key = await this.db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.fingerprint, fingerprint))
      .get()

    if (!key) {
      return null
    }

    return {
      id: key.id,
      userId: key.userId,
      name: key.name,
      fingerprint: key.fingerprint,
      publicKey: key.publicKey,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }
  }

  async updateSSHKey(keyId: string, updates: { name?: string }, options: SSHKeyManagerOptions = {}): Promise<SSHKeyInfo> {
    const sshKey = await this.db
      .select()
      .from(tables.sshKeys)
      .where(eq(tables.sshKeys.id, keyId))
      .get()

    if (!sshKey) {
      throw new Error('SSH key not found')
    }

    if (options.userId && sshKey.userId !== options.userId) {
      throw new Error('Permission denied')
    }

    const now = new Date()
    const updateData = {
      ...updates,
      updatedAt: now,
    }

    await this.db
      .update(tables.sshKeys)
      .set(updateData)
      .where(eq(tables.sshKeys.id, keyId))
      .run()

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'user.ssh_key.update',
        targetType: 'user',
        targetId: keyId,
        metadata: { 
          updates,
          fingerprint: sshKey.fingerprint,
        },
      })
    }

    return {
      id: sshKey.id,
      userId: sshKey.userId,
      name: updates.name || sshKey.name,
      fingerprint: sshKey.fingerprint,
      publicKey: sshKey.publicKey,
      createdAt: sshKey.createdAt,
      updatedAt: now,
    }
  }

  validatePublicKey(publicKey: string): { isValid: boolean; keyType?: string; fingerprint?: string; error?: string } {
    try {
      const validation = this.validateSSHKey(publicKey)
      
      if (!validation.isValid) {
        return {
          isValid: false,
          error: `Unsupported or invalid SSH key type: ${validation.keyType}`,
        }
      }

      const fingerprint = this.generateFingerprint(publicKey)

      return {
        isValid: true,
        keyType: validation.keyType,
        fingerprint,
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Invalid SSH key format',
      }
    }
  }
}

export const sshKeyManager = new SSHKeyManager()
