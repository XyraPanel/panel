import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'
import { getWingsClientForServer } from '~~/server/utils/wings-client'
import { recordAuditEvent } from '~~/server/utils/audit'
import { sendBackupCompletedEmail } from '~~/server/utils/email'
import { invalidateServerBackupsCache } from '~~/server/utils/backups'
import { randomUUID } from 'crypto'
import type { BackupManagerOptions, CreateBackupOptions, BackupInfo } from '#shared/types/server'

export class BackupManager {
  private db = useDrizzle()

  private async getServerOwnerContact(ownerId: string | null | undefined) {
    if (!ownerId) {
      return null
    }

    return this.db
      .select({ email: tables.users.email, username: tables.users.username })
      .from(tables.users)
      .where(eq(tables.users.id, ownerId))
      .get()
  }

  async createBackup(serverUuid: string, options: CreateBackupOptions = {}): Promise<BackupInfo> {
    const { client, server } = await getWingsClientForServer(serverUuid)
    
    const backupId = randomUUID()
    const backupUuid = randomUUID()
    const now = new Date()
    
    const backupName = options.name || `backup-${now.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`
    
    const backupRecord = {
      id: backupId,
      serverId: server.id as string,
      uuid: backupUuid,
      name: backupName,
      ignoredFiles: options.ignoredFiles || '',
      disk: 'wings',
      checksum: null,
      bytes: 0,
      isSuccessful: false,
      isLocked: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.db.insert(tables.serverBackups).values(backupRecord)
    await invalidateServerBackupsCache(server.id as string)

    try {
      await client.createBackup(serverUuid, backupUuid, options.ignoredFiles)

      if (!options.skipAudit && options.userId) {
        await recordAuditEvent({
          actor: options.userId,
          actorType: 'user',
          action: 'server.backup.create',
          targetType: 'server',
          targetId: server.id as string,
          metadata: { 
            backupId,
            backupName,
          },
        })
      }

      const owner = await this.getServerOwnerContact(server.ownerId as string | undefined)
      if (owner?.email) {
        await sendBackupCompletedEmail(owner.email, server.name as string, backupName)
      }

      return {
        id: backupId,
        uuid: backupUuid,
        name: backupName,
        serverId: server.id as string,
        serverUuid,
        size: 0,
        isSuccessful: false,
        isLocked: false,
        checksum: undefined,
        ignoredFiles: options.ignoredFiles,
        completedAt: null,
        createdAt: now,
      }
    } catch (error) {
      await this.db
        .update(tables.serverBackups)
        .set({
          isSuccessful: false,
          updatedAt: new Date(),
        })
        .where(eq(tables.serverBackups.id, backupId))
        .run()
      await invalidateServerBackupsCache(server.id as string)

      throw error
    }
  }

  async deleteBackup(serverUuid: string, backupUuid: string, options: BackupManagerOptions = {}): Promise<void> {
    const { client, server } = await getWingsClientForServer(serverUuid)
    
    const backup = await this.db
      .select()
      .from(tables.serverBackups)
      .where(and(
        eq(tables.serverBackups.serverId, server.id as string),
        eq(tables.serverBackups.uuid, backupUuid)
      ))
      .get()

    if (!backup) {
      throw new Error('Backup not found')
    }

    if (backup.isLocked) {
      throw new Error('Cannot delete locked backup')
    }

    await client.deleteBackup(serverUuid, backupUuid)

    await this.db
      .delete(tables.serverBackups)
      .where(eq(tables.serverBackups.id, backup.id))
      .run()
    await invalidateServerBackupsCache(server.id as string)

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.backup.delete',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { 
          backupId: backup.id,
          backupName: backup.name,
          size: backup.bytes,
        },
      })
    }
  }

  async restoreBackup(
    serverUuid: string, 
    backupUuid: string, 
    truncate: boolean = false,
    options: BackupManagerOptions = {}
  ): Promise<void> {
    const { client, server } = await getWingsClientForServer(serverUuid)
    
    const backup = await this.db
      .select()
      .from(tables.serverBackups)
      .where(and(
        eq(tables.serverBackups.serverId, server.id as string),
        eq(tables.serverBackups.uuid, backupUuid)
      ))
      .get()

    if (!backup) {
      throw new Error('Backup not found')
    }

    if (!backup.isSuccessful) {
      throw new Error('Cannot restore failed backup')
    }

    await client.restoreBackup(serverUuid, backupUuid, truncate)

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.backup.restore',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { 
          backupId: backup.id,
          backupName: backup.name,
          truncate,
        },
      })
    }
  }

  async listBackups(serverUuid: string): Promise<BackupInfo[]> {
    const { server } = await getWingsClientForServer(serverUuid)
    
    const backups = await this.db
      .select()
      .from(tables.serverBackups)
      .where(eq(tables.serverBackups.serverId, server.id as string))
      .orderBy(tables.serverBackups.createdAt)
      .all()

    return backups.map(backup => ({
      id: backup.id,
      uuid: backup.uuid,
      name: backup.name,
      serverId: backup.serverId,
      serverUuid,
      size: backup.bytes,
      isSuccessful: backup.isSuccessful,
      isLocked: backup.isLocked,
      checksum: backup.checksum || undefined,
      ignoredFiles: backup.ignoredFiles || undefined,
      completedAt: backup.completedAt || undefined,
      createdAt: backup.createdAt,
    }))
  }

  async getBackup(serverUuid: string, backupUuid: string): Promise<BackupInfo | null> {
    const { server } = await getWingsClientForServer(serverUuid)
    
    const backup = await this.db
      .select()
      .from(tables.serverBackups)
      .where(and(
        eq(tables.serverBackups.serverId, server.id as string),
        eq(tables.serverBackups.uuid, backupUuid)
      ))
      .get()

    if (!backup) {
      return null
    }

    return {
      id: backup.id,
      uuid: backup.uuid,
      name: backup.name,
      serverId: backup.serverId,
      serverUuid,
      size: backup.bytes,
      isSuccessful: backup.isSuccessful,
      isLocked: backup.isLocked,
      checksum: backup.checksum || undefined,
      ignoredFiles: backup.ignoredFiles || undefined,
      completedAt: backup.completedAt || undefined,
      createdAt: backup.createdAt,
    }
  }

  async lockBackup(serverUuid: string, backupUuid: string, options: BackupManagerOptions = {}): Promise<void> {
    const { server } = await getWingsClientForServer(serverUuid)
    
    const backup = await this.db
      .select()
      .from(tables.serverBackups)
      .where(and(
        eq(tables.serverBackups.serverId, server.id as string),
        eq(tables.serverBackups.uuid, backupUuid)
      ))
      .get()

    if (!backup) {
      throw new Error('Backup not found')
    }

    await this.db
      .update(tables.serverBackups)
      .set({
        isLocked: true,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverBackups.id, backup.id))
      .run()
    await invalidateServerBackupsCache(server.id as string)

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.backup.lock',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { 
          backupId: backup.id,
          backupName: backup.name,
        },
      })
    }
  }

  async unlockBackup(serverUuid: string, backupUuid: string, options: BackupManagerOptions = {}): Promise<void> {
    const { server } = await getWingsClientForServer(serverUuid)
    
    const backup = await this.db
      .select()
      .from(tables.serverBackups)
      .where(and(
        eq(tables.serverBackups.serverId, server.id as string),
        eq(tables.serverBackups.uuid, backupUuid)
      ))
      .get()

    if (!backup) {
      throw new Error('Backup not found')
    }

    await this.db
      .update(tables.serverBackups)
      .set({
        isLocked: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverBackups.id, backup.id))
      .run()
    await invalidateServerBackupsCache(server.id as string)

    if (!options.skipAudit && options.userId) {
      await recordAuditEvent({
        actor: options.userId,
        actorType: 'user',
        action: 'server.backup.unlock',
        targetType: 'server',
        targetId: server.id as string,
        metadata: { 
          backupId: backup.id,
          backupName: backup.name,
        },
      })
    }
  }

  getDownloadUrl(serverUuid: string, backupUuid: string): string {
    return `/api/servers/${serverUuid}/backups/${backupUuid}/download`
  }

  async syncBackupsWithWings(serverUuid: string): Promise<{ synced: number; errors: string[] }> {
    const { client, server } = await getWingsClientForServer(serverUuid)
    
    try {
      const wingsBackups = await client.listBackups(serverUuid)
      const dbBackups = await this.listBackups(serverUuid)
      
      const errors: string[] = []
      let synced = 0

      for (const wingsBackup of wingsBackups) {
        const dbBackup = dbBackups.find(b => b.uuid === wingsBackup.uuid)
        
        if (dbBackup) {
          await this.db
            .update(tables.serverBackups)
            .set({
              checksum: wingsBackup.sha256_hash,
              bytes: wingsBackup.bytes,
              isSuccessful: !!wingsBackup.completed_at,
              completedAt: wingsBackup.completed_at ? new Date(wingsBackup.completed_at) : null,
              updatedAt: new Date(),
            })
            .where(eq(tables.serverBackups.id, dbBackup.id))
            .run()
          
          synced++
        } else {
          try {
            await this.db.insert(tables.serverBackups).values({
              id: randomUUID(),
              serverId: server.id as string,
              uuid: wingsBackup.uuid,
              name: wingsBackup.name,
              ignoredFiles: wingsBackup.ignored_files.join('\n'),
              disk: 'wings',
              checksum: wingsBackup.sha256_hash,
              bytes: wingsBackup.bytes,
              isSuccessful: !!wingsBackup.completed_at,
              isLocked: false,
              completedAt: wingsBackup.completed_at ? new Date(wingsBackup.completed_at) : null,
              createdAt: new Date(wingsBackup.created_at),
              updatedAt: new Date(),
            })
            synced++
          } catch (error) {
            errors.push(`Failed to create backup record for ${wingsBackup.name}: ${error}`)
          }
        }
      }

      return { synced, errors }
    } catch (error) {
      throw new Error(`Failed to sync backups: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export const backupManager = new BackupManager()
