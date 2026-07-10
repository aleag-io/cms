import type { SacramentType } from '@prisma/client';

export const SACRAMENT_TYPES: SacramentType[] = [
  'BAPTISM',
  'HOLY_COMMUNION',
  'CONFIRMATION',
  'CONFESSION',
  'MARRIAGE',
  'ORDINATION',
  'ANOINTING_OF_THE_SICK',
];

export const SACRAMENT_LABELS: Record<SacramentType, string> = {
  BAPTISM: 'Holy Baptism',
  HOLY_COMMUNION: 'Holy Communion (Holy Qurbana)',
  CONFIRMATION: 'Confirmation (Miron Anointing)',
  CONFESSION: 'Confession (Reconciliation)',
  MARRIAGE: 'Marriage (Matrimony)',
  ORDINATION: 'Ordination (Holy Orders)',
  ANOINTING_OF_THE_SICK: 'Anointing of the Sick',
};

export function isSacramentType(value: string): value is SacramentType {
  return (SACRAMENT_TYPES as string[]).includes(value);
}

export function sacramentLabel(type: SacramentType | string): string {
  if (isSacramentType(type)) return SACRAMENT_LABELS[type];
  return type;
}
