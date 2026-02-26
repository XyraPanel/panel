import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent as createH3Event } from 'h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const mockRecordAuditEventFromRequest = vi.fn();

vi.mock('~~/server/utils/audit', () => ({
  recordAuditEventFromRequest: mockRecordAuditEventFromRequest,
}));

const errorHandler = (await import('../../server/error')).default;

function createTestEvent(path: string) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = 'GET';
  req.url = path;
  req.headers = {
    accept: 'application/json',
  };

  const res = new ServerResponse(req);
  const event = createH3Event(req, res);
  event.context.auth = {
    user: {
      id: 'user-1',
      email: 'admin@example.com',
    },
  };
  return event;
}

describe('server/error handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('getRequestIP', () => '127.0.0.1');
  });

  it('records privileged API failures to audit logs', async () => {
    const event = createTestEvent('/api/admin/users');
    const error = {
      status: 401,
      message: 'Authentication required',
      name: 'H3Error',
      data: undefined,
      stack: '',
    } as Error & { status: number; data?: unknown };

    await errorHandler(error, event);

    expect(mockRecordAuditEventFromRequest).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEventFromRequest).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        action: 'security.request.denied',
        targetType: 'settings',
        targetId: '/api/admin/users',
      }),
    );
  });

  it('does not audit non-api page errors', async () => {
    const event = createTestEvent('/admin');
    const error = {
      status: 500,
      message: 'Failure',
      name: 'H3Error',
      stack: '',
    } as Error & { status: number };

    await errorHandler(error, event);

    expect(mockRecordAuditEventFromRequest).not.toHaveBeenCalled();
  });
});
