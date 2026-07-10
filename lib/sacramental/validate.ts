import type { SacramentType } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { isSacramentType } from '@/lib/sacramental/constants';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidOrNull(
  key: string,
  value: string | null | undefined,
): void {
  if (value != null && !UUID_RE.test(value)) {
    throw new ApiError(400, `${key} must be a UUID`);
  }
}

export type SacramentalInput = {
  sacramentType: SacramentType;
  occurredOn: Date;
  officiantName?: string | null;
  locationText?: string | null;
  registerBook?: string | null;
  registerPage?: string | null;
  registerEntry?: string | null;
  notes?: string | null;
  sponsorNames?: string | null;
  spouseMemberId?: string | null;
  spouseName?: string | null;
  witnessNames?: string | null;
  ordainedOffice?: string | null;
  pastoralNoteRef?: string | null;
};

export function parseSacramentalBody(body: Record<string, unknown>): SacramentalInput {
  const typeRaw = body.sacramentType;
  if (typeof typeRaw !== 'string' || !isSacramentType(typeRaw)) {
    throw new ApiError(400, 'sacramentType is required and must be a valid type');
  }
  const occurredRaw = body.occurredOn;
  if (typeof occurredRaw !== 'string' || !occurredRaw.trim()) {
    throw new ApiError(400, 'occurredOn is required');
  }
  const occurredOn = new Date(occurredRaw);
  if (Number.isNaN(occurredOn.getTime())) {
    throw new ApiError(400, 'occurredOn must be a valid date');
  }

  const str = (key: string): string | null | undefined => {
    if (!(key in body)) return undefined;
    const v = body[key];
    if (v === null) return null;
    if (typeof v !== 'string') throw new ApiError(400, `${key} must be a string`);
    return v.trim() || null;
  };

  const spouseMemberId = str('spouseMemberId');
  assertUuidOrNull('spouseMemberId', spouseMemberId);

  return {
    sacramentType: typeRaw,
    occurredOn,
    officiantName: str('officiantName'),
    locationText: str('locationText'),
    registerBook: str('registerBook'),
    registerPage: str('registerPage'),
    registerEntry: str('registerEntry'),
    notes: str('notes'),
    sponsorNames: str('sponsorNames'),
    spouseMemberId,
    spouseName: str('spouseName'),
    witnessNames: str('witnessNames'),
    ordainedOffice: str('ordainedOffice'),
    pastoralNoteRef: str('pastoralNoteRef'),
  };
}

export function parseSacramentalPatch(
  body: Record<string, unknown>,
): Partial<SacramentalInput> & { isActive?: boolean } {
  const out: Partial<SacramentalInput> & { isActive?: boolean } = {};

  if ('sacramentType' in body) {
    const typeRaw = body.sacramentType;
    if (typeof typeRaw !== 'string' || !isSacramentType(typeRaw)) {
      throw new ApiError(400, 'sacramentType must be a valid type');
    }
    out.sacramentType = typeRaw;
  }
  if ('occurredOn' in body) {
    if (typeof body.occurredOn !== 'string' || !body.occurredOn.trim()) {
      throw new ApiError(400, 'occurredOn must be a valid date');
    }
    const d = new Date(body.occurredOn);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, 'occurredOn must be a valid date');
    out.occurredOn = d;
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') {
      throw new ApiError(400, 'isActive must be a boolean');
    }
    out.isActive = body.isActive;
  }

  const optionalKeys = [
    'officiantName',
    'locationText',
    'registerBook',
    'registerPage',
    'registerEntry',
    'notes',
    'sponsorNames',
    'spouseMemberId',
    'spouseName',
    'witnessNames',
    'ordainedOffice',
    'pastoralNoteRef',
  ] as const;

  for (const key of optionalKeys) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null) {
      (out as Record<string, unknown>)[key] = null;
    } else if (typeof v === 'string') {
      (out as Record<string, unknown>)[key] = v.trim() || null;
    } else {
      throw new ApiError(400, `${key} must be a string or null`);
    }
  }
  assertUuidOrNull('spouseMemberId', out.spouseMemberId);

  return out;
}
