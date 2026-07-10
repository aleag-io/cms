import { ObservanceType } from '@prisma/client';
import { ApiError } from '@/lib/api';

const OBSERVANCE_TYPES = new Set<string>(Object.values(ObservanceType));

export type LiturgicalInput = {
  title: string;
  observanceType: ObservanceType;
  month: number | null;
  day: number | null;
  occursOn: Date | null;
  endsOn: Date | null;
  lectionaryRef: string | null;
  isPublished: boolean;
};

function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'title is required');
  }
  return value.trim();
}

function parseObservanceType(value: unknown): ObservanceType {
  if (typeof value !== 'string' || !OBSERVANCE_TYPES.has(value)) {
    throw new ApiError(400, 'observanceType must be a valid type');
  }
  return value as ObservanceType;
}

function parseDayPart(
  value: unknown,
  name: 'month' | 'day',
  max: number,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new ApiError(400, `${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

function parseDateOrNull(value: unknown, name: string): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${name} must be a valid date`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, `${name} must be a valid date`);
  }
  return d;
}

function parseStringOrNull(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, `${name} must be a string`);
  }
  return value.trim() || null;
}

export function parseLiturgicalCreate(
  body: Record<string, unknown>,
): LiturgicalInput {
  return {
    title: parseTitle(body.title),
    observanceType:
      body.observanceType === undefined
        ? ObservanceType.FEAST
        : parseObservanceType(body.observanceType),
    month: parseDayPart(body.month, 'month', 12),
    day: parseDayPart(body.day, 'day', 31),
    occursOn: parseDateOrNull(body.occursOn, 'occursOn'),
    endsOn: parseDateOrNull(body.endsOn, 'endsOn'),
    lectionaryRef: parseStringOrNull(body.lectionaryRef, 'lectionaryRef'),
    isPublished: typeof body.isPublished === 'boolean' ? body.isPublished : true,
  };
}

export function parseLiturgicalPatch(
  body: Record<string, unknown>,
): Partial<LiturgicalInput> {
  const out: Partial<LiturgicalInput> = {};
  if ('title' in body) out.title = parseTitle(body.title);
  if ('observanceType' in body) {
    out.observanceType = parseObservanceType(body.observanceType);
  }
  if ('month' in body) out.month = parseDayPart(body.month, 'month', 12);
  if ('day' in body) out.day = parseDayPart(body.day, 'day', 31);
  if ('occursOn' in body) out.occursOn = parseDateOrNull(body.occursOn, 'occursOn');
  if ('endsOn' in body) out.endsOn = parseDateOrNull(body.endsOn, 'endsOn');
  if ('lectionaryRef' in body) {
    out.lectionaryRef = parseStringOrNull(body.lectionaryRef, 'lectionaryRef');
  }
  if ('isPublished' in body) {
    if (typeof body.isPublished !== 'boolean') {
      throw new ApiError(400, 'isPublished must be a boolean');
    }
    out.isPublished = body.isPublished;
  }
  return out;
}
