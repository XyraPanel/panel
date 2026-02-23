import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('defineEventHandler', (handler: (...args: unknown[]) => unknown) => handler);

const mockRequireAccountUser = vi.fn();
const mockReadValidatedBodyWithLimit = vi.fn();
const mockVerifyTOTP = vi.fn();
const mockRecordAuditEventFromRequest = vi.fn();

const baseEvent = { node: { req: { headers: {} } } };

function createTestEvent() {
  return Object.assign({}, baseEvent);
}

vi.mock('~~/server/utils/security', () => ({
  BODY_SIZE_LIMITS: { SMALL: 64 * 1024 },
  requireAccountUser: mockRequireAccountUser,
  readValidatedBodyWithLimit: mockReadValidatedBodyWithLimit,
}));

vi.mock('~~/server/utils/auth', () => ({
  getAuth: () => ({
    api: {
      verifyTOTP: mockVerifyTOTP,
    },
  }),
  normalizeHeadersForAuth: vi.fn(() => ({})),
}));

vi.mock('~~/server/utils/audit', () => ({
  recordAuditEventFromRequest: mockRecordAuditEventFromRequest,
}));

const handler = (await import('../../../server/api/user/2fa/verify.post')).default;

describe('server/api/user/2fa/verify.post', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not verify TOTP when request is unauthenticated', async () => {
    mockRequireAccountUser.mockRejectedValue({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });

    const event = createTestEvent();

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockVerifyTOTP).not.toHaveBeenCalled();
    expect(mockRecordAuditEventFromRequest).not.toHaveBeenCalled();
  });
});
