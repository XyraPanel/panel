import { eq } from 'drizzle-orm';
import { useDrizzle, tables } from '#server/utils/drizzle';
import type { NodeResourceUsage } from '#shared/types/server';

export async function getNodeResourceUsage(nodeId: string): Promise<NodeResourceUsage> {
  const db = useDrizzle();

  const usageRows = await db
    .select({
      memory: tables.serverLimits.memory,
      disk: tables.serverLimits.disk,
    })
    .from(tables.serverLimits)
    .innerJoin(tables.servers, eq(tables.serverLimits.serverId, tables.servers.id))
    .where(eq(tables.servers.nodeId, nodeId));

  return {
    memory: usageRows.reduce((total, row) => total + toNumber(row.memory), 0),
    disk: usageRows.reduce((total, row) => total + toNumber(row.disk), 0),
    serverCount: usageRows.length,
  };
}

export function canNodeFitResources(
  node: {
    memory: number;
    memoryOverallocate: number;
    disk: number;
    diskOverallocate: number;
  },
  currentUsage: NodeResourceUsage,
  required: { memory: number; disk: number },
): boolean {
  const memoryLimit = calculateLimit(node.memory, node.memoryOverallocate);
  const diskLimit = calculateLimit(node.disk, node.diskOverallocate);

  const nextMemory = currentUsage.memory + required.memory;
  const nextDisk = currentUsage.disk + required.disk;

  const fitsMemory = memoryLimit === Infinity || nextMemory <= memoryLimit;
  const fitsDisk = diskLimit === Infinity || nextDisk <= diskLimit;

  return fitsMemory && fitsDisk;
}

function calculateLimit(base: number, overallocate: number): number {
  if (overallocate === -1) {
    return Infinity;
  }

  const percentage = Math.max(overallocate, 0);
  return base * (1 + percentage / 100);
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
}
