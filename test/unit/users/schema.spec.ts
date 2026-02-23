import { describe, it, expect } from 'vitest';
import { createUserSchema } from '../../../shared/schema/admin/users.js';
import { basePayload } from './fixtures';

describe('createUserSchema - core validation', () => {
  it('accepts a valid payload and infers defaults', () => {
    const result = createUserSchema.parse(basePayload);

    expect(result).toEqual({
      ...basePayload,
      role: 'admin',
    });
  });

  it('rejects invalid email format', () => {
    const invalid = {
      ...basePayload,
      email: 'not-an-email',
    };

    const parsed = createUserSchema.safeParse(invalid);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toContain('email');
    }
  });

  it('rejects password that is too short', () => {
    const invalid = {
      ...basePayload,
      password: 'short',
    };

    const parsed = createUserSchema.safeParse(invalid);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toContain('password');
    }
  });

  it('rejects invalid role', () => {
    const invalid = {
      ...basePayload,
      role: 'invalid-role' as 'admin' | 'user',
    };

    const parsed = createUserSchema.safeParse(invalid);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toContain('role');
    }
  });

  it('accepts valid user role', () => {
    const userPayload = {
      ...basePayload,
      role: 'user' as const,
    };

    const result = createUserSchema.parse(userPayload);
    expect(result.role).toBe('user');
  });

  it('accepts valid admin role', () => {
    const result = createUserSchema.parse(basePayload);
    expect(result.role).toBe('admin');
  });

  it('validates username length', () => {
    const invalid = {
      ...basePayload,
      username: '',
    };

    const parsed = createUserSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('validates name length', () => {
    const invalid = {
      ...basePayload,
      name: '',
    };

    const parsed = createUserSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

describe('createUserSchema - field specific validation', () => {
  it('accepts valid email addresses', () => {
    const validEmails = [
      'user@example.com',
      'test.user@example.co.uk',
      'user+tag@example.com',
      'user_name@example-domain.com',
    ];

    validEmails.forEach((email) => {
      const payload = { ...basePayload, email };
      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid email addresses', () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      'user@example',
      'user space@example.com',
    ];

    invalidEmails.forEach((email) => {
      const payload = { ...basePayload, email };
      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  it('accepts passwords of minimum length', () => {
    const payload = { ...basePayload, password: '12345678' };
    const result = createUserSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    const shortPasswords = ['1234567', 'short', 'pass', ''];

    shortPasswords.forEach((password) => {
      const payload = { ...basePayload, password };
      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  it('accepts valid usernames', () => {
    const validUsernames = ['user123', 'test_user', 'admin-user', 'User123'];

    validUsernames.forEach((username) => {
      const payload = { ...basePayload, username };
      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  it('rejects empty usernames', () => {
    const payload = { ...basePayload, username: '' };
    const result = createUserSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('accepts valid roles', () => {
    const validRoles = ['user', 'admin'];

    validRoles.forEach((role) => {
      const payload = { ...basePayload, role: role as 'user' | 'admin' };
      const result = createUserSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});
