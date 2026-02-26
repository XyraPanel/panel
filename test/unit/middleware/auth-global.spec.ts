import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { H3Event } from 'h3';
import { createEvent } from 'h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const { mockSendRedirect, mockCreateError } = vi.hoisted(() => ({
  mockSendRedirect: vi.fn(),
  mockCreateError: vi.fn((error: unknown) => error),
}));

const defineEventHandlerStub = (handler: (event: H3Event) => Promise<unknown>) => handler;
vi.stubGlobal('defineEventHandler', defineEventHandlerStub);
vi.stubGlobal('sendRedirect', mockSendRedirect);
vi.stubGlobal('createError', mockCreateError);

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>();
  return {
    ...actual,
    createError: mockCreateError,
    sendRedirect: mockSendRedirect,
    defineEventHandler: (handler: (event: H3Event) => Promise<unknown>) => handler,
  };
});

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

let middleware: (event: H3Event) => Promise<unknown>;

function createTestEvent(options: { path?: string; method?: string; url?: string } = {}): H3Event {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method ?? 'GET';
  req.url = options.url ?? options.path ?? '/';
  req.headers = {};
  const res = new ServerResponse(req);
  const event = createEvent(req, res);
  event.context = {};
  Object.defineProperty(event, 'path', { value: options.path ?? '/account', writable: true });
  Object.defineProperty(event, 'method', { value: options.method ?? 'GET', writable: true });
  return event;
}

describe('auth.global middleware', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockSendRedirect.mockReset();
    mockRequireSessionUser.mockReset();
    const mod = await import('../../../server/middleware/auth.global.ts');
    if (typeof mod.default === 'function') {
      middleware = mod.default;
    }
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

    const event = createTestEvent({ path: '/account', url: '/account' });

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

    const event = createTestEvent({
      path: '/api/account/password/force',
      method: 'PUT',
      url: '/api/account/password/force',
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

    const event = createTestEvent({
      path: '/admin/settings',
      url: '/admin/settings',
    });

    await middleware(event);
    expect(mockSendRedirect).toHaveBeenCalledWith(event, '/', 302);
  });
});
