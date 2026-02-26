export type QueueJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface QueueJob {
  id: string;
  type: string;
  data: Record<string, unknown>;
  status: QueueJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
