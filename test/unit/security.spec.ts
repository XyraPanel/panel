import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvent } from 'h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { getServerSession } from '../../server/utils/session';
import { requireAdminPermission } from '../../server/utils/permission-middleware';

vi.mock('../../server/utils/session', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('../../server/utils/permission-middleware', () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock('../../server/utils/auth', () => ({
  getAuth: () => ({
    api: {
      getSession: vi.fn(),
    },
  }),
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
  normalizeHeadersForAuth: () => ({}),
}));

vi.stubGlobal(
  'createError',
  (opts: {
    status?: number;
    statusCode?: number;
    statusText?: string;
    statusMessage?: string;
    message?: string;
  }) => {
    const err = new Error(opts.message ?? opts.statusText ?? opts.statusMessage);
    Object.assign(err, {
      statusCode: opts.statusCode ?? opts.status,
      statusMessage: opts.statusMessage ?? opts.statusText,
      ...opts,
    });
    return err;
  },
);

const { requireAuth, requireAdmin } = await import('../../server/utils/security');

const mockEvent = createEvent(
  new IncomingMessage(new Socket()),
  new ServerResponse(new IncomingMessage(new Socket())),
);

describe('server/utils/security', () => {
  const mockGetServerSession = vi.mocked(getServerSession);
  const mockRequireAdminPermission = vi.mocked(requireAdminPermission);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('requireAuth', () => {
    it('returns the current session when a user is present', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123' },
      });

      const session = await requireAuth(mockEvent);

      expect(session).toEqual({ user: { id: 'user-123' } });
      expect(mockGetServerSession).toHaveBeenCalledWith(mockEvent);
    });

    it('throws when no authenticated session is found', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await expect(requireAuth(mockEvent)).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      });
    });
  });

  describe('requireAdmin', () => {
    it('ensures admin permission is checked before returning the session', async () => {
      mockRequireAdminPermission.mockResolvedValue({
        userId: 'admin-1',
        isAdmin: true,
        isOwner: false,
        hasPermissions: true,
        missingPermissions: [],
      });
      mockGetServerSession.mockResolvedValue({
        user: { id: 'admin-1' },
      });

      const session = await requireAdmin(mockEvent);

      expect(session).toEqual({ user: { id: 'admin-1' } });
      expect(mockRequireAdminPermission).toHaveBeenCalledWith(mockEvent);
      expect(mockGetServerSession).toHaveBeenCalledWith(mockEvent);
    });

    it('throws when session lookup after permission check fails', async () => {
      mockRequireAdminPermission.mockResolvedValue({
        userId: 'admin-1',
        isAdmin: true,
        isOwner: false,
        hasPermissions: true,
        missingPermissions: [],
      });
      mockGetServerSession.mockResolvedValue(null);

      await expect(requireAdmin(mockEvent)).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      });
    });
  });
});
