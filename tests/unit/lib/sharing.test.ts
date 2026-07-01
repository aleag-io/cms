import { describe, expect, it } from 'vitest';
import { generateToken, verifyToken } from '@/lib/sharing/tokens';
import { anonymizeMember, anonymizeResource } from '@/lib/sharing/anonymize';

describe('sharing token utilities', () => {
  it('generates a 64-char hex raw token', () => {
    const { raw } = generateToken();
    expect(raw).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(raw)).toBe(true);
  });

  it('verifyToken is true for the generated token', () => {
    const { raw, hash } = generateToken();
    expect(verifyToken(raw, hash)).toBe(true);
  });

  it('verifyToken is false for an incorrect token', () => {
    const { hash } = generateToken();
    expect(verifyToken('baadcafe'.repeat(8), hash)).toBe(false);
  });
});

describe('anonymizeMember', () => {
  const full = {
    id: 'u1',
    name: 'Alice',
    email: 'a@b.com',
    dateOfBirth: '1990-01-01',
    privateNotes: 'clergy only',
    workNotes: 'volunteer',
    gender: 'FEMALE',
  };

  it('strips PII fields', () => {
    const out = anonymizeMember(full);
    expect(out).not.toHaveProperty('name');
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('dateOfBirth');
  });

  it('strips privateNotes and workNotes', () => {
    const out = anonymizeMember(full);
    expect(out).not.toHaveProperty('privateNotes');
    expect(out).not.toHaveProperty('workNotes');
  });

  it('preserves non-PII fields', () => {
    const out = anonymizeMember(full);
    expect(out).toHaveProperty('id', 'u1');
    expect(out).toHaveProperty('gender', 'FEMALE');
  });
});

describe('anonymizeResource', () => {
  it('strips PII from nested member-list payloads', () => {
    const out = anonymizeResource({
      type: 'member_list',
      members: [
        {
          id: 'm1',
          memberIdentifier: '100.1',
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@test.local',
          phone: '555-0100',
          status: 'ACTIVE',
        },
      ],
    });

    expect(out).toHaveProperty('type', 'member_list');
    const members = out.members as Array<Record<string, unknown>>;
    expect(members[0]).not.toHaveProperty('memberIdentifier');
    expect(members[0]).not.toHaveProperty('firstName');
    expect(members[0]).not.toHaveProperty('lastName');
    expect(members[0]).not.toHaveProperty('email');
    expect(members[0]).not.toHaveProperty('phone');
    expect(members[0]).toHaveProperty('status', 'ACTIVE');
  });
});
