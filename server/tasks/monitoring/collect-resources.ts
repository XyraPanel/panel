import { resourceMonitor } from '#server/utils/resource-monitor';
import { debugLog, debugError, debugWarn } from '#server/utils/logger';
import { withAdvisoryLock } from '#server/utils/advisory-lock';

interface CollectResourcesResult {
  skipped: boolean;
  collectedAt?: string;
  duration?: number;
  servers?: {
    total: number;
    online: number;
    offline: number;
  };
  nodes?: {
    total: number;
    totalMemory: number;
    usedMemory: number;
    totalServers: number;
  };
}

export default defineTask({
  meta: {
    name: 'monitoring:collect-resources',
    description: 'Collect server and node resource statistics',
  },
  async run({
    payload: _payload,
    context: _context,
  }): Promise<{ result: CollectResourcesResult }> {
    const startTime = Date.now();

    try {
      const stats = await withAdvisoryLock('monitoring:collect-resources', () =>
        collectResources(startTime),
      );

      if (!stats) {
        debugLog('[monitoring] Resource collection already running elsewhere, skipping...');
        return { result: { skipped: true } };
      }

      return { result: { skipped: false, ...stats } };
    } catch (error) {
      const errorMsg = `Resource collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      debugError(errorMsg);
      throw new Error(errorMsg);
    }
  },
});

async function collectResources(startTime: number) {
  debugLog(`[${new Date().toISOString()}] Starting resource collection...`);

  const serverResources = await resourceMonitor.getAllServerResources();
  debugLog(`Collected resources for ${serverResources.length} servers`);

  const nodeResources = await resourceMonitor.getAllNodeResources();
  const onlineNodes = nodeResources.filter(
    (node) => node.status === 'online' || node.status === 'maintenance',
  );
  const offlineNodes = nodeResources.filter((node) => node.status === 'offline');

  debugLog(
    `Collected resources for ${nodeResources.length} nodes (${onlineNodes.length} online, ${offlineNodes.length} offline)${offlineNodes.length > 0 ? ' - review offline nodes in admin dashboard' : ''}`,
  );

  if (offlineNodes.length > 0) {
    for (const node of offlineNodes) {
      debugWarn(
        `[monitoring] Wings node ${node.nodeId} unreachable: ${node.message ?? 'no details provided'}`,
      );
    }
  }

  const duration = Date.now() - startTime;

  const result = {
    collectedAt: new Date().toISOString(),
    duration,
    servers: {
      total: serverResources.length,
      online: serverResources.filter((s) => s.state === 'running').length,
      offline: serverResources.filter((s) => s.state === 'offline').length,
    },
    nodes: {
      total: nodeResources.length,
      totalMemory: nodeResources.reduce((sum, n) => sum + n.totalMemory, 0),
      usedMemory: nodeResources.reduce((sum, n) => sum + n.usedMemory, 0),
      totalServers: nodeResources.reduce((sum, n) => sum + n.serverCount, 0),
    },
  };

  debugLog(
    `[${new Date().toISOString()}] Resource collection completed in ${duration}ms:`,
    result,
  );

  return result;
}
