import { describe, it, expect } from 'vitest';
import {
  buildBetterAuthSession,
  getSessionUser,
  resolveSessionUser,
  type BetterAuthSession,
} from './fixtures';

describe('resolveSessionUser', () => {
  it('returns null when session is null', () => {
    expect(resolveSessionUser(null)).toBeNull();
  });

  it('returns null when session user is missing', () => {
    const sessionWithoutUser = { session: null, user: null };
    expect(resolveSessionUser(sessionWithoutUser as BetterAuthSession)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const sessionWithoutFields = buildBetterAuthSession({
      id: undefined,
      username: undefined,
      role: undefined,
    });
    expect(resolveSessionUser(sessionWithoutFields)).toBeNull();
  });

  it('maps a valid better-auth session user into resolved shape', () => {
    const session = buildBetterAuthSession({
      id: 'user-123',
      username: 'test-user',
      role: 'admin',
      name: 'Test User',
      email: 'user@example.com',
      permissions: ['admin.users.read', 'admin.servers.read'],
      passwordResetRequired: false,
    });

    const resolved = resolveSessionUser(session);

    expect(resolved).toEqual({
      id: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      username: 'test-user',
      role: 'admin',
      permissions: ['admin.users.read', 'admin.servers.read'],
      image: null,
      remember: null,
      passwordResetRequired: false,
    });
  });

  it('handles optional fields correctly', () => {
    const session = buildBetterAuthSession({
      id: 'user-456',
      username: 'minimal-user',
      role: 'user',
      email: 'minimal@example.com',
    });

    const resolved = resolveSessionUser(session);

    expect(resolved).toEqual({
      id: 'user-456',
      email: 'minimal@example.com',
      name: null,
      username: 'minimal-user',
      role: 'user',
      permissions: [],
      image: null,
      remember: null,
      passwordResetRequired: false,
    });
  });
});

describe('getSessionUser', () => {
  it('returns null when session is null', () => {
    expect(getSessionUser(null)).toBeNull();
  });

  it('returns null when session user is missing', () => {
    const sessionWithoutUser = { session: null, user: null };
    expect(getSessionUser(sessionWithoutUser as BetterAuthSession)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const incomplete = buildBetterAuthSession({
      id: 'user-1',
      username: undefined,
      role: undefined,
    });
    expect(getSessionUser(incomplete)).toBeNull();
  });

  it('normalizes optional fields with defaults', () => {
    const session = buildBetterAuthSession({
      id: 'user-2',
      username: 'playerOne',
      role: 'user',
      email: 'player@example.com',
    });

    const user = getSessionUser(session);

    expect(user).toEqual({
      id: 'user-2',
      username: 'playerOne',
      role: 'user',
      permissions: [],
      email: 'player@example.com',
      name: null,
      image: null,
      remember: null,
      passwordResetRequired: false,
    });
  });

  it('preserves provided optional fields', () => {
    const session = buildBetterAuthSession({
      id: 'user-3',
      username: 'mod',
      role: 'user',
      email: 'mod@example.com',
      permissions: ['server.view', 'server.edit'],
      name: 'Moderator',
      image: 'https://example.com/avatar.png',
      remember: true,
      passwordResetRequired: true,
    });

    const user = getSessionUser(session);

    expect(user).toEqual({
      id: 'user-3',
      username: 'mod',
      role: 'user',
      permissions: ['server.view', 'server.edit'],
      email: 'mod@example.com',
      name: 'Moderator',
      image: 'https://example.com/avatar.png',
      remember: true,
      passwordResetRequired: true,
    });
  });

  it('handles null optional fields correctly', () => {
    const session = buildBetterAuthSession({
      id: 'user-4',
      username: 'nulluser',
      role: 'user',
      email: 'null@example.com',
      name: null,
      image: null,
      remember: null,
    });

    const user = getSessionUser(session);

    expect(user).toEqual({
      id: 'user-4',
      username: 'nulluser',
      role: 'user',
      permissions: [],
      email: 'null@example.com',
      name: null,
      image: null,
      remember: null,
      passwordResetRequired: false,
    });
  });
});
