import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { H3Event } from 'h3';
import type { IncomingMessage } from 'node:http';

const defineEventHandlerStub = (handler: (event: H3Event) => Promise<unknown>) => handler;
vi.stubGlobal('defineEventHandler', defineEventHandlerStub);

const mockSendRedirect = vi.fn();
const mockCreateError = vi.fn((error: unknown) => error);

vi.mock('h3', () => ({
  createError: mockCreateError,
  sendRedirect: mockSendRedirect,
  defineEventHandler: (handler: (event: H3Event) => Promise<unknown>) => handler,
}));

const mockGetServerSession = vi.fn();
vi.mock('~~/server/utils/session', () => ({
  getServerSession: mockGetServerSession,
}));

const mockRequireSessionUser = vi.fn();
vi.mock('~~/server/utils/auth/sessionUser', () => ({
  requireSessionUser: mockRequireSessionUser,
}));

const mockAuthApi = {
  verifyApiKey: vi.fn(),
};

const mockAuth = {
  api: mockAuthApi,
};

vi.mock('~~/server/utils/auth', () => ({
  getAuth: () => mockAuth,
  normalizeHeadersForAuth: () => ({}),
}));

const mockUseDrizzle = vi.fn();
const mockTables = {
  users: {
    id: Symbol('users.id'),
    username: Symbol('users.username'),
    email: Symbol('users.email'),
    role: Symbol('users.role'),
    rootAdmin: Symbol('users.rootAdmin'),
    passwordResetRequired: Symbol('users.passwordResetRequired'),
  },
};

vi.mock('~~/server/utils/drizzle', () => ({
  useDrizzle: mockUseDrizzle,
  tables: mockTables,
  eq: (...args: unknown[]) => args,
}));

vi.mock('~~/server/utils/audit', () => ({
  recordAuditEventFromRequest: vi.fn(() => Promise.resolve()),
}));

type MiddlewareHandler = (event: H3Event) => Promise<unknown>;
let middleware: MiddlewareHandler;

type MockRequest = IncomingMessage & {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
};

const createRequest = (overrides: Partial<MockRequest> = {}): MockRequest =>
  ({
    headers: {},
    method: 'GET',
    url: '/',
    ...overrides,
  }) as MockRequest;

interface EventOptions {
  path?: string;
  method?: string;
  req?: Partial<MockRequest>;
}

const baseEvent = (options: EventOptions = {}): H3Event =>
  ({
    node: {
      req: createRequest(options.req),
    },
    path: options.path ?? '/account',
    method: options.method ?? 'GET',
    context: {},
  }) as H3Event;

describe('auth.global middleware', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockSendRedirect.mockReset();
    mockRequireSessionUser.mockReset();
    middleware = (await import('../../../server/middleware/auth.global.ts'))
      .default as MiddlewareHandler;
  });

  it('redirects to forced reset page when password reset required for page request', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mockRequireSessionUser.mockReturnValue({
      id: 'user-1',
      role: 'user',
      passwordResetRequired: true,
    });

    const event = baseEvent({ path: '/account', req: { url: '/account' } });

    await middleware(event);

    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      '/auth/password/force?redirect=%2Faccount',
      302,
    );
  });

  it('allows forced reset API calls even when reset required', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mockRequireSessionUser.mockReturnValue({
      id: 'user-1',
      role: 'user',
      passwordResetRequired: false,
    });

    const event = baseEvent({
      path: '/api/account/password/force',
      method: 'PUT',
      req: {
        url: '/api/account/password/force',
        method: 'PUT',
      },
    });

    await middleware(event);

    expect(mockSendRedirect).not.toHaveBeenCalled();
  });

  it('throws when non-admin user accesses admin API', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mockRequireSessionUser.mockReturnValue({
      id: 'user-1',
      role: 'user',
      passwordResetRequired: false,
    });

    const event = baseEvent({
      path: '/admin/settings',
      req: {
        url: '/admin/settings',
      },
    });

    await middleware(event);
    expect(mockSendRedirect).toHaveBeenCalledWith(event, '/', 302);
  });
});
