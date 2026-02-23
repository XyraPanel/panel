import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent as createH3Event } from 'h3';
import { IncomingMessage, ServerResponse } from 'node-mock-http';

const mockRecordAuditEventFromRequest = vi.fn();

vi.mock('~~/server/utils/audit', () => ({
  recordAuditEventFromRequest: mockRecordAuditEventFromRequest,
}));

const errorHandler = (await import('../../server/error')).default;

function createTestEvent(path: string) {
  const req = new IncomingMessage();
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
      statusText: 'Unauthorized',
      message: 'Authentication required',
      name: 'H3Error',
      data: undefined,
      stack: '',
    } as Error & { status: number; statusText: string; data?: unknown };

    await errorHandler(error, event, {
      defaultHandler: vi.fn(async () => ({
        status: 500,
        headers: {},
        body: '',
      })),
    });

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
      statusText: 'Internal Server Error',
      message: 'Failure',
      name: 'H3Error',
      stack: '',
    } as Error & { status: number; statusText: string };

    await errorHandler(error, event, {
      defaultHandler: vi.fn(async () => ({
        status: 500,
        headers: {},
        body: '',
      })),
    });

    expect(mockRecordAuditEventFromRequest).not.toHaveBeenCalled();
  });
});
