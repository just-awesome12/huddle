import { describe, expect, it } from 'vitest';
import {
  signUpSchema,
  signInSchema,
  passwordResetRequestSchema,
  otpRequestSchema,
  otpVerifySchema,
  usernameSchema,
  displayNameSchema,
  profileUpdateSchema,
  onboardingSchema,
  createGroupSchema,
  updateGroupSchema,
  groupMemberRoleSchema,
  groupVisibilitySchema,
  tagsSchema,
  tagsStringSchema,
  groupSearchSchema,
  normalizeTags,
  createInviteSchema,
  acceptInviteSchema,
  parseEmailList,
  createPollSchema,
  createAvailabilityPollSchema,
  usernameSearchSchema,
  createIdeaSchema,
  updateIdeaSchema,
  updateIdeaStatusSchema,
  ideaFiltersSchema,
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
    expect(() => signUpSchema.parse(validSignUp({ email: 'not-an-email' }))).toThrow(/valid email/);
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(() => signUpSchema.parse(validSignUp({ password: 'short' }))).toThrow(/at least 8/);
  });

  it('rejects passwords longer than 72 chars (bcrypt limit)', () => {
    expect(() => signUpSchema.parse(validSignUp({ password: 'a'.repeat(73) }))).toThrow(
      /at most 72/,
    );
  });

  it('accepts a password at exactly 72 chars', () => {
    const p = 'a'.repeat(72);
    expect(signUpSchema.parse(validSignUp({ password: p })).password).toBe(p);
  });

  it('rejects missing turnstileToken', () => {
    expect(() => signUpSchema.parse(validSignUp({ turnstileToken: '' }))).toThrow(
      /human-verification/,
    );
  });

  it('rejects invalid username', () => {
    expect(() => signUpSchema.parse(validSignUp({ username: 'AB' }))).toThrow(/at least 3/);
  });

  it('rejects invalid display name', () => {
    expect(() => signUpSchema.parse(validSignUp({ displayName: '' }))).toThrow(/required/);
  });
});

// =====================================================================
// Sign-in
// =====================================================================

describe('signInSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      signInSchema.parse({
        email: 'alice@huddle.test',
        password: 'whatever',
      }),
    ).toEqual({
      email: 'alice@huddle.test',
      password: 'whatever',
    });
  });

  it('does NOT enforce password length (sign-in keeps legacy passwords usable)', () => {
    // A 3-char password is invalid for SIGN-UP, but should be accepted
    // on sign-in if the user already has one.
    expect(() =>
      signInSchema.parse({
        email: 'alice@huddle.test',
        password: 'abc',
      }),
    ).not.toThrow();
  });

  it('rejects empty password', () => {
    expect(() =>
      signInSchema.parse({
        email: 'alice@huddle.test',
        password: '',
      }),
    ).toThrow(/Password is required/);
  });

  it('rejects malformed email', () => {
    expect(() =>
      signInSchema.parse({
        email: 'nope',
        password: 'whatever',
      }),
    ).toThrow(/valid email/);
  });
});

// =====================================================================
// Password reset request
// =====================================================================

describe('passwordResetRequestSchema', () => {
  it('accepts a valid email', () => {
    expect(passwordResetRequestSchema.parse({ email: 'alice@huddle.test' })).toEqual({
      email: 'alice@huddle.test',
    });
  });

  it('rejects malformed email', () => {
    expect(() => passwordResetRequestSchema.parse({ email: 'nope' })).toThrow(/valid email/);
  });
});

// =====================================================================
// Passwordless OTP (Phase 15d)
// =====================================================================

describe('otpRequestSchema', () => {
  it('lowercases + trims the email', () => {
    expect(otpRequestSchema.parse({ email: '  Alice@Huddle.TEST ' })).toEqual({
      email: 'alice@huddle.test',
    });
  });

  it('rejects a malformed email', () => {
    expect(() => otpRequestSchema.parse({ email: 'nope' })).toThrow(/valid email/);
  });
});

describe('otpVerifySchema', () => {
  it('accepts a 6-digit code', () => {
    expect(otpVerifySchema.parse({ email: 'a@huddle.test', token: '123456' })).toEqual({
      email: 'a@huddle.test',
      token: '123456',
    });
  });

  it('strips spaces from a pasted code', () => {
    expect(otpVerifySchema.parse({ email: 'a@huddle.test', token: ' 123 456 ' }).token).toBe(
      '123456',
    );
  });

  it('rejects a non-6-digit code', () => {
    expect(() => otpVerifySchema.parse({ email: 'a@huddle.test', token: '12345' })).toThrow(
      /6-digit/,
    );
    expect(() => otpVerifySchema.parse({ email: 'a@huddle.test', token: 'abcdef' })).toThrow(
      /6-digit/,
    );
  });
});

// =====================================================================
// Bulk invite (Phase 15e)
// =====================================================================

describe('parseEmailList', () => {
  it('splits on commas, spaces, and newlines; lowercases + dedupes', () => {
    const r = parseEmailList('Alice@x.com, bob@x.com\nalice@x.com  carol@x.com');
    expect(r.valid).toEqual(['alice@x.com', 'bob@x.com', 'carol@x.com']);
    expect(r.invalid).toEqual([]);
  });

  it('separates unparseable tokens', () => {
    const r = parseEmailList('good@x.com, nope, also-bad@');
    expect(r.valid).toEqual(['good@x.com']);
    expect(r.invalid).toEqual(['nope', 'also-bad@']);
  });

  it('returns empty for blank input', () => {
    expect(parseEmailList('   \n  ')).toEqual({ valid: [], invalid: [], overflow: false });
  });
});

// =====================================================================
// Counted polls (Phase 16)
// =====================================================================

describe('createPollSchema', () => {
  const valid = { groupId: '11111111-1111-1111-1111-111111111111', question: 'Pizza or sushi?' };

  it('accepts a question with 2+ unique options', () => {
    expect(createPollSchema.parse({ ...valid, options: ['Pizza', 'Sushi'] }).options).toEqual([
      'Pizza',
      'Sushi',
    ]);
  });

  it('rejects fewer than 2 options', () => {
    expect(() => createPollSchema.parse({ ...valid, options: ['Only one'] })).toThrow(/at least 2/);
  });

  it('rejects duplicate options (case-insensitive)', () => {
    expect(() => createPollSchema.parse({ ...valid, options: ['Pizza', 'pizza'] })).toThrow(
      /unique/,
    );
  });

  it('rejects more than 10 options', () => {
    const opts = Array.from({ length: 11 }, (_, i) => `Option ${i}`);
    expect(() => createPollSchema.parse({ ...valid, options: opts })).toThrow(/at most 10/);
  });
});

// =====================================================================
// Availability polls (Phase 16b)
// =====================================================================

describe('createAvailabilityPollSchema', () => {
  const base = { groupId: '11111111-1111-1111-1111-111111111111', title: 'Dinner?' };

  it('accepts a title + valid unique dates', () => {
    expect(
      createAvailabilityPollSchema.parse({ ...base, dates: ['2026-07-01', '2026-07-02'] }).dates,
    ).toEqual(['2026-07-01', '2026-07-02']);
  });

  it('rejects an impossible date', () => {
    expect(() => createAvailabilityPollSchema.parse({ ...base, dates: ['2026-02-31'] })).toThrow(
      /valid date/,
    );
  });

  it('rejects duplicate dates', () => {
    expect(() =>
      createAvailabilityPollSchema.parse({ ...base, dates: ['2026-07-01', '2026-07-01'] }),
    ).toThrow(/unique/);
  });

  it('rejects an empty date list', () => {
    expect(() => createAvailabilityPollSchema.parse({ ...base, dates: [] })).toThrow(
      /at least one/,
    );
  });
});

// =====================================================================
// Profile update
// =====================================================================

describe('profileUpdateSchema', () => {
  it('accepts a full update', () => {
    expect(
      profileUpdateSchema.parse({
        username: 'new_name',
        displayName: 'New Name',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    ).toMatchObject({
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
    expect(() => profileUpdateSchema.parse({ avatarUrl: 'not-a-url' })).toThrow();
  });
});

// =====================================================================
// Onboarding
// =====================================================================

describe('onboardingSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      onboardingSchema.parse({
        username: 'alice',
        displayName: 'Alice',
      }),
    ).toEqual({
      username: 'alice',
      displayName: 'Alice',
    });
  });

  it('requires both fields', () => {
    expect(() => onboardingSchema.parse({ username: 'alice' })).toThrow();
    expect(() => onboardingSchema.parse({ displayName: 'Alice' })).toThrow();
  });
});

// =====================================================================
// Groups
// =====================================================================

describe('createGroupSchema', () => {
  it('accepts a valid name and applies defaults', () => {
    expect(createGroupSchema.parse({ name: 'Game Night' })).toEqual({
      name: 'Game Night',
      tags: [],
      visibility: 'invite_only',
    });
  });

  it('trims whitespace', () => {
    expect(createGroupSchema.parse({ name: '  Foodies  ' })).toMatchObject({ name: 'Foodies' });
  });

  it('rejects an empty name', () => {
    expect(() => createGroupSchema.parse({ name: '' })).toThrow(/required/);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => createGroupSchema.parse({ name: '   ' })).toThrow(/required/);
  });

  it('rejects a name longer than 80 characters', () => {
    expect(() => createGroupSchema.parse({ name: 'a'.repeat(81) })).toThrow(/at most 80/);
  });

  it('accepts a name at exactly 80 characters', () => {
    const name = 'a'.repeat(80);
    expect(createGroupSchema.parse({ name })).toMatchObject({ name });
  });

  it('accepts description, location, tags, and visibility', () => {
    const parsed = createGroupSchema.parse({
      name: 'Taco Lovers',
      description: '  We love tacos  ',
      location: 'Austin, TX',
      tags: ['Food', 'food', '  Mexican '],
      visibility: 'public',
    });
    expect(parsed).toEqual({
      name: 'Taco Lovers',
      description: 'We love tacos',
      location: 'Austin, TX',
      tags: ['food', 'mexican'],
      visibility: 'public',
    });
  });

  it('rejects a description longer than 500 characters', () => {
    expect(() => createGroupSchema.parse({ name: 'X', description: 'a'.repeat(501) })).toThrow(
      /at most 500/,
    );
  });

  it('rejects more than 8 tags', () => {
    const tags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
    expect(() => createGroupSchema.parse({ name: 'X', tags })).toThrow(/At most 8/);
  });

  it('rejects an unknown visibility', () => {
    expect(() => createGroupSchema.parse({ name: 'X', visibility: 'secret' })).toThrow();
  });
});

describe('updateGroupSchema', () => {
  it('accepts a partial update with just a name', () => {
    expect(updateGroupSchema.parse({ name: 'New Name' })).toEqual({ name: 'New Name' });
  });

  it('accepts an empty object (nothing to update)', () => {
    expect(updateGroupSchema.parse({})).toEqual({});
  });

  it('rejects an invalid name when provided', () => {
    expect(() => updateGroupSchema.parse({ name: '' })).toThrow(/required/);
  });
});

describe('groupMemberRoleSchema', () => {
  it('accepts admin', () => {
    expect(groupMemberRoleSchema.parse('admin')).toBe('admin');
  });

  it('accepts member', () => {
    expect(groupMemberRoleSchema.parse('member')).toBe('member');
  });

  it('rejects unknown roles', () => {
    expect(() => groupMemberRoleSchema.parse('owner')).toThrow();
    expect(() => groupMemberRoleSchema.parse('')).toThrow();
  });
});

// =====================================================================
// Invites (Phase 4.1)
// =====================================================================

describe('inviteTokenSchema (via acceptInviteSchema)', () => {
  const goodToken = 'A'.repeat(43);

  it('accepts a base64url token of typical length', () => {
    expect(acceptInviteSchema.parse({ token: goodToken })).toEqual({ token: goodToken });
  });

  it('accepts - and _ characters', () => {
    const token = `ab-cd_ef${'x'.repeat(35)}`;
    expect(acceptInviteSchema.parse({ token })).toEqual({ token });
  });

  it('rejects tokens that are too short', () => {
    expect(() => acceptInviteSchema.parse({ token: 'short' })).toThrow(/not valid/);
  });

  it('rejects tokens with invalid characters', () => {
    expect(() => acceptInviteSchema.parse({ token: `${'a'.repeat(42)}+` })).toThrow(/not valid/);
  });
});

describe('createInviteSchema', () => {
  const groupId = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';

  it('accepts a bare link invite', () => {
    expect(createInviteSchema.parse({ groupId })).toEqual({ groupId });
  });

  it('accepts an email invite and normalises the email', () => {
    expect(createInviteSchema.parse({ groupId, invitedEmail: '  Pal@Example.COM ' })).toEqual({
      groupId,
      invitedEmail: 'pal@example.com',
    });
  });

  it('accepts a by-user invite', () => {
    const invitedUserId = '6f9619ff-8b86-4d01-b42d-00cf4fc964fe';
    expect(createInviteSchema.parse({ groupId, invitedUserId })).toEqual({
      groupId,
      invitedUserId,
    });
  });

  it('rejects email and userId together', () => {
    expect(() =>
      createInviteSchema.parse({
        groupId,
        invitedEmail: 'pal@example.com',
        invitedUserId: '6f9619ff-8b86-4d01-b42d-00cf4fc964fe',
      }),
    ).toThrow(/either an email or a user/);
  });

  it('rejects a malformed group id', () => {
    expect(() => createInviteSchema.parse({ groupId: 'nope' })).toThrow(/Invalid group id/);
  });

  it('rejects a malformed email', () => {
    expect(() => createInviteSchema.parse({ groupId, invitedEmail: 'not-an-email' })).toThrow(
      /valid email/,
    );
  });
});

describe('usernameSearchSchema', () => {
  it('accepts a prefix and normalises case/whitespace', () => {
    expect(usernameSearchSchema.parse({ q: '  PaL ' })).toEqual({ q: 'pal' });
  });

  it('accepts digits and underscores', () => {
    expect(usernameSearchSchema.parse({ q: 'a_1' })).toEqual({ q: 'a_1' });
  });

  it('rejects empty / whitespace-only queries', () => {
    expect(() => usernameSearchSchema.parse({ q: '   ' })).toThrow(/at least one/);
  });

  it('rejects queries over 30 characters', () => {
    expect(() => usernameSearchSchema.parse({ q: 'a'.repeat(31) })).toThrow(/at most 30/);
  });

  it('rejects ILIKE wildcards and other invalid characters', () => {
    expect(() => usernameSearchSchema.parse({ q: 'a%' })).toThrow(/only letters/);
    expect(() => usernameSearchSchema.parse({ q: 'a b' })).toThrow(/only letters/);
  });
});

// =====================================================================
// Ideas (Phase 5.1)
// =====================================================================

describe('createIdeaSchema', () => {
  const groupId = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';
  const base = { groupId, title: 'Taco night', category: 'food' };

  it('accepts a minimal idea (title + category)', () => {
    expect(createIdeaSchema.parse(base)).toEqual(base);
  });

  it('trims the title and rejects whitespace-only titles', () => {
    expect(createIdeaSchema.parse({ ...base, title: '  Taco night  ' }).title).toBe('Taco night');
    expect(() => createIdeaSchema.parse({ ...base, title: '   ' })).toThrow(/required/);
  });

  it('rejects titles over 200 characters', () => {
    expect(() => createIdeaSchema.parse({ ...base, title: 'a'.repeat(201) })).toThrow(
      /at most 200/,
    );
  });

  it('rejects unknown categories', () => {
    expect(() => createIdeaSchema.parse({ ...base, category: 'sports' })).toThrow();
  });

  it('turns empty description/link into undefined', () => {
    const parsed = createIdeaSchema.parse({ ...base, description: '', link: '' });
    expect(parsed.description).toBeUndefined();
    expect(parsed.link).toBeUndefined();
  });

  it('rejects descriptions over 4000 characters', () => {
    expect(() => createIdeaSchema.parse({ ...base, description: 'a'.repeat(4001) })).toThrow(
      /at most 4000/,
    );
  });

  it('accepts http(s) links and rejects other schemes', () => {
    expect(createIdeaSchema.parse({ ...base, link: 'https://example.com/x' }).link).toBe(
      'https://example.com/x',
    );
    expect(() => createIdeaSchema.parse({ ...base, link: 'javascript:alert(1)' })).toThrow(
      /valid http/,
    );
    expect(() => createIdeaSchema.parse({ ...base, link: 'not a url' })).toThrow(/valid http/);
  });

  it('accepts a valid event date and clears an empty one', () => {
    expect(createIdeaSchema.parse({ ...base, eventDate: '2026-07-04' }).eventDate).toBe(
      '2026-07-04',
    );
    expect(createIdeaSchema.parse({ ...base, eventDate: '' }).eventDate).toBeUndefined();
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => createIdeaSchema.parse({ ...base, eventDate: '07/04/2026' })).toThrow(
      /valid date/,
    );
    expect(() => createIdeaSchema.parse({ ...base, eventDate: '2026-02-31' })).toThrow(
      /valid date/,
    );
  });

  it('trims location, clears empty, and caps at 200 chars', () => {
    expect(createIdeaSchema.parse({ ...base, location: '  Joe’s Diner  ' }).location).toBe(
      'Joe’s Diner',
    );
    expect(createIdeaSchema.parse({ ...base, location: '' }).location).toBeUndefined();
    expect(() => createIdeaSchema.parse({ ...base, location: 'a'.repeat(201) })).toThrow(
      /at most 200/,
    );
  });
});

describe('updateIdeaSchema', () => {
  it('accepts a partial update', () => {
    expect(updateIdeaSchema.parse({ title: 'New title' })).toEqual({ title: 'New title' });
  });

  it('accepts an empty object', () => {
    expect(updateIdeaSchema.parse({})).toEqual({});
  });

  it('still validates provided fields', () => {
    expect(() => updateIdeaSchema.parse({ category: 'nope' })).toThrow();
  });
});

describe('updateIdeaStatusSchema / ideaFiltersSchema', () => {
  it('accepts each valid status', () => {
    for (const status of ['on_radar', 'done', 'dismissed']) {
      expect(updateIdeaStatusSchema.parse({ status })).toEqual({ status });
    }
  });

  it('rejects unknown statuses', () => {
    expect(() => updateIdeaStatusSchema.parse({ status: 'archived' })).toThrow();
  });

  it('filters are optional and validated', () => {
    expect(ideaFiltersSchema.parse({})).toEqual({});
    expect(ideaFiltersSchema.parse({ status: 'done', category: 'food' })).toEqual({
      status: 'done',
      category: 'food',
    });
    expect(() => ideaFiltersSchema.parse({ status: 'nope' })).toThrow();
  });
});

describe('groupVisibilitySchema', () => {
  it('accepts the two valid values', () => {
    expect(groupVisibilitySchema.parse('public')).toBe('public');
    expect(groupVisibilitySchema.parse('invite_only')).toBe('invite_only');
  });

  it('rejects anything else', () => {
    expect(() => groupVisibilitySchema.parse('private')).toThrow();
  });
});

describe('normalizeTags / tagsSchema', () => {
  it('lowercases, trims, drops empties, de-duplicates', () => {
    expect(normalizeTags(['  Foo ', 'foo', '', 'BAR'])).toEqual(['foo', 'bar']);
  });

  it('tagsSchema normalizes an array', () => {
    expect(tagsSchema.parse(['Tacos', 'tacos', ' Fun '])).toEqual(['tacos', 'fun']);
  });

  it('tagsSchema rejects more than 8 tags', () => {
    expect(() => tagsSchema.parse(Array.from({ length: 9 }, (_, i) => `t${i}`))).toThrow(
      /At most 8/,
    );
  });

  it('tagsSchema rejects a tag longer than 30 characters', () => {
    expect(() => tagsSchema.parse(['x'.repeat(31)])).toThrow(/at most 30/);
  });

  it('tagsStringSchema parses a comma-separated string', () => {
    expect(tagsStringSchema.parse('Food, mexican , food,')).toEqual(['food', 'mexican']);
  });
});

describe('groupSearchSchema', () => {
  it('defaults to empty filters', () => {
    expect(groupSearchSchema.parse({})).toEqual({ q: '', tags: [], location: '' });
  });

  it('trims the query and lowercases tags', () => {
    expect(
      groupSearchSchema.parse({ q: '  tacos ', tags: ['FOOD'], location: ' Austin ' }),
    ).toEqual({ q: 'tacos', tags: ['food'], location: 'Austin' });
  });

  it('rejects a query longer than 80 characters', () => {
    expect(() => groupSearchSchema.parse({ q: 'a'.repeat(81) })).toThrow(/too long/);
  });
});
