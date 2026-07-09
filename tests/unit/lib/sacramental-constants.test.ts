import { describe, expect, it } from 'vitest';
import {
  isSacramentType,
  sacramentLabel,
  SACRAMENT_TYPES,
} from '@/lib/sacramental/constants';

describe('sacramental constants', () => {
  it('lists seven PA-7 sacrament types', () => {
    expect(SACRAMENT_TYPES).toHaveLength(7);
    expect(isSacramentType('BAPTISM')).toBe(true);
    expect(isSacramentType('FUNERAL')).toBe(false);
  });

  it('labels sacraments for UI', () => {
    expect(sacramentLabel('BAPTISM')).toMatch(/Baptism/i);
    expect(sacramentLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});
