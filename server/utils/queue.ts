import { randomUUID } from 'node:crypto';
import type { QueueJob } from '#shared/types/queue';

class SimpleQueue {
  private jobs: Map<string, QueueJob> = new Map();
  private processing = false;

  async add(type: string, data: Record<string, unknown>): Promise<string> {
    const jobId = randomUUID();
    const job: QueueJob = {
      id: jobId,
      type,
      data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    if (!this.processing) {
      this.processQueue();
    }

    return jobId;
  }

  getJob(jobId: string): QueueJob | undefined {
    return this.jobs.get(jobId);
  }

  private async processQueue() {
    this.processing = true;

    while (this.jobs.size > 0) {
      const pendingJobs = Array.from(this.jobs.values()).filter((j) => j.status === 'pending');

      if (pendingJobs.length === 0) {
        break;
      }

      const job = pendingJobs[0];
      if (!job) {
        break;
      }

      job.status = 'processing';
      job.startedAt = new Date();

      try {
        await this.executeJob(job);
        job.status = 'completed';
        job.completedAt = new Date();
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = new Date();
      }

      setTimeout(
        () => {
          this.jobs.delete(job.id);
        },
        5 * 60 * 1000,
      );
    }

    this.processing = false;
  }

  private async executeJob(job: QueueJob) {
    console.log(`Processing job ${job.id} of type ${job.type}`);

    switch (job.type) {
      case 'server:create':
        await this.createServer(job.data as { serverId: string; startOnCompletion?: boolean });
        break;
      case 'server:delete':
        await this.deleteServer(job.data as { serverUuid: string });
        break;
      case 'server:reinstall':
        await this.reinstallServer(job.data as { serverUuid: string });
        break;
      case 'backup:create':
        await this.createBackup(
          job.data as { serverUuid: string; name?: string; ignored?: string },
        );
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  private async createServer(data: { serverId: string; startOnCompletion?: boolean }) {
    const { useDrizzle, tables, eq } = await import('./drizzle');
    const { getWingsClientForServer } = await import('./wings-client');
    const db = useDrizzle();

    const [server] = await db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.id, data.serverId))
      .limit(1);

    if (!server) {
      throw new Error('Server not found');
    }

    const { client } = await getWingsClientForServer(server.uuid);

    const [limits] = await db
      .select()
      .from(tables.serverLimits)
      .where(eq(tables.serverLimits.serverId, server.id))
      .limit(1);

    const config = {
      uuid: server.uuid,
      start_on_completion: data.startOnCompletion ?? true,
      build: {
        memory_limit: limits?.memory || 512,
        swap: limits?.swap || 0,
        cpu_limit: limits?.cpu || 100,
        disk_space: limits?.disk || 1024,
      },
    };

    await client.createServer(server.uuid, config);
  }

  private async deleteServer(data: { serverUuid: string }) {
    const { getWingsClientForServer } = await import('./wings-client');
    const { client } = await getWingsClientForServer(data.serverUuid);
    await client.deleteServer(data.serverUuid);
  }

  private async reinstallServer(data: { serverUuid: string }) {
    const { getWingsClientForServer } = await import('./wings-client');
    const { client } = await getWingsClientForServer(data.serverUuid);
    await client.reinstallServer(data.serverUuid);
  }

  private async createBackup(data: { serverUuid: string; name?: string; ignored?: string }) {
    const { backupManager } = await import('./backup-manager');
    await backupManager.createBackup(data.serverUuid, {
      name: data.name,
      ignoredFiles: data.ignored,
      skipAudit: true,
    });
  }
}

const queue = new SimpleQueue();

export async function queueServerCreation(
  serverId: string,
  startOnCompletion = true,
): Promise<string> {
  return queue.add('server:create', { serverId, startOnCompletion });
}

export async function queueServerDeletion(serverUuid: string): Promise<string> {
  return queue.add('server:delete', { serverUuid });
}

export async function queueServerReinstall(serverUuid: string): Promise<string> {
  return queue.add('server:reinstall', { serverUuid });
}

export async function queueBackupCreation(
  serverUuid: string,
  name?: string,
  ignored?: string,
): Promise<string> {
  return queue.add('backup:create', { serverUuid, name, ignored });
}

export function getQueueJob(jobId: string) {
  return queue.getJob(jobId);
}
