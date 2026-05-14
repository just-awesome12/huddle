import { describe, expect, it } from 'vitest';
import {
  signUpSchema,
  signInSchema,
  passwordResetRequestSchema,
  usernameSchema,
  displayNameSchema,
  profileUpdateSchema,
  onboardingSchema,
} from '../src';

// =====================================================================
// Helpers
// =====================================================================

/** Build a valid sign-up payload, overriding fields per test. */
function validSignUp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    email: 'alice@huddle.test',
    password: 'password123',
    username: 'alice',
    displayName: 'Alice',
    turnstileToken: 'mock-turnstile-token',
    ...overrides,
  };
}


// =====================================================================
// Username
// =====================================================================

describe('usernameSchema', () => {
  it('accepts a minimum-length valid username', () => {
    expect(usernameSchema.parse('abc')).toBe('abc');
  });

  it('accepts the maximum length', () => {
    const u = 'a'.repeat(30);
    expect(usernameSchema.parse(u)).toBe(u);
  });

  it('accepts underscores and digits', () => {
    expect(usernameSchema.parse('user_42_test')).toBe('user_42_test');
  });

  it('lowercases mixed-case input', () => {
    expect(usernameSchema.parse('AliceWonder')).toBe('alicewonder');
  });

  it('trims whitespace', () => {
    expect(usernameSchema.parse('  alice  ')).toBe('alice');
  });

  it('rejects usernames shorter than 3 chars', () => {
    expect(() => usernameSchema.parse('ab')).toThrow(/at least 3/);
  });

  it('rejects usernames longer than 30 chars', () => {
    expect(() => usernameSchema.parse('a'.repeat(31))).toThrow(/at most 30/);
  });

  it('rejects hyphens', () => {
    expect(() => usernameSchema.parse('alice-w')).toThrow(/lowercase letters/);
  });

  it('rejects spaces', () => {
    expect(() => usernameSchema.parse('alice w')).toThrow(/lowercase letters/);
  });

  it('rejects symbols', () => {
    expect(() => usernameSchema.parse('alice!')).toThrow(/lowercase letters/);
  });
});


// =====================================================================
// Display name
// =====================================================================

describe('displayNameSchema', () => {
  it('accepts a single character', () => {
    expect(displayNameSchema.parse('A')).toBe('A');
  });

  it('accepts the maximum length', () => {
    const d = 'a'.repeat(60);
    expect(displayNameSchema.parse(d)).toBe(d);
  });

  it('accepts unicode and spaces', () => {
    expect(displayNameSchema.parse('Alice の Wonder')).toBe('Alice の Wonder');
  });

  it('trims', () => {
    expect(displayNameSchema.parse('  Alice  ')).toBe('Alice');
  });

  it('rejects empty after trim', () => {
    expect(() => displayNameSchema.parse('   ')).toThrow(/required/);
  });

  it('rejects > 60 chars', () => {
    expect(() => displayNameSchema.parse('a'.repeat(61))).toThrow(/at most 60/);
  });
});


// =====================================================================
// Sign-up
// =====================================================================

describe('signUpSchema', () => {
  it('accepts a valid payload', () => {
    expect(signUpSchema.parse(validSignUp())).toMatchObject({
      email: 'alice@huddle.test',
      username: 'alice',
      displayName: 'Alice',
    });
  });

  it('lowercases the email', () => {
    const parsed = signUpSchema.parse(validSignUp({ email: 'Alice@Huddle.TEST' }));
    expect(parsed.email).toBe('alice@huddle.test');
  });

  it('rejects malformed email', () => {
    expect(() => signUpSchema.parse(validSignUp({ email: 'not-an-email' })))
      .toThrow(/valid email/);
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(() => signUpSchema.parse(validSignUp({ password: 'short' })))
      .toThrow(/at least 8/);
  });

  it('rejects passwords longer than 72 chars (bcrypt limit)', () => {
    expect(() => signUpSchema.parse(validSignUp({ password: 'a'.repeat(73) })))
      .toThrow(/at most 72/);
  });

  it('accepts a password at exactly 72 chars', () => {
    const p = 'a'.repeat(72);
    expect(signUpSchema.parse(validSignUp({ password: p })).password).toBe(p);
  });

  it('rejects missing turnstileToken', () => {
    expect(() => signUpSchema.parse(validSignUp({ turnstileToken: '' })))
      .toThrow(/human-verification/);
  });

  it('rejects invalid username', () => {
    expect(() => signUpSchema.parse(validSignUp({ username: 'AB' })))
      .toThrow(/at least 3/);
  });

  it('rejects invalid display name', () => {
    expect(() => signUpSchema.parse(validSignUp({ displayName: '' })))
      .toThrow(/required/);
  });
});


// =====================================================================
// Sign-in
// =====================================================================

describe('signInSchema', () => {
  it('accepts a valid payload', () => {
    expect(signInSchema.parse({
      email: 'alice@huddle.test',
      password: 'whatever',
    })).toEqual({
      email: 'alice@huddle.test',
      password: 'whatever',
    });
  });

  it('does NOT enforce password length (sign-in keeps legacy passwords usable)', () => {
    // A 3-char password is invalid for SIGN-UP, but should be accepted
    // on sign-in if the user already has one.
    expect(() => signInSchema.parse({
      email: 'alice@huddle.test',
      password: 'abc',
    })).not.toThrow();
  });

  it('rejects empty password', () => {
    expect(() => signInSchema.parse({
      email: 'alice@huddle.test',
      password: '',
    })).toThrow(/Password is required/);
  });

  it('rejects malformed email', () => {
    expect(() => signInSchema.parse({
      email: 'nope',
      password: 'whatever',
    })).toThrow(/valid email/);
  });
});


// =====================================================================
// Password reset request
// =====================================================================

describe('passwordResetRequestSchema', () => {
  it('accepts a valid email', () => {
    expect(passwordResetRequestSchema.parse({ email: 'alice@huddle.test' }))
      .toEqual({ email: 'alice@huddle.test' });
  });

  it('rejects malformed email', () => {
    expect(() => passwordResetRequestSchema.parse({ email: 'nope' }))
      .toThrow(/valid email/);
  });
});


// =====================================================================
// Profile update
// =====================================================================

describe('profileUpdateSchema', () => {
  it('accepts a full update', () => {
    expect(profileUpdateSchema.parse({
      username: 'new_name',
      displayName: 'New Name',
      avatarUrl: 'https://example.com/avatar.png',
    })).toMatchObject({
      username: 'new_name',
      displayName: 'New Name',
    });
  });

  it('accepts an empty object (nothing to update is valid)', () => {
    expect(profileUpdateSchema.parse({})).toEqual({});
  });

  it('accepts an empty-string avatarUrl as a clear signal', () => {
    expect(profileUpdateSchema.parse({ avatarUrl: '' })).toEqual({ avatarUrl: '' });
  });

  it('rejects a non-URL avatar', () => {
    expect(() => profileUpdateSchema.parse({ avatarUrl: 'not-a-url' }))
      .toThrow();
  });
});


// =====================================================================
// Onboarding
// =====================================================================

describe('onboardingSchema', () => {
  it('accepts a valid payload', () => {
    expect(onboardingSchema.parse({
      username: 'alice',
      displayName: 'Alice',
    })).toEqual({
      username: 'alice',
      displayName: 'Alice',
    });
  });

  it('requires both fields', () => {
    expect(() => onboardingSchema.parse({ username: 'alice' })).toThrow();
    expect(() => onboardingSchema.parse({ displayName: 'Alice' })).toThrow();
  });
});
