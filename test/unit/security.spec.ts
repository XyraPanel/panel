import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { H3Event } from 'h3';
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

const { requireAuth, requireAdmin } = await import('../../server/utils/security');

const mockEvent = {} as H3Event;

describe('server/utils/security', () => {
  const mockGetServerSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
  const mockRequireAdminPermission = requireAdminPermission as unknown as ReturnType<typeof vi.fn>;

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
