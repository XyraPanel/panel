import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { H3Event } from 'h3';

const defineEventHandlerStub = (handler: (event: H3Event) => Promise<unknown>) => handler;
vi.stubGlobal('defineEventHandler', defineEventHandlerStub);

const mockAssertMethod = vi.fn<(event: H3Event, method: string) => void>();
type MockH3Error = { status: number; statusText: string; message?: string };

vi.mock('h3', () => ({
  assertMethod: mockAssertMethod,
  createError: (err: MockH3Error) => err,
  defineEventHandler: (handler: (event: H3Event) => Promise<unknown>) => handler,
}));

const mockRequireAccountUser =
  vi.fn<() => Promise<{ session: { id: string }; user: { id: string } }>>();
const mockReadValidatedBodyWithLimit =
  vi.fn<(event: H3Event, schema: unknown, limit: number) => Promise<{ newPassword: string }>>();
const BODY_SIZE_LIMITS_MOCK = { SMALL: 64 * 1024 };

vi.mock('~~/server/utils/security', () => ({
  requireAccountUser: mockRequireAccountUser,
  readValidatedBodyWithLimit: mockReadValidatedBodyWithLimit,
  BODY_SIZE_LIMITS: BODY_SIZE_LIMITS_MOCK,
  generatePasswordHash: vi.fn(() => 'hashed-password'),
  validatePassword: vi.fn(() => {
    throw new Error('Invalid password');
  }),
}));

const mockGetServerSession = vi.fn();
vi.mock('~~/server/utils/session', () => ({
  getServerSession: mockGetServerSession,
}));

const mockResolveSessionUser = vi.fn();
const mockRequireSessionUser = vi.fn();
vi.mock('~~/server/utils/auth/sessionUser', () => ({
  resolveSessionUser: mockResolveSessionUser,
  requireSessionUser: mockRequireSessionUser,
}));

interface SelectRow {
  password: string;
  passwordResetRequired: boolean;
}

const mockUseDrizzle = vi.fn<() => ReturnType<typeof createDb>>();
vi.mock('~~/server/utils/drizzle', () => ({
  useDrizzle: mockUseDrizzle,
  tables: {
    users: {
      id: Symbol('users.id'),
      password: Symbol('users.password'),
      passwordResetRequired: Symbol('users.passwordResetRequired'),
    },
    sessions: {
      userId: Symbol('sessions.userId'),
    },
  },
  eq: (...args: unknown[]) => args,
  isPostgresDialect: false,
}));

const mockRecordAudit = vi.fn<(event: H3Event, payload: Record<string, unknown>) => Promise<void>>(
  () => Promise.resolve(),
);
vi.mock('~~/server/utils/audit', () => ({
  recordAuditEventFromRequest: mockRecordAudit,
}));

const mockBcrypt = {
  hash: vi.fn(async () => 'hashed-password'),
  compare: vi.fn(async () => false),
};
vi.mock('bcryptjs', () => ({
  default: mockBcrypt,
}));

type Handler = (event: H3Event) => Promise<unknown>;
let handler: Handler;

function createDb(selectResult: SelectRow | undefined, deletedChanges = 1) {
  const selectBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(() => selectResult),
  };

  const updateRun = vi.fn();
  const updateBuilder = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn(() => ({
      run: updateRun,
    })),
  };

  const deleteBuilder = {
    where: vi.fn(() => ({
      run: vi.fn(() => ({ changes: deletedChanges })),
    })),
  };

  return {
    select: vi.fn(() => selectBuilder),
    update: vi.fn(() => updateBuilder),
    delete: vi.fn(() => deleteBuilder),
  };
}

const baseEvent: H3Event = {
  node: { req: { method: 'PUT', headers: {} } },
  context: {},
} as unknown as H3Event;

describe('account/password/force.put handler', () => {
  beforeAll(async () => {
    handler = (await import('../../../server/api/account/password/force.put.ts'))
      .default as Handler;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockReadValidatedBodyWithLimit.mockResolvedValue({ newPassword: 'new-password' });
    mockRequireAccountUser.mockResolvedValue({
      session: { id: 'session-1' },
      user: { id: 'user-1' },
    });
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    });
    const forcedResetUser = {
      id: 'user-1',
      email: 'user@example.com',
      passwordResetRequired: true,
    };
    mockResolveSessionUser.mockReturnValue(forcedResetUser);
    mockRequireSessionUser.mockReturnValue(forcedResetUser);
  });

  it('updates password, clears reset flag, and records audit event', async () => {
    mockUseDrizzle.mockReturnValue(
      createDb(
        {
          password: 'old-hash',
          passwordResetRequired: true,
        },
        2,
      ),
    );

    const result = await handler(baseEvent);

    expect(mockAssertMethod).toHaveBeenCalledWith(baseEvent, 'PUT');
    expect(mockRequireAccountUser).toHaveBeenCalledWith(baseEvent);
    expect(mockResolveSessionUser).not.toHaveBeenCalled();
    expect(mockBcrypt.compare).toHaveBeenCalledWith('new-password', 'old-hash');
    expect(mockBcrypt.hash).toHaveBeenCalledWith('new-password', 12);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      baseEvent,
      expect.objectContaining({
        action: 'account.password.force_update',
        metadata: { revokedSessions: 2 },
      }),
    );
    expect(result).toEqual({ success: true, revokedSessions: 2 });
  });

  it('rejects when password reset is not required', async () => {
    mockUseDrizzle.mockReturnValue(
      createDb({
        password: 'old-hash',
        passwordResetRequired: false,
      }),
    );
    const resetNotRequiredUser = {
      id: 'user-1',
      email: 'user@example.com',
      passwordResetRequired: false,
    };
    mockResolveSessionUser.mockReturnValue(resetNotRequiredUser);
    mockRequireSessionUser.mockReturnValue(resetNotRequiredUser);

    await expect(handler(baseEvent)).rejects.toMatchObject({
      status: 400,
      statusText: 'Bad Request',
      message: 'Password reset not required',
    });
    expect(mockBcrypt.hash).not.toHaveBeenCalled();
  });
});
