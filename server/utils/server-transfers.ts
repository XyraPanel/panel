

import { useDrizzle, tables, eq } from './drizzle'
import { getWingsClient } from './wings-client'
import type { WingsNode } from './wings-client'
import { randomUUID } from 'crypto'

export interface ServerTransferConfig {
  serverId: string
  targetNodeId: string
  targetAllocationId: string
}

export interface TransferStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
}

async function _initiateServerTransfer(
  config: ServerTransferConfig
): Promise<string> {
  const db = useDrizzle()
  const now = new Date()

  const server = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, config.serverId))
    .get()

  if (!server) {
    throw new Error('Server not found')
  }

  if (!server.nodeId) {
    throw new Error('Server has no source node')
  }

  const targetNode = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, config.targetNodeId))
    .get()

  if (!targetNode) {
    throw new Error('Target node not found')
  }

  const targetAllocation = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, config.targetAllocationId))
    .get()

  if (!targetAllocation) {
    throw new Error('Target allocation not found')
  }

  if (targetAllocation.serverId) {
    throw new Error('Target allocation already in use')
  }

  if (targetAllocation.nodeId !== config.targetNodeId) {
    throw new Error('Allocation does not belong to target node')
  }

  const transferId = randomUUID()
  await db.insert(tables.serverTransfers).values({
    id: transferId,
    serverId: config.serverId,
    oldNode: server.nodeId,
    newNode: config.targetNodeId,
    oldAllocation: server.allocationId!,
    newAllocation: config.targetAllocationId,
    successful: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  })

  await db
    .update(tables.servers)
    .set({
      status: 'transferring',
      updatedAt: now,
    })
    .where(eq(tables.servers.id, config.serverId))
    .run()

  processServerTransfer(transferId).catch(error => {
    console.error('Transfer process failed:', error)
  })

  return transferId
}

async function processServerTransfer(transferId: string): Promise<void> {
  const db = useDrizzle()

  try {

    const transfer = await db
      .select()
      .from(tables.serverTransfers)
      .where(eq(tables.serverTransfers.id, transferId))
      .get()

    if (!transfer) {
      throw new Error('Transfer not found')
    }

    const server = await db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.id, transfer.serverId))
      .get()

    if (!server) {
      throw new Error('Server not found')
    }

    const [sourceNode, targetNode] = await Promise.all([
      db.select().from(tables.wingsNodes).where(eq(tables.wingsNodes.id, transfer.oldNode)).get(),
      db.select().from(tables.wingsNodes).where(eq(tables.wingsNodes.id, transfer.newNode)).get(),
    ])

    if (!sourceNode || !targetNode) {
      throw new Error('Source or target node not found')
    }

    const sourceWingsNode: WingsNode = {
      id: sourceNode.id,
      fqdn: sourceNode.fqdn,
      scheme: sourceNode.scheme as 'http' | 'https',
      daemonListen: sourceNode.daemonListen,
      daemonSftp: sourceNode.daemonSftp,
      daemonBase: sourceNode.daemonBase,
      tokenId: sourceNode.tokenIdentifier,
      token: sourceNode.tokenSecret,
    }

    const targetWingsNode: WingsNode = {
      id: targetNode.id,
      fqdn: targetNode.fqdn,
      scheme: targetNode.scheme as 'http' | 'https',
      daemonListen: targetNode.daemonListen,
      daemonSftp: targetNode.daemonSftp,
      daemonBase: targetNode.daemonBase,
      tokenId: targetNode.tokenIdentifier,
      token: targetNode.tokenSecret,
    }

    const sourceClient = getWingsClient(sourceWingsNode)
    const targetClient = getWingsClient(targetWingsNode)

    const backup = await sourceClient.createBackup(server.uuid, `Transfer backup ${transferId}`)

    const downloadUrl = sourceClient.getBackupDownloadUrl(server.uuid, backup.uuid)

    await targetClient.pullFile(
      server.uuid,
      downloadUrl,
      '/',
      `transfer-${transferId}.tar.gz`,
      false,
      false
    )

    await db
      .update(tables.servers)
      .set({
        nodeId: transfer.newNode,
        allocationId: transfer.newAllocation,
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.id, transfer.serverId))
      .run()

    await db
      .update(tables.serverAllocations)
      .set({
        serverId: null,
        isPrimary: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverAllocations.id, transfer.oldAllocation))
      .run()

    await db
      .update(tables.serverAllocations)
      .set({
        serverId: transfer.serverId,
        isPrimary: true,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverAllocations.id, transfer.newAllocation))
      .run()

    await sourceClient.deleteServer(server.uuid)

    await sourceClient.deleteBackup(server.uuid, backup.uuid)

    await db
      .update(tables.serverTransfers)
      .set({
        successful: true,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverTransfers.id, transferId))
      .run()

    await db
      .update(tables.servers)
      .set({
        status: 'offline',
        updatedAt: new Date(),
      })
      .where(eq(tables.servers.id, transfer.serverId))
      .run()

  } catch (error) {
    console.error('Transfer failed:', error)

    await db
      .update(tables.serverTransfers)
      .set({
        successful: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.serverTransfers.id, transferId))
      .run()

    const transfer = await db
      .select()
      .from(tables.serverTransfers)
      .where(eq(tables.serverTransfers.id, transferId))
      .get()

    if (transfer) {
      await db
        .update(tables.servers)
        .set({
          status: 'transfer_failed',
          updatedAt: new Date(),
        })
        .where(eq(tables.servers.id, transfer.serverId))
        .run()
    }

    throw error
  }
}

export async function getTransferStatus(transferId: string): Promise<TransferStatus> {
  const db = useDrizzle()

  const transfer = await db
    .select()
    .from(tables.serverTransfers)
    .where(eq(tables.serverTransfers.id, transferId))
    .get()

  if (!transfer) {
    throw new Error('Transfer not found')
  }

  let status: 'pending' | 'processing' | 'completed' | 'failed'
  let message: string

  if (transfer.successful === null) {
    status = 'processing'
    message = 'Transfer in progress...'
  } else if (transfer.successful) {
    status = 'completed'
    message = 'Transfer completed successfully'
  } else {
    status = 'failed'
    message = 'Transfer failed'
  }

  return {
    id: transferId,
    status,
    progress: transfer.successful === null ? 50 : transfer.successful ? 100 : 0,
    message,
  }
}

export async function cancelTransfer(transferId: string): Promise<void> {
  const db = useDrizzle()

  const transfer = await db
    .select()
    .from(tables.serverTransfers)
    .where(eq(tables.serverTransfers.id, transferId))
    .get()

  if (!transfer) {
    throw new Error('Transfer not found')
  }

  if (transfer.successful !== null) {
    throw new Error('Cannot cancel completed or failed transfer')
  }

  await db
    .update(tables.serverTransfers)
    .set({
      successful: false,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverTransfers.id, transferId))
    .run()

  await db
    .update(tables.servers)
    .set({
      status: 'offline',
      updatedAt: new Date(),
    })
    .where(eq(tables.servers.id, transfer.serverId))
    .run()
}
