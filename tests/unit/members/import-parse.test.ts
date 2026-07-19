import { describe, it, expect } from 'vitest';
import { parseMemberCsv } from '@/lib/members/import';

describe('parseMemberCsv', () => {
  it('accepts header aliases across naming conventions', () => {
    const { rows, errors } = parseMemberCsv(
      'First Name,last_name,Email Address,Family Name\nAda,Lovelace,ada@example.com,Lovelace',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        familyName: 'Lovelace',
      },
    ]);
  });

  it('reports missing required columns', () => {
    const { rows, errors } = parseMemberCsv('email,phone\na@b.com,555');
    expect(rows).toEqual([]);
    expect(errors[0].reason).toMatch(/first name and last name/i);
  });

  it('keeps original line numbers when rows are skipped', () => {
    const { rows } = parseMemberCsv(
      'firstName,lastName\nAda,Lovelace\n\nGrace,Hopper\n',
    );
    expect(rows.map((row) => row.line)).toEqual([2, 4]);
  });

  it('surfaces column-count mismatches as row errors', () => {
    const { rows, errors } = parseMemberCsv(
      'firstName,lastName\nAda,Lovelace\nbroken\nGrace,Hopper',
    );
    expect(rows).toHaveLength(2);
    expect(errors).toEqual([
      { line: 3, reason: 'expected 2 columns, found 1' },
    ]);
  });

  it('ignores unknown columns rather than failing the file', () => {
    const { rows, errors } = parseMemberCsv(
      'firstName,lastName,favourite colour\nAda,Lovelace,green',
    );
    expect(errors).toEqual([]);
    expect(rows[0]).not.toHaveProperty('favourite colour');
    expect(rows[0].firstName).toBe('Ada');
  });

  it('treats blank cells as absent', () => {
    const { rows } = parseMemberCsv('firstName,lastName,email\nAda,Lovelace,');
    expect(rows[0].email).toBeUndefined();
  });
});
