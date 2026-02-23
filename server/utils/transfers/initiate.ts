import { randomUUID } from 'node:crypto';
import { useDrizzle, tables, eq, and, isNull, inArray } from '#server/utils/drizzle';
import { getNodeResourceUsage, canNodeFitResources } from '#server/utils/nodes/capacity';
import { resolveNodeConnection } from '#server/utils/wings/nodesStore';
import { generateWingsJWT } from '#server/utils/wings/jwt';
import { createWingsTransferClient } from '#server/utils/wings/transfer';
import type { TransferOptions, TransferResult } from '#shared/types/server';

export class TransferError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'TransferError';
  }
}

export async function initiateServerTransfer(
  serverId: string,
  targetNodeId: string,
  options: TransferOptions = {},
): Promise<TransferResult> {
  const db = useDrizzle();
  const now = new Date().toISOString();

  const serverRows = await db
    .select({
      id: tables.servers.id,
      uuid: tables.servers.uuid,
      name: tables.servers.name,
      nodeId: tables.servers.nodeId,
      allocationId: tables.servers.allocationId,
      status: tables.servers.status,
    })
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  const server = serverRows[0];

  if (!server) {
    throw new TransferError('Server not found', 404);
  }

  if (!server.nodeId) {
    throw new TransferError('Server is not assigned to a node', 400);
  }

  if (server.nodeId === targetNodeId) {
    throw new TransferError('Server is already on the requested node', 400);
  }

  const activeTransferRows = await db
    .select({ id: tables.serverTransfers.id })
    .from(tables.serverTransfers)
    .where(
      and(
        eq(tables.serverTransfers.serverId, serverId),
        eq(tables.serverTransfers.archived, false),
      ),
    )
    .limit(1);

  const activeTransfer = activeTransferRows[0];

  if (activeTransfer) {
    throw new TransferError('A transfer is already in progress for this server', 409);
  }

  const targetNodeRows = await db
    .select()
    .from(tables.wingsNodes)
    .where(eq(tables.wingsNodes.id, targetNodeId))
    .limit(1);

  const targetNode = targetNodeRows[0];

  if (!targetNode) {
    throw new TransferError('Target node not found', 404);
  }

  const serverLimitsRows = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .limit(1);

  const serverLimits = serverLimitsRows[0];

  if (!serverLimits) {
    throw new TransferError('Server limits not configured', 422);
  }

  const targetUsage = await getNodeResourceUsage(targetNodeId);
  const requiredResources = {
    memory: typeof serverLimits.memory === 'number' ? serverLimits.memory : 0,
    disk: typeof serverLimits.disk === 'number' ? serverLimits.disk : 0,
  };

  const targetCapacity = {
    memory: typeof targetNode.memory === 'number' ? targetNode.memory : 0,
    memoryOverallocate:
      typeof targetNode.memoryOverallocate === 'number' ? targetNode.memoryOverallocate : 0,
    disk: typeof targetNode.disk === 'number' ? targetNode.disk : 0,
    diskOverallocate:
      typeof targetNode.diskOverallocate === 'number' ? targetNode.diskOverallocate : 0,
  };

  if (!canNodeFitResources(targetCapacity, targetUsage, requiredResources)) {
    throw new TransferError('Target node does not have enough available resources', 422);
  }

  const newAllocationId = await resolveTargetAllocation(targetNodeId, options.allocationId);

  const existingAllocations = await db
    .select({ id: tables.serverAllocations.id, isPrimary: tables.serverAllocations.isPrimary })
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, serverId));

  const oldAdditionalAllocations = existingAllocations
    .filter((allocation) => allocation.id !== server.allocationId)
    .map((allocation) => String(allocation.id));

  const requestedAdditionalAllocations = normalizeIdArray(options.additionalAllocationIds);

  const newAdditionalAllocations = await validateAdditionalAllocations(db, {
    nodeId: targetNodeId,
    allocationIds: requestedAdditionalAllocations,
  });

  const transferId = randomUUID();
  const originalStatus = server.status;

  await db.transaction(async (tx) => {
    const allocationUpdates = [newAllocationId, ...newAdditionalAllocations];

    await tx.insert(tables.serverTransfers).values({
      id: transferId,
      serverId,
      oldNode: String(server.nodeId),
      newNode: targetNodeId,
      oldAllocation: String(server.allocationId),
      newAllocation: newAllocationId,
      oldAdditionalAllocations: JSON.stringify(oldAdditionalAllocations),
      newAdditionalAllocations: JSON.stringify(newAdditionalAllocations),
      successful: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    if (allocationUpdates.length > 0) {
      await tx
        .update(tables.serverAllocations)
        .set({
          serverId,
          isPrimary: false,
          updatedAt: now,
        })
        .where(inArray(tables.serverAllocations.id, allocationUpdates));
    }

    await tx
      .update(tables.servers)
      .set({
        status: 'transferring',
        updatedAt: now,
      })
      .where(eq(tables.servers.id, serverId));
  });

  try {
    const sourceNodeConnection = await resolveNodeConnection(server.nodeId);
    const targetNodeConnection = await resolveNodeConnection(targetNodeId);

    const destinationUrl = `${targetNode.scheme}://${targetNode.fqdn}:${targetNode.daemonListen}/api/transfers`;
    const transferJwt = await generateWingsJWT(
      {
        tokenSecret: targetNodeConnection.connection.tokenSecret,
        baseUrl: targetNode.baseUrl,
      },
      {
        subject: server.uuid,
        expiresIn: '15m',
        identifiedBy: `${server.uuid}:${Date.now()}`,
      },
    );

    const sourceClient = createWingsTransferClient({
      fqdn: sourceNodeConnection.stored.fqdn,
      scheme: sourceNodeConnection.stored.scheme,
      daemonListen: sourceNodeConnection.stored.daemonListen,
      tokenId: sourceNodeConnection.connection.tokenId,
      tokenSecret: sourceNodeConnection.connection.tokenSecret,
      allowInsecure: sourceNodeConnection.stored.allowInsecure,
    });

    await sourceClient.notifyTransfer({
      serverUuid: server.uuid,
      destination: {
        baseUrl: destinationUrl,
        token: `Bearer ${transferJwt}`,
      },
      startOnCompletion: Boolean(options.startOnCompletion),
    });
  } catch (error) {
    await rollbackTransfer(db, {
      transferId,
      serverId,
      allocationIds: [newAllocationId, ...newAdditionalAllocations],
      originalStatus,
    });

    const message = error instanceof Error ? error.message : 'Failed to initiate transfer';
    throw new TransferError(message, 502);
  }

  return {
    transferId,
    server: {
      id: server.id,
      uuid: server.uuid,
      name: server.name,
    },
    sourceNodeId: server.nodeId,
    targetNodeId,
    newAllocationId,
  };
}

async function resolveTargetAllocation(
  nodeId: string,
  requestedAllocationId?: string,
): Promise<string> {
  const db = useDrizzle();
  const now = new Date().toISOString();

  if (requestedAllocationId) {
    const allocationRows = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, requestedAllocationId))
      .limit(1);

    const allocation = allocationRows[0];

    if (!allocation || allocation.nodeId !== nodeId) {
      throw new TransferError('Specified allocation does not belong to the target node', 422);
    }

    if (allocation.serverId) {
      throw new TransferError('Specified allocation is already in use', 409);
    }

    return allocation.id;
  }

  const availableRows = await db
    .select({ id: tables.serverAllocations.id })
    .from(tables.serverAllocations)
    .where(
      and(eq(tables.serverAllocations.nodeId, nodeId), isNull(tables.serverAllocations.serverId)),
    )
    .limit(1);

  const available = availableRows[0];

  if (!available) {
    throw new TransferError('No available allocations on target node', 422);
  }

  await db
    .update(tables.serverAllocations)
    .set({ updatedAt: now })
    .where(eq(tables.serverAllocations.id, available.id));

  return available.id;
}

async function rollbackTransfer(
  db: ReturnType<typeof useDrizzle>,
  context: {
    transferId: string;
    serverId: string;
    allocationIds: string[];
    originalStatus: string | null;
  },
): Promise<void> {
  const rollbackTime = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx
      .delete(tables.serverTransfers)
      .where(eq(tables.serverTransfers.id, context.transferId));

    if (context.allocationIds.length > 0) {
      await tx
        .update(tables.serverAllocations)
        .set({
          serverId: null,
          updatedAt: rollbackTime,
        })
        .where(inArray(tables.serverAllocations.id, context.allocationIds));
    }

    await tx
      .update(tables.servers)
      .set({
        status: context.originalStatus,
        updatedAt: rollbackTime,
      })
      .where(eq(tables.servers.id, context.serverId));
  });
}

function normalizeIdArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

async function validateAdditionalAllocations(
  db: ReturnType<typeof useDrizzle>,
  context: { nodeId: string; allocationIds: string[] },
): Promise<string[]> {
  if (context.allocationIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(context.allocationIds));

  const rows = await db
    .select({
      id: tables.serverAllocations.id,
      nodeId: tables.serverAllocations.nodeId,
      serverId: tables.serverAllocations.serverId,
    })
    .from(tables.serverAllocations)
    .where(inArray(tables.serverAllocations.id, uniqueIds));

  if (rows.length !== uniqueIds.length) {
    throw new TransferError('One or more additional allocations were not found', 422);
  }

  for (const row of rows) {
    if (row.nodeId !== context.nodeId) {
      throw new TransferError('Additional allocations must belong to the target node', 422);
    }

    if (row.serverId) {
      throw new TransferError('Additional allocation is already assigned to a server', 409);
    }
  }

  return rows.map((row) => String(row.id));
}
