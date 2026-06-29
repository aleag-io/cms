import { describe, expect, it } from 'vitest';
import { projectMember } from '@/lib/projection';

const baseMember = {
  id: 'member-1',
  parishId: 'parish-1',
  memberIdentifier: '100.1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@test.local',
  phone: '123',
  status: 'ACTIVE',
  family: { id: 'family-1', familyName: 'Smith' },
  workNotes: 'staff only',
  educationLevel: 'UNDERGRADUATE',
  skillsInterests: ['Choir'],
  privateNote: { note: 'private clergy note' },
  pastoralData: {
    dateOfBirth: new Date('1990-01-01'),
    baptismDate: null,
    chrismationDate: null,
  },
};

describe('projectMember', () => {
  it('hides sensitive fields for member role', () => {
    const projected = projectMember(baseMember, ['member']);
    expect(projected.workNotes).toBeUndefined();
    expect(projected.privateNote).toBeUndefined();
    expect(projected.pastoralData).toBeUndefined();
  });

  it('shows private notes to clergy', () => {
    const projected = projectMember(baseMember, ['clergy']);
    expect(projected.privateNote).toEqual({ note: 'private clergy note' });
  });

  it('shows work notes to parish staff', () => {
    const projected = projectMember(baseMember, ['parish_staff']);
    expect(projected.workNotes).toBe('staff only');
    expect(projected.privateNote).toBeUndefined();
  });

  it('shows pastoral data to pastoral accessor', () => {
    const projected = projectMember(baseMember, ['pastoral_data_accessor']);
    expect(projected.pastoralData?.dateOfBirth).toEqual(new Date('1990-01-01'));
  });
});
