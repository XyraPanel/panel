import { describe, it, expect } from 'vitest';
import { buildBetterAuthSession, isAdmin, type BetterAuthSession } from './fixtures';

describe('isAdmin', () => {
  it('returns false for null session', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false for session without user', () => {
    const sessionWithoutUser = { session: null, user: null };
    expect(isAdmin(sessionWithoutUser as BetterAuthSession)).toBe(false);
  });

  it('returns false for non-admin role', () => {
    const userSession = buildBetterAuthSession({ id: 'user-4', username: 'user', role: 'user' });
    expect(isAdmin(userSession)).toBe(false);
  });

  it('returns true when session user has admin role', () => {
    const adminSession = buildBetterAuthSession({
      id: 'admin-1',
      username: 'admin',
      role: 'admin',
    });
    expect(isAdmin(adminSession)).toBe(true);
  });

  it('returns false when role is undefined', () => {
    const sessionWithoutRole = buildBetterAuthSession({
      id: 'user-5',
      username: 'user',
      role: undefined,
    });
    expect(isAdmin(sessionWithoutRole)).toBe(false);
  });

  it('returns false when role is null', () => {
    const sessionWithNullRole = buildBetterAuthSession({
      id: 'user-6',
      username: 'user',
      role: undefined,
    });
    expect(isAdmin(sessionWithNullRole)).toBe(false);
  });
});
