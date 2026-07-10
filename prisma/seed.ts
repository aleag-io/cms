/**
 * Development demo seed — populates a full diocese for local UI/API exploration.
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --keep   # skip truncate (append fails on unique constraints)
 *
 * Creates:
 *   - 1 diocese + diocese-level admins/staff/report viewers
 *   - 10 parishes × ≥20 families × ≥60 members each
 *   - Wide demographics, relationships, multi-parish membership
 *   - Programs, orgs, events, facilities, comms, sacramental, liturgical,
 *     sharing, registrations, officers, pastoral data, etc.
 *
 * Login helpers (after `npm run db:ensure-local-admin` or auth sync below):
 *   admin@cms.local / Admin@Local1  (DIOCESE_ADMIN)
 *
 * This is independent of tests/helpers/db.ts fixtures used by CI.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ActorType,
  AttendanceStatus,
  AudienceType,
  AuditOutcome,
  DataCategory,
  EducationLevel,
  EnrollmentRole,
  EnrollmentStatus,
  EventType,
  FacilityBookingStatus,
  Gender,
  GranteeType,
  MembershipMode,
  MembershipType,
  MemberStatus,
  MessageChannel,
  MessageStatus,
  ObservanceType,
  OfficerType,
  OrganizationType,
  OrgMembershipRole,
  PermissionAction,
  PermissionResource,
  PrismaClient,
  ProgramType,
  RecipientStatus,
  RegistrationStatus,
  RelationshipType,
  Role,
  RsvpStatus,
  SacramentType,
  ShareMode,
  SharingRequestStatus,
  SharingScope,
  VolunteerScopeType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ── env ──────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const path = resolve(process.cwd(), '.env.local');
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // rely on process.env
  }
}

loadEnvLocal();

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  throw new Error('DATABASE_URL (or POSTGRES_URL_NON_POOLING) must be set');
}

// This seed TRUNCATEs every table (audit trail included). Refuse anything
// that is not the local Supabase stack — `vercel env pull` drops the
// production POSTGRES_URL_NON_POOLING into .env.local, which we fall back to.
const dbHost = new URL(connectionString).hostname;
const isLocalDb = ['localhost', '127.0.0.1', '::1'].includes(dbHost);
if (!isLocalDb && process.env.SEED_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing to seed non-local database host "${dbHost}" — this script wipes all data. ` +
      'Set SEED_ALLOW_REMOTE=1 only if you really mean to reseed a remote database.',
  );
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── constants ────────────────────────────────────────────────────────────────

const DIOCESE_NAME = 'Mar Thoma Diocese of North America & Europe (Demo)';

const PARISHES: Array<{
  name: string;
  address: string;
  prefix: string;
  start: number;
}> = [
  {
    name: 'St. Thomas Mar Thoma Church',
    address: '1230 Preston Rd, Dallas, TX 75252',
    prefix: 'DAL-',
    start: 100,
  },
  {
    name: 'St. Mary Mar Thoma Church',
    address: '8900 Westheimer Rd, Houston, TX 77063',
    prefix: 'HOU-',
    start: 100,
  },
  {
    name: 'St. Gregorios Mar Thoma Church',
    address: '45-15 Parsons Blvd, Queens, NY 11355',
    prefix: 'NYC-',
    start: 50,
  },
  {
    name: 'St. Johns Mar Thoma Church',
    address: '2200 Welsh Rd, Philadelphia, PA 19115',
    prefix: 'PHL-',
    start: 1,
  },
  {
    name: 'Carmel Mar Thoma Church',
    address: '15 Technology Dr, Boston, MA 01801',
    prefix: 'BOS-',
    start: 200,
  },
  {
    name: 'Bethel Mar Thoma Church',
    address: '4100 N Elston Ave, Chicago, IL 60618',
    prefix: 'CHI-',
    start: 100,
  },
  {
    name: 'Hermon Mar Thoma Church',
    address: '17800 Pioneer Blvd, Artesia, CA 90701',
    prefix: 'LAX-',
    start: 100,
  },
  {
    name: 'Sinai Mar Thoma Church',
    address: '5600 Peachtree Dunwoody Rd, Atlanta, GA 30342',
    prefix: 'ATL-',
    start: 1,
  },
  {
    name: 'Immanuel Mar Thoma Church',
    address: '2201 148th Ave NE, Bellevue, WA 98007',
    prefix: 'SEA-',
    start: 50,
  },
  {
    name: 'Epiphany Mar Thoma Church',
    address: '2200 Steeles Ave W, Toronto, ON L4K 2T1',
    prefix: 'TOR-',
    start: 100,
  },
];

/** Malayalam Christian surnames common in the Mar Thoma community. */
const SURNAMES = [
  'Abraham',
  'Alexander',
  'Chacko',
  'Cherian',
  'Daniel',
  'Eapen',
  'George',
  'Isaac',
  'Jacob',
  'John',
  'Joseph',
  'Koshy',
  'Kurian',
  'Mathew',
  'Oommen',
  'Philip',
  'Samuel',
  'Thomas',
  'Varghese',
  'Zachariah',
  'Pathrose',
  'Skariah',
  'Mammen',
  'Pothen',
  'Iype',
];

const MALE_FIRST = [
  'Abraham',
  'Alex',
  'Anil',
  'Benny',
  'Biju',
  'Daniel',
  'Eby',
  'George',
  'Jacob',
  'Jaison',
  'Jibin',
  'John',
  'Joseph',
  'Koshy',
  'Mathew',
  'Nithin',
  'Philip',
  'Rahul',
  'Samuel',
  'Sajan',
  'Thomas',
  'Varghese',
  'Viju',
  'Zachariah',
  'Arun',
  'Deepak',
  'Manoj',
  'Praveen',
  'Raju',
  'Suresh',
];

const FEMALE_FIRST = [
  'Aleyamma',
  'Asha',
  'Beena',
  'Bincy',
  'Chinnamma',
  'Deepa',
  'Elizabeth',
  'Elsy',
  'Grace',
  'Jaya',
  'Jessy',
  'Latha',
  'Liza',
  'Mary',
  'Mercy',
  'Nimmi',
  'Omana',
  'Rachel',
  'Rebecca',
  'Saramma',
  'Sheeba',
  'Shiny',
  'Susan',
  'Thankamma',
  'Vimala',
  'Anitha',
  'Divya',
  'Leena',
  'Priya',
  'Sneha',
];

const CHILD_MALE = [
  'Aaron',
  'Aiden',
  'Caleb',
  'Ethan',
  'Gabriel',
  'Isaac',
  'Joshua',
  'Liam',
  'Noah',
  'Owen',
  'Ryan',
  'Samuel',
  'Theo',
];

const CHILD_FEMALE = [
  'Ava',
  'Chloe',
  'Emma',
  'Grace',
  'Hannah',
  'Ivy',
  'Leah',
  'Maya',
  'Nora',
  'Olivia',
  'Sophia',
  'Zoe',
];

const SKILLS = [
  'Choir',
  'Sunday School teaching',
  'Music',
  'AV/tech',
  'Cooking',
  'Youth mentoring',
  'Hospitality',
  'Accounting',
  'Graphic design',
  'Photography',
  'Driving/van',
  'Nursing',
  'IT support',
  'Ushering',
  'Translation',
];

const EDUCATION: EducationLevel[] = [
  EducationLevel.PRIMARY,
  EducationLevel.SECONDARY,
  EducationLevel.UNDERGRADUATE,
  EducationLevel.POSTGRADUATE,
  EducationLevel.OTHER,
];

const PROGRAM_DEFS: Array<{
  name: string;
  programType: ProgramType;
  description: string;
}> = [
  {
    name: 'Sunday School',
    programType: ProgramType.FAITH_FORMATION,
    description: 'Weekly faith formation for children and youth',
  },
  {
    name: 'Parish Choir',
    programType: ProgramType.CHOIR,
    description: 'Liturgical and special-service choir',
  },
  {
    name: 'Youth Fellowship',
    programType: ProgramType.YOUTH,
    description: 'Yuvajana Sakhyam — ages 13–30',
  },
  {
    name: 'Adult Bible Study',
    programType: ProgramType.BIBLE_STUDY,
    description: 'Midweek scripture study',
  },
  {
    name: 'Community Outreach',
    programType: ProgramType.OUTREACH,
    description: 'Food pantry and neighborhood visits',
  },
];

const ORG_DEFS: Array<{
  name: string;
  organizationType: OrganizationType;
  membershipMode: MembershipMode;
  description: string;
}> = [
  {
    name: 'Sevika Sanghom',
    organizationType: OrganizationType.AUXILIARY,
    membershipMode: MembershipMode.OPEN,
    description: "Women's fellowship",
  },
  {
    name: 'Yuvajana Sakhyam',
    organizationType: OrganizationType.AUXILIARY,
    membershipMode: MembershipMode.OPEN,
    description: 'Youth organization',
  },
  {
    name: 'Edavaka Mission',
    organizationType: OrganizationType.MINISTRY,
    membershipMode: MembershipMode.OPEN,
    description: 'Parish mission & evangelism',
  },
  {
    name: 'Parish Executive Committee',
    organizationType: OrganizationType.COMMITTEE,
    membershipMode: MembershipMode.OPEN,
    description: 'Governance committee',
  },
  {
    name: 'North Area Prayer Group',
    organizationType: OrganizationType.PRAYER_GROUP,
    membershipMode: MembershipMode.EXCLUSIVE,
    description: 'Geographic exclusive prayer group (north)',
  },
  {
    name: 'South Area Prayer Group',
    organizationType: OrganizationType.PRAYER_GROUP,
    membershipMode: MembershipMode.EXCLUSIVE,
    description: 'Geographic exclusive prayer group (south)',
  },
];

const FACILITY_DEFS = [
  { name: 'Main Sanctuary', capacity: 350, location: 'Building A' },
  { name: 'Fellowship Hall', capacity: 200, location: 'Building B' },
  { name: 'Sunday School Wing', capacity: 80, location: 'Building C' },
  { name: 'Parish Office', capacity: 12, location: 'Admin wing' },
  { name: 'Outdoor Pavilion', capacity: 100, location: 'Campus grounds' },
];

const DIOCESE_LITURGICAL: Array<{
  title: string;
  observanceType: ObservanceType;
  month: number;
  day: number;
  lectionaryRef?: string;
}> = [
  {
    title: 'Epiphany',
    observanceType: ObservanceType.FEAST,
    month: 1,
    day: 6,
    lectionaryRef: 'Mt 2:1-12',
  },
  {
    title: 'Presentation of the Lord',
    observanceType: ObservanceType.FEAST,
    month: 2,
    day: 2,
  },
  {
    title: 'Annunciation',
    observanceType: ObservanceType.FEAST,
    month: 3,
    day: 25,
  },
  {
    title: 'Mar Thoma Church Day',
    observanceType: ObservanceType.DIOCESAN_EVENT,
    month: 5,
    day: 5,
  },
  {
    title: 'Transfiguration',
    observanceType: ObservanceType.FEAST,
    month: 8,
    day: 6,
  },
  {
    title: 'Assumption of St. Mary',
    observanceType: ObservanceType.HOLY_DAY,
    month: 8,
    day: 15,
  },
  {
    title: 'Nativity of St. Mary',
    observanceType: ObservanceType.FEAST,
    month: 9,
    day: 8,
  },
  {
    title: 'All Saints',
    observanceType: ObservanceType.HOLY_DAY,
    month: 11,
    day: 1,
  },
  {
    title: 'Christmas',
    observanceType: ObservanceType.FEAST,
    month: 12,
    day: 25,
    lectionaryRef: 'Lk 2:1-20',
  },
  {
    title: 'Season of Advent begins',
    observanceType: ObservanceType.SEASON_START,
    month: 12,
    day: 1,
  },
];

// ── seeded RNG (deterministic demo data) ─────────────────────────────────────

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260709);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(rand() * copy.length);
    out.push(copy.splice(i, 1)[0]!);
  }
  return out;
}

function chance(p: number) {
  return rand() < p;
}

function intBetween(min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}

function pad(n: number, width: number) {
  return String(n).padStart(width, '0');
}

function yearsAgo(years: number, jitterDays = 200): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - intBetween(0, jitterDays));
  d.setHours(12, 0, 0, 0);
  return d;
}

function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function emailFor(first: string, last: string, tag: string) {
  const base = `${first}.${last}.${tag}`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
  return `${base}@demo.cms.local`;
}

function phoneFor(parishIdx: number, seq: number) {
  const area = 200 + (parishIdx % 700);
  const mid = 200 + ((seq * 7) % 800);
  const last = 1000 + ((seq * 13) % 9000);
  return `+1-${area}-${mid}-${last}`;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Explicit household templates (≥20 families, ≥60 members).
 * Many nuclear households include minors (age &lt; 18). Empty-nest senior
 * couples are later linked via MemberRelationship to adult children who
 * head their own Family records (cross-family PARENT/CHILD).
 */
type FamilyTemplate = {
  /** Adults in household besides optional grandparent */
  adults: 1 | 2;
  /** Children under 18 living in this household */
  minors: number;
  /** Young adults 18–24 still at home */
  youngAdults?: number;
  /** Co-resident grandparent */
  grandparent?: boolean;
  /**
   * Empty-nest senior couple — no kids in this Family row; used as
   * parents of a separate nuclear family (cross-family link).
   */
  emptyNestSenior?: boolean;
};

const FAMILY_TEMPLATES: FamilyTemplate[] = [
  // ── Nuclear with minors (guaranteed children) ───────────────────────────
  { adults: 2, minors: 2 },
  { adults: 2, minors: 2 },
  { adults: 2, minors: 3 },
  { adults: 2, minors: 1 },
  { adults: 2, minors: 2 },
  { adults: 2, minors: 3 },
  { adults: 2, minors: 2, youngAdults: 1 },
  { adults: 2, minors: 1, youngAdults: 1 },
  { adults: 1, minors: 2 }, // single parent + 2 kids
  { adults: 1, minors: 1 }, // single parent + 1 kid
  { adults: 2, minors: 4 }, // large young family
  { adults: 2, minors: 2, grandparent: true },
  { adults: 2, minors: 1, grandparent: true },
  // ── Empty-nest seniors (cross-family parents of nuclear households 0–3) ─
  { adults: 2, minors: 0, emptyNestSenior: true },
  { adults: 2, minors: 0, emptyNestSenior: true },
  { adults: 2, minors: 0, emptyNestSenior: true },
  { adults: 2, minors: 0, emptyNestSenior: true },
  // ── Couples without kids + singles ──────────────────────────────────────
  { adults: 2, minors: 0 },
  { adults: 2, minors: 0 },
  { adults: 1, minors: 0 },
  { adults: 1, minors: 0 },
  { adults: 2, minors: 2 }, // extra nuclear to stay ≥60 members
];

// ── truncate ─────────────────────────────────────────────────────────────────

async function truncateAll() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE
      "AuditEntry",
      "ContextualShare",
      "EmergencyAccessGrant",
      "DataSharingGrant",
      "DataSharingRequest",
      "MemberRegistration",
      "VolunteerAssignment",
      "CommunicationPreference",
      "MessageTemplate",
      "MessageRecipient",
      "Message",
      "FacilityBooking",
      "Facility",
      "EventAttendance",
      "Event",
      "OrganizationOfficer",
      "OrganizationMembership",
      "Organization",
      "ProgramSessionAttendance",
      "ProgramSession",
      "ProgramEnrollment",
      "Program",
      "ParishPermissionOverride",
      "MemberRelationship",
      "SacramentalRecord",
      "LiturgicalObservance",
      "FamilyPastoralData",
      "MemberPastoralData",
      "MemberPrivateNote",
      "ParishOfficer",
      "MemberParish",
      "Member",
      "Family",
      "AppUser",
      "Parish",
      "Diocese"
    CASCADE
  `);
}

// ── types for in-memory graph ────────────────────────────────────────────────

type SeedMember = {
  id: string;
  familyId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  memberIdentifier: string;
  status: MemberStatus;
  educationLevel: EducationLevel | null;
  skillsInterests: string[];
  sex: 'M' | 'F';
  ageYears: number;
  roleInFamily: 'head' | 'spouse' | 'child' | 'grandparent' | 'single';
};

type SeedFamily = {
  id: string;
  familyNumber: string;
  familyName: string;
  members: SeedMember[];
  /** Template flags for cross-family linking after insert */
  emptyNestSenior?: boolean;
  /** Index into families[] this senior couple is parent of (if any) */
  parentOfFamilyIndex?: number;
};

type ParishBundle = {
  id: string;
  idx: number;
  name: string;
  address: string;
  prefix: string;
  start: number;
  families: SeedFamily[];
  members: SeedMember[];
  adminUserId: string;
  staffUserId: string;
  clergyUserId: string;
  sharingManagerUserId: string;
  clergyMemberId: string;
  adminMemberId: string;
};

// ── build family/member graph (in memory) ────────────────────────────────────

function buildFamiliesForParish(
  parishIdx: number,
  familyStart: number,
  width: number,
  prefix: string,
): SeedFamily[] {
  const families: SeedFamily[] = [];
  let memberSeq = 0;

  // Pair empty-nest seniors with nuclear households they parent
  const seniorTemplateIndexes = FAMILY_TEMPLATES.map((t, i) =>
    t.emptyNestSenior ? i : -1,
  ).filter((i) => i >= 0);
  const nuclearChildIndexes = FAMILY_TEMPLATES.map((t, i) =>
    t.minors > 0 && t.adults === 2 && !t.emptyNestSenior ? i : -1,
  )
    .filter((i) => i >= 0)
    .slice(0, seniorTemplateIndexes.length);

  for (let f = 0; f < FAMILY_TEMPLATES.length; f++) {
    const tmpl = FAMILY_TEMPLATES[f]!;
    const linkChildIdx = seniorTemplateIndexes.indexOf(f);
    // Seniors and their linked adult-child household share a surname
    const surnameIndex =
      linkChildIdx >= 0
        ? parishIdx * 5 + seniorTemplateIndexes[linkChildIdx]!
        : nuclearChildIndexes.includes(f)
          ? parishIdx * 5 +
            seniorTemplateIndexes[nuclearChildIndexes.indexOf(f)]!
          : parishIdx * 3 + f;
    const surname = SURNAMES[surnameIndex % SURNAMES.length]!;

    const familyNumber = `${prefix}${pad(familyStart + f, width)}`;
    const familyId = randomUUID();
    const members: SeedMember[] = [];

    const makeMember = (
      first: string,
      sex: 'M' | 'F',
      ageYears: number,
      roleInFamily: SeedMember['roleInFamily'],
      indexInFamily: number,
      lastName: string = surname,
    ): SeedMember => {
      memberSeq += 1;
      const hasEmail = ageYears >= 14 && chance(0.85);
      const hasPhone = ageYears >= 16 && chance(0.8);
      const statusRoll = rand();
      let status: MemberStatus = MemberStatus.ACTIVE;
      if (statusRoll > 0.97) status = MemberStatus.INACTIVE;
      else if (statusRoll > 0.94) status = MemberStatus.MOVED;
      else if (statusRoll > 0.92 && ageYears > 75)
        status = MemberStatus.DECEASED;

      const education =
        ageYears < 12
          ? EducationLevel.PRIMARY
          : ageYears < 18
            ? EducationLevel.SECONDARY
            : pick(EDUCATION);

      return {
        id: randomUUID(),
        familyId,
        firstName: first,
        lastName,
        email: hasEmail
          ? emailFor(first, lastName, `p${parishIdx}m${memberSeq}`)
          : null,
        phone: hasPhone ? phoneFor(parishIdx, memberSeq) : null,
        memberIdentifier: `${familyNumber}.${indexInFamily}`,
        status,
        educationLevel: education,
        skillsInterests:
          ageYears >= 14 ? pickN(SKILLS, intBetween(0, 3)) : [],
        sex,
        ageYears,
        roleInFamily,
      };
    };

    let nextIdx = 1;

    if (tmpl.adults === 1 && tmpl.minors === 0 && !tmpl.grandparent) {
      // Single adult household
      const sex = chance(0.5) ? 'M' : 'F';
      const age = intBetween(24, 70);
      const first = sex === 'M' ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
      members.push(makeMember(first, sex, age, 'single', nextIdx++));
    } else if (tmpl.emptyNestSenior) {
      // Older couple, adult kids live in other Family records
      const headAge = intBetween(58, 78);
      members.push(
        makeMember(pick(MALE_FIRST), 'M', headAge, 'head', nextIdx++),
      );
      members.push(
        makeMember(
          pick(FEMALE_FIRST),
          'F',
          Math.max(55, headAge + intBetween(-4, 2)),
          'spouse',
          nextIdx++,
        ),
      );
    } else {
      // Parent(s)
      const headAge = tmpl.minors > 0
        ? intBetween(32, 48) // prime child-rearing years
        : intBetween(28, 55);
      if (tmpl.adults === 1) {
        // Single parent
        const sex = chance(0.65) ? 'F' : 'M';
        const first = sex === 'M' ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
        members.push(
          makeMember(first, sex, headAge, 'head', nextIdx++),
        );
      } else {
        members.push(
          makeMember(pick(MALE_FIRST), 'M', headAge, 'head', nextIdx++),
        );
        members.push(
          makeMember(
            pick(FEMALE_FIRST),
            'F',
            Math.max(28, headAge + intBetween(-4, 3)),
            'spouse',
            nextIdx++,
          ),
        );
      }

      // Minors (ages 1–17) — guaranteed children in the household
      for (let c = 0; c < tmpl.minors; c++) {
        const sex = chance(0.5) ? 'M' : 'F';
        // Spread ages so a family with multiple kids is multi-year
        const age = Math.min(
          17,
          Math.max(1, intBetween(1, 16) - c * intBetween(0, 2)),
        );
        const first =
          sex === 'M' ? pick(CHILD_MALE) : pick(CHILD_FEMALE);
        members.push(
          makeMember(first, sex, age, 'child', nextIdx++),
        );
      }

      // Young adults still at home (college-age)
      for (let y = 0; y < (tmpl.youngAdults ?? 0); y++) {
        const sex = chance(0.5) ? 'M' : 'F';
        const age = intBetween(18, 24);
        const first = sex === 'M' ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
        members.push(
          makeMember(first, sex, age, 'child', nextIdx++),
        );
      }

      if (tmpl.grandparent) {
        const sex = chance(0.35) ? 'M' : 'F';
        const age = intBetween(68, 88);
        const first = sex === 'M' ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
        members.push(
          makeMember(first, sex, age, 'grandparent', nextIdx++),
        );
      }
    }

    const parentOfFamilyIndex =
      linkChildIdx >= 0 ? nuclearChildIndexes[linkChildIdx] : undefined;

    families.push({
      id: familyId,
      familyNumber,
      familyName: surname,
      members,
      emptyNestSenior: tmpl.emptyNestSenior,
      parentOfFamilyIndex,
    });
  }

  return families;
}

/** Build PARENT/CHILD (+ optional GRANDPARENT) edges across separate Family rows. */
function crossFamilyParentLinks(
  parishId: string,
  families: SeedFamily[],
): Array<{
  parishId: string;
  memberId: string;
  relatedMemberId: string;
  relationshipType: RelationshipType;
  notes?: string;
}> {
  const rows: Array<{
    parishId: string;
    memberId: string;
    relatedMemberId: string;
    relationshipType: RelationshipType;
    notes?: string;
  }> = [];

  for (const seniorFam of families) {
    if (!seniorFam.emptyNestSenior || seniorFam.parentOfFamilyIndex == null)
      continue;
    const childFam = families[seniorFam.parentOfFamilyIndex];
    if (!childFam) continue;

    const seniorHead = seniorFam.members.find((m) => m.roleInFamily === 'head');
    const seniorSpouse = seniorFam.members.find(
      (m) => m.roleInFamily === 'spouse',
    );
    // Adult child who heads their own household
    const adultChild = childFam.members.find((m) => m.roleInFamily === 'head');
    const adultChildSpouse = childFam.members.find(
      (m) => m.roleInFamily === 'spouse',
    );
    const grandchildren = childFam.members.filter(
      (m) => m.roleInFamily === 'child',
    );

    if (!seniorHead || !adultChild) continue;

    const note = 'Cross-family: parents and adult child keep separate family records';

    // Senior head ↔ adult child
    rows.push({
      parishId,
      memberId: seniorHead.id,
      relatedMemberId: adultChild.id,
      relationshipType: RelationshipType.CHILD,
      notes: note,
    });
    rows.push({
      parishId,
      memberId: adultChild.id,
      relatedMemberId: seniorHead.id,
      relationshipType: RelationshipType.PARENT,
      notes: note,
    });

    if (seniorSpouse) {
      rows.push({
        parishId,
        memberId: seniorSpouse.id,
        relatedMemberId: adultChild.id,
        relationshipType: RelationshipType.CHILD,
        notes: note,
      });
      rows.push({
        parishId,
        memberId: adultChild.id,
        relatedMemberId: seniorSpouse.id,
        relationshipType: RelationshipType.PARENT,
        notes: note,
      });
    }

    // In-laws: senior parents ↔ adult child's spouse
    if (adultChildSpouse) {
      for (const parent of [seniorHead, seniorSpouse].filter(Boolean) as SeedMember[]) {
        rows.push({
          parishId,
          memberId: parent.id,
          relatedMemberId: adultChildSpouse.id,
          relationshipType: RelationshipType.IN_LAW,
          notes: 'Cross-family in-law',
        });
        rows.push({
          parishId,
          memberId: adultChildSpouse.id,
          relatedMemberId: parent.id,
          relationshipType: RelationshipType.IN_LAW,
          notes: 'Cross-family in-law',
        });
      }
    }

    // Grandparents ↔ grandchildren (separate family ids)
    for (const gc of grandchildren) {
      for (const gp of [seniorHead, seniorSpouse].filter(Boolean) as SeedMember[]) {
        rows.push({
          parishId,
          memberId: gp.id,
          relatedMemberId: gc.id,
          relationshipType: RelationshipType.GRANDCHILD,
          notes: 'Cross-family grandparent',
        });
        rows.push({
          parishId,
          memberId: gc.id,
          relatedMemberId: gp.id,
          relationshipType: RelationshipType.GRANDPARENT,
          notes: 'Cross-family grandparent',
        });
      }
    }
  }

  return rows;
}

/** Login accounts provisioned in Auth before AppUser rows (id must match). */
const LOGIN_ACCOUNTS = [
  { email: 'admin@cms.local', password: 'Admin@Local1', displayName: 'Diocese Admin', key: 'dioceseAdmin' },
  { email: 'diocese.staff@cms.local', password: 'Admin@Local1', displayName: 'Diocese Staff', key: 'dioceseStaff' },
  { email: 'reports@cms.local', password: 'Admin@Local1', displayName: 'Diocese Report Viewer', key: 'dioceseReportViewer' },
  { email: 'global.admin@cms.local', password: 'Admin@Local1', displayName: 'Global Admin', key: 'globalAdmin' },
  { email: 'parish1.admin@cms.local', password: 'Admin@Local1', displayName: 'Parish 1 Admin', key: 'p1admin' },
  { email: 'parish1.staff@cms.local', password: 'Admin@Local1', displayName: 'Parish 1 Staff', key: 'p1staff' },
  { email: 'parish1.clergy@cms.local', password: 'Admin@Local1', displayName: 'Parish 1 Clergy', key: 'p1clergy' },
  { email: 'parish1.member@cms.local', password: 'Admin@Local1', displayName: 'Parish 1 Member', key: 'p1member' },
  { email: 'parish1.sharing@cms.local', password: 'Admin@Local1', displayName: 'Parish 1 Sharing', key: 'p1sharing' },
  { email: 'parish1.pastoral@cms.local', password: 'Admin@Local1', displayName: 'Parish 1 Pastoral', key: 'p1pastoral' },
  { email: 'parish2.admin@cms.local', password: 'Admin@Local1', displayName: 'Parish 2 Admin', key: 'p2admin' },
] as const;

type LoginKey = (typeof LOGIN_ACCOUNTS)[number]['key'];

// ── main seed ────────────────────────────────────────────────────────────────

async function seed() {
  const keep = process.argv.includes('--keep');
  const skipAuth = process.argv.includes('--skip-auth');

  console.log('🌱 CMS demo seed starting…');
  if (!keep) {
    console.log('   Truncating existing tenant data…');
    await truncateAll();
  }

  // Provision Auth users first so AppUser.id can equal auth.users.id
  const authIds = new Map<LoginKey, string>();
  if (!skipAuth) {
    try {
      const ensured = await ensureAuthUsers([...LOGIN_ACCOUNTS]);
      for (const [k, v] of ensured) authIds.set(k as LoginKey, v);
    } catch (err) {
      console.warn(
        '   ⚠ Auth provision failed — using generated AppUser ids (login may need db:ensure-local-admin):',
        err instanceof Error ? err.message : err,
      );
    }
  }

  const idFor = (key: LoginKey, fallback: string) =>
    authIds.get(key) ?? fallback;

  // ── Diocese ──────────────────────────────────────────────────────────────
  const dioceseId = randomUUID();
  await prisma.diocese.create({
    data: { id: dioceseId, name: DIOCESE_NAME },
  });
  console.log(`   Diocese: ${DIOCESE_NAME}`);

  // ── Diocese-level users ──────────────────────────────────────────────────
  const dioceseAdminId = idFor('dioceseAdmin', randomUUID());
  const dioceseStaffId = idFor('dioceseStaff', randomUUID());
  const dioceseReportViewerId = idFor('dioceseReportViewer', randomUUID());
  const globalAdminId = idFor('globalAdmin', randomUUID());

  await prisma.appUser.createMany({
    data: [
      {
        id: dioceseAdminId,
        email: 'admin@cms.local',
        displayName: 'Diocese Admin',
        role: Role.DIOCESE_ADMIN,
        dioceseId,
        parishId: null,
      },
      {
        id: dioceseStaffId,
        email: 'diocese.staff@cms.local',
        displayName: 'Diocese Staff',
        role: Role.DIOCESE_STAFF,
        dioceseId,
        parishId: null,
      },
      {
        id: dioceseReportViewerId,
        email: 'reports@cms.local',
        displayName: 'Diocese Report Viewer',
        role: Role.DIOCESE_REPORT_VIEWER,
        dioceseId,
        parishId: null,
      },
      {
        id: globalAdminId,
        email: 'global.admin@cms.local',
        displayName: 'Global Admin',
        role: Role.GLOBAL_ADMIN,
        dioceseId,
        parishId: null,
      },
    ],
  });

  // ── Parishes + people ────────────────────────────────────────────────────
  const parishBundles: ParishBundle[] = [];

  for (let p = 0; p < PARISHES.length; p++) {
    const def = PARISHES[p]!;
    const parishId = randomUUID();
    const width = 4;

    await prisma.parish.create({
      data: {
        id: parishId,
        dioceseId,
        name: def.name,
        address: def.address,
        familyNumberPrefix: def.prefix,
        familyNumberWidth: width,
        familyNumberStart: def.start,
        autoApprove: p === 9, // last parish auto-approves registrations
        isActive: p !== 8 || true, // all active
      },
    });

    const families = buildFamiliesForParish(p, def.start, width, def.prefix);
    const allMembers = families.flatMap((f) => f.members);

    // Parish user IDs — use Auth-backed ids for parish 1 (and p2 admin)
    const adminUserId =
      p === 0
        ? idFor('p1admin', randomUUID())
        : p === 1
          ? idFor('p2admin', randomUUID())
          : randomUUID();
    const staffUserId =
      p === 0 ? idFor('p1staff', randomUUID()) : randomUUID();
    const clergyUserId =
      p === 0 ? idFor('p1clergy', randomUUID()) : randomUUID();
    const sharingManagerUserId =
      p === 0 ? idFor('p1sharing', randomUUID()) : randomUUID();
    const memberUserId =
      p === 0 ? idFor('p1member', randomUUID()) : randomUUID();
    const pastoralAccessorUserId =
      p === 0 ? idFor('p1pastoral', randomUUID()) : randomUUID();

    // Prefer adult members for linked accounts
    const adults = allMembers.filter(
      (m) => m.ageYears >= 21 && m.status === MemberStatus.ACTIVE,
    );
    const clergyCandidate =
      adults.find((m) => m.roleInFamily === 'head' && m.sex === 'M') ??
      adults[0]!;
    const adminCandidate =
      adults.find((m) => m.id !== clergyCandidate.id) ??
      adults[1] ??
      adults[0]!;
    const memberCandidate =
      adults.find(
        (m) => m.id !== clergyCandidate.id && m.id !== adminCandidate.id,
      ) ??
      adults[2] ??
      adults[0]!;
    const pastoralCandidate =
      adults.find(
        (m) =>
          m.id !== clergyCandidate.id &&
          m.id !== adminCandidate.id &&
          m.id !== memberCandidate.id,
      ) ?? memberCandidate;

    // Clerical first names (title lives on ParishOfficer)
    clergyCandidate.firstName = pick([
      'John',
      'Thomas',
      'George',
      'Mathew',
      'Abraham',
    ]);

    await prisma.appUser.createMany({
      data: [
        {
          id: adminUserId,
          email: `parish${p + 1}.admin@cms.local`,
          displayName: `${def.name.split(' ')[0]} Parish Admin`,
          role: Role.PARISH_ADMIN,
          dioceseId,
          parishId,
        },
        {
          id: staffUserId,
          email: `parish${p + 1}.staff@cms.local`,
          displayName: `${def.name.split(' ')[0]} Parish Staff`,
          role: Role.PARISH_STAFF,
          dioceseId,
          parishId,
        },
        {
          id: clergyUserId,
          email: `parish${p + 1}.clergy@cms.local`,
          displayName: `Fr. ${clergyCandidate.firstName} ${clergyCandidate.lastName}`,
          role: Role.CLERGY,
          dioceseId,
          parishId,
        },
        {
          id: sharingManagerUserId,
          email: `parish${p + 1}.sharing@cms.local`,
          displayName: `${def.name.split(' ')[0]} Sharing Manager`,
          role: Role.PARISH_DATA_SHARING_MANAGER,
          dioceseId,
          parishId,
        },
        {
          id: memberUserId,
          email: `parish${p + 1}.member@cms.local`,
          displayName: `${memberCandidate.firstName} ${memberCandidate.lastName}`,
          role: Role.MEMBER,
          dioceseId,
          parishId,
        },
        {
          id: pastoralAccessorUserId,
          email: `parish${p + 1}.pastoral@cms.local`,
          displayName: `${def.name.split(' ')[0]} Pastoral Accessor`,
          role: Role.PASTORAL_DATA_ACCESSOR,
          dioceseId,
          parishId,
        },
      ],
    });

    // Families
    await prisma.family.createMany({
      data: families.map((f) => ({
        id: f.id,
        dioceseId,
        parishId,
        familyNumber: f.familyNumber,
        familyName: f.familyName,
        primaryContactEmail:
          f.members.find((m) => m.email)?.email ??
          emailFor(f.familyName, 'family', `p${p}f${f.familyNumber}`),
        primaryContactPhone: f.members.find((m) => m.phone)?.phone ?? null,
        address: def.address.replace(/^\d+/, String(100 + intBetween(1, 800))),
        registrationDate: yearsAgo(intBetween(1, 25)),
        isActive: chance(0.97),
      })),
    });

    // Members
    await prisma.member.createMany({
      data: allMembers.map((m) => {
        let userId: string | null = null;
        if (m.id === clergyCandidate.id) userId = clergyUserId;
        else if (m.id === adminCandidate.id) userId = adminUserId;
        else if (m.id === memberCandidate.id) userId = memberUserId;
        else if (m.id === pastoralCandidate.id) userId = pastoralAccessorUserId;

        return {
          id: m.id,
          dioceseId,
          parishId,
          familyId: m.familyId,
          userId,
          memberIdentifier: m.memberIdentifier,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          phone: m.phone,
          // ~5% unassigned gender for the demographics chart “Unassigned” series
          gender:
            chance(0.05)
              ? Gender.UNSPECIFIED
              : m.sex === 'M'
                ? Gender.MALE
                : Gender.FEMALE,
          workNotes:
            m.ageYears >= 22 && chance(0.35)
              ? pick([
                  'Software engineer',
                  'Nurse at regional hospital',
                  'Teacher',
                  'Accountant',
                  'Small business owner',
                  'Retired civil servant',
                  'Graduate student',
                  'Physician',
                  'Homemaker',
                  'IT consultant',
                ])
              : null,
          educationLevel: m.educationLevel,
          skillsInterests: m.skillsInterests,
          status: m.status,
          transferredFromParishId: null,
          transferredAt: null,
        };
      }),
    });

    // MemberParish primary
    await prisma.memberParish.createMany({
      data: allMembers.map((m) => ({
        memberId: m.id,
        parishId,
        isPrimary: true,
        membershipType: MembershipType.PRIMARY,
        joinedAt: yearsAgo(intBetween(0, 20)),
      })),
    });

    // Pastoral data (DOB + baptism for most)
    await prisma.memberPastoralData.createMany({
      data: allMembers
        .filter((m) => m.status !== MemberStatus.DECEASED || chance(0.5))
        .map((m) => {
          const dob = yearsAgo(m.ageYears, 300);
          const baptized = chance(0.9);
          return {
            memberId: m.id,
            parishId,
            dateOfBirth: dob,
            baptismDate: baptized
              ? new Date(
                  dob.getTime() + intBetween(30, 400) * 24 * 60 * 60 * 1000,
                )
              : null,
            chrismationDate:
              baptized && chance(0.7)
                ? new Date(
                    dob.getTime() + intBetween(400, 5000) * 24 * 60 * 60 * 1000,
                  )
                : null,
          };
        }),
    });

    // Private notes (subset)
    const noteTargets = pickN(
      allMembers.filter((m) => m.status === MemberStatus.ACTIVE),
      intBetween(8, 15),
    );
    await prisma.memberPrivateNote.createMany({
      data: noteTargets.map((m) => ({
        memberId: m.id,
        parishId,
        note: pick([
          'Pastoral care visit requested after recent bereavement.',
          'Hospitalized briefly; follow up next month.',
          'Discerning confirmation; family counseling ongoing.',
          'New transfer — introduce to prayer group.',
          'Sensitive family situation; clergy only.',
        ]),
      })),
    });

    // Family pastoral (anniversaries for couples)
    const coupleFamilies = families.filter((f) =>
      f.members.some((m) => m.roleInFamily === 'spouse'),
    );
    await prisma.familyPastoralData.createMany({
      data: coupleFamilies.map((f) => ({
        familyId: f.id,
        parishId,
        anniversaryDate: yearsAgo(intBetween(2, 40), 100),
      })),
    });

    // Intra-family relationships
    const relationships: Array<{
      parishId: string;
      memberId: string;
      relatedMemberId: string;
      relationshipType: RelationshipType;
    }> = [];

    for (const fam of families) {
      const head = fam.members.find((m) => m.roleInFamily === 'head');
      const spouse = fam.members.find((m) => m.roleInFamily === 'spouse');
      const children = fam.members.filter((m) => m.roleInFamily === 'child');
      const grandparents = fam.members.filter(
        (m) => m.roleInFamily === 'grandparent',
      );

      if (head && spouse) {
        relationships.push({
          parishId,
          memberId: head.id,
          relatedMemberId: spouse.id,
          relationshipType: RelationshipType.SPOUSE,
        });
        relationships.push({
          parishId,
          memberId: spouse.id,
          relatedMemberId: head.id,
          relationshipType: RelationshipType.SPOUSE,
        });
      }
      for (const child of children) {
        if (head) {
          relationships.push({
            parishId,
            memberId: head.id,
            relatedMemberId: child.id,
            relationshipType: RelationshipType.CHILD,
          });
          relationships.push({
            parishId,
            memberId: child.id,
            relatedMemberId: head.id,
            relationshipType: RelationshipType.PARENT,
          });
        }
        if (spouse) {
          relationships.push({
            parishId,
            memberId: spouse.id,
            relatedMemberId: child.id,
            relationshipType: RelationshipType.CHILD,
          });
          relationships.push({
            parishId,
            memberId: child.id,
            relatedMemberId: spouse.id,
            relationshipType: RelationshipType.PARENT,
          });
        }
      }
      for (let i = 0; i < children.length; i++) {
        for (let j = i + 1; j < children.length; j++) {
          relationships.push({
            parishId,
            memberId: children[i]!.id,
            relatedMemberId: children[j]!.id,
            relationshipType: RelationshipType.SIBLING,
          });
          relationships.push({
            parishId,
            memberId: children[j]!.id,
            relatedMemberId: children[i]!.id,
            relationshipType: RelationshipType.SIBLING,
          });
        }
      }
      for (const gp of grandparents) {
        if (head) {
          relationships.push({
            parishId,
            memberId: gp.id,
            relatedMemberId: head.id,
            relationshipType: RelationshipType.CHILD,
          });
          relationships.push({
            parishId,
            memberId: head.id,
            relatedMemberId: gp.id,
            relationshipType: RelationshipType.PARENT,
          });
        }
        for (const child of children) {
          relationships.push({
            parishId,
            memberId: gp.id,
            relatedMemberId: child.id,
            relationshipType: RelationshipType.GRANDCHILD,
          });
          relationships.push({
            parishId,
            memberId: child.id,
            relatedMemberId: gp.id,
            relationshipType: RelationshipType.GRANDPARENT,
          });
        }
      }
    }

    // Batch relationships (may be large)
    const REL_CHUNK = 200;
    for (let i = 0; i < relationships.length; i += REL_CHUNK) {
      await prisma.memberRelationship.createMany({
        data: relationships.slice(i, i + REL_CHUNK),
        skipDuplicates: true,
      });
    }

    // Parish officers
    const boardCandidates = pickN(
      adults.filter((m) => m.id !== clergyCandidate.id),
      4,
    );
    await prisma.parishOfficer.createMany({
      data: [
        {
          parishId,
          memberId: clergyCandidate.id,
          title: 'Vicar',
          officerType: OfficerType.CLERGY,
          isActive: true,
          termStart: yearsAgo(2),
        },
        {
          parishId,
          memberId: boardCandidates[0]?.id ?? adminCandidate.id,
          title: 'Secretary',
          officerType: OfficerType.BOARD,
          isActive: true,
          termStart: yearsAgo(1),
        },
        {
          parishId,
          memberId: boardCandidates[1]?.id ?? adminCandidate.id,
          title: 'Treasurer',
          officerType: OfficerType.FINANCE_COMMITTEE,
          isActive: true,
          termStart: yearsAgo(1),
        },
        {
          parishId,
          memberId: boardCandidates[2]?.id ?? adminCandidate.id,
          title: 'Trustee',
          officerType: OfficerType.TRUSTEE,
          isActive: true,
          termStart: yearsAgo(3),
        },
        {
          parishId,
          memberId: boardCandidates[3]?.id ?? adminCandidate.id,
          title: 'Lay Leader',
          officerType: OfficerType.EXECUTIVE_COMMITTEE,
          isActive: true,
          termStart: yearsAgo(1),
        },
      ],
    });

    // Permission override sample (give PARISH_STAFF export on one parish)
    if (p % 3 === 0) {
      await prisma.parishPermissionOverride.create({
        data: {
          parishId,
          role: Role.PARISH_STAFF,
          resource: PermissionResource.MEMBER_EXPORT,
          action: PermissionAction.EXPORT,
          isAllowed: true,
          grantedByUserId: adminUserId,
        },
      });
    }

    parishBundles.push({
      id: parishId,
      idx: p,
      name: def.name,
      address: def.address,
      prefix: def.prefix,
      start: def.start,
      families,
      members: allMembers,
      adminUserId,
      staffUserId,
      clergyUserId,
      sharingManagerUserId,
      clergyMemberId: clergyCandidate.id,
      adminMemberId: adminCandidate.id,
    });

    const minors = allMembers.filter((m) => m.ageYears < 18).length;
    const crossLinks = families.filter((f) => f.emptyNestSenior).length;
    console.log(
      `   Parish ${p + 1}/10: ${def.name} — ${families.length} families, ${allMembers.length} members (${minors} minors, ${crossLinks} empty-nest→adult-child links)`,
    );
  }

  // ── Multi-parish membership ──────────────────────────────────────────────
  // Clergy of parish 0 also serves parish 1 as secondary
  // A few adult members have secondary membership (students, dual households)
  console.log('   Multi-parish memberships…');
  const multiParishRows: Array<{
    memberId: string;
    parishId: string;
    isPrimary: boolean;
    membershipType: MembershipType;
  }> = [];

  // Vicars with dual assignment
  for (let p = 0; p < 4; p++) {
    const home = parishBundles[p]!;
    const other = parishBundles[(p + 1) % parishBundles.length]!;
    multiParishRows.push({
      memberId: home.clergyMemberId,
      parishId: other.id,
      isPrimary: false,
      membershipType: MembershipType.SECONDARY,
    });
  }

  // ~3 members per parish with secondary membership at a neighboring parish
  for (const pb of parishBundles) {
    const candidates = pb.members.filter(
      (m) =>
        m.ageYears >= 18 &&
        m.status === MemberStatus.ACTIVE &&
        m.id !== pb.clergyMemberId,
    );
    const secondaryHosts = pickN(candidates, 3);
    for (const m of secondaryHosts) {
      const host = pick(
        parishBundles.filter((x) => x.id !== pb.id),
      );
      multiParishRows.push({
        memberId: m.id,
        parishId: host.id,
        isPrimary: false,
        membershipType: MembershipType.SECONDARY,
      });
    }
  }

  await prisma.memberParish.createMany({
    data: multiParishRows,
    skipDuplicates: true,
  });

  // Cross-family PARENT/CHILD/GRANDPARENT (separate Family records) + a few IN_LAWs
  console.log('   Cross-family relationships…');
  for (const pb of parishBundles) {
    const cross = crossFamilyParentLinks(pb.id, pb.families);
    if (cross.length) {
      const CHUNK = 200;
      for (let i = 0; i < cross.length; i += CHUNK) {
        await prisma.memberRelationship.createMany({
          data: cross.slice(i, i + CHUNK),
          skipDuplicates: true,
        });
      }
    }
  }

  // ── Programs, orgs, facilities, events per parish ────────────────────────
  console.log('   Programs, organizations, facilities, events…');

  for (const pb of parishBundles) {
    const activeAdults = pb.members.filter(
      (m) => m.status === MemberStatus.ACTIVE && m.ageYears >= 16,
    );
    const youth = pb.members.filter(
      (m) => m.status === MemberStatus.ACTIVE && m.ageYears >= 8 && m.ageYears <= 18,
    );
    const women = activeAdults.filter((m) => m.sex === 'F');

    // Facilities
    const facilityIds = FACILITY_DEFS.map(() => randomUUID());
    await prisma.facility.createMany({
      data: FACILITY_DEFS.map((f, i) => ({
        id: facilityIds[i]!,
        dioceseId,
        parishId: pb.id,
        name: f.name,
        capacity: f.capacity,
        location: f.location,
        isActive: true,
      })),
    });

    // Programs
    const programIds: string[] = [];
    for (const prog of PROGRAM_DEFS) {
      const id = randomUUID();
      programIds.push(id);
      const coordinator = pick(activeAdults);
      await prisma.program.create({
        data: {
          id,
          dioceseId,
          parishId: pb.id,
          name: prog.name,
          description: prog.description,
          programType: prog.programType,
          coordinatorMemberId: coordinator.id,
          isActive: true,
          startDate: yearsAgo(intBetween(1, 5)),
        },
      });

      // Enrollments
      const pool =
        prog.programType === ProgramType.YOUTH
          ? youth.length
            ? youth
            : activeAdults
          : prog.programType === ProgramType.FAITH_FORMATION
            ? [...youth, ...pickN(activeAdults, 8)]
            : activeAdults;
      const enrollees = pickN(pool, Math.min(pool.length, intBetween(12, 22)));
      await prisma.programEnrollment.createMany({
        data: enrollees.map((m, i) => ({
          dioceseId,
          parishId: pb.id,
          programId: id,
          memberId: m.id,
          role:
            i === 0
              ? EnrollmentRole.COORDINATOR
              : i < 3
                ? EnrollmentRole.FACILITATOR
                : EnrollmentRole.PARTICIPANT,
          status: chance(0.9)
            ? EnrollmentStatus.ACTIVE
            : pick([
                EnrollmentStatus.PENDING,
                EnrollmentStatus.COMPLETED,
                EnrollmentStatus.WITHDRAWN,
              ]),
        })),
        skipDuplicates: true,
      });

      // Sessions + attendance for first two programs
      if (programIds.length <= 2) {
        for (let s = 0; s < 3; s++) {
          const sessionId = randomUUID();
          await prisma.programSession.create({
            data: {
              id: sessionId,
              dioceseId,
              parishId: pb.id,
              programId: id,
              title: `${prog.name} — Session ${s + 1}`,
              scheduledAt: daysFromNow(-21 + s * 7, 10),
              location: pick(FACILITY_DEFS).name,
            },
          });
          await prisma.programSessionAttendance.createMany({
            data: pickN(enrollees, Math.min(enrollees.length, 10)).map(
              (m) => ({
                dioceseId,
                parishId: pb.id,
                sessionId,
                memberId: m.id,
                status: pick([
                  AttendanceStatus.PRESENT,
                  AttendanceStatus.PRESENT,
                  AttendanceStatus.PRESENT,
                  AttendanceStatus.ABSENT,
                  AttendanceStatus.EXCUSED,
                ]),
              }),
            ),
            skipDuplicates: true,
          });
        }
      }

      // Volunteer assignment
      await prisma.volunteerAssignment.create({
        data: {
          dioceseId,
          parishId: pb.id,
          memberId: coordinator.id,
          scopeType: VolunteerScopeType.PROGRAM,
          programId: id,
          roleLabel: 'Coordinator',
          isActive: true,
        },
      });
    }

    // Organizations
    const orgIds: string[] = [];
    for (const org of ORG_DEFS) {
      const id = randomUUID();
      orgIds.push(id);
      await prisma.organization.create({
        data: {
          id,
          dioceseId,
          parishId: pb.id,
          name: org.name,
          description: org.description,
          organizationType: org.organizationType,
          membershipMode: org.membershipMode,
          hasOwnLedger: org.organizationType === OrganizationType.AUXILIARY,
          isActive: true,
        },
      });

      let memberPool = activeAdults;
      if (org.name.includes('Sevika')) memberPool = women.length ? women : activeAdults;
      if (org.name.includes('Yuvajana'))
        memberPool = pb.members.filter(
          (m) => m.ageYears >= 13 && m.ageYears <= 35 && m.status === MemberStatus.ACTIVE,
        );
      if (!memberPool.length) memberPool = activeAdults;

      // Exclusive prayer groups: split members so each joins only one
      let membersForOrg: SeedMember[];
      if (org.membershipMode === MembershipMode.EXCLUSIVE) {
        const half = Math.floor(activeAdults.length / 2);
        membersForOrg =
          org.name.includes('North')
            ? activeAdults.slice(0, half).slice(0, 15)
            : activeAdults.slice(half).slice(0, 15);
      } else {
        membersForOrg = pickN(memberPool, Math.min(memberPool.length, intBetween(10, 18)));
      }

      if (membersForOrg.length) {
        await prisma.organizationMembership.createMany({
          data: membersForOrg.map((m, i) => ({
            dioceseId,
            parishId: pb.id,
            organizationId: id,
            memberId: m.id,
            role:
              i === 0
                ? OrgMembershipRole.LEADER
                : i < 3
                  ? OrgMembershipRole.OFFICER
                  : OrgMembershipRole.MEMBER,
            organizationType: org.organizationType,
            membershipMode: org.membershipMode,
          })),
          skipDuplicates: true,
        });

        await prisma.organizationOfficer.create({
          data: {
            dioceseId,
            parishId: pb.id,
            organizationId: id,
            memberId: membersForOrg[0]!.id,
            title: 'President',
            isActive: true,
            termStart: yearsAgo(1),
          },
        });
      }
    }

    // Events
    const sanctuaryId = facilityIds[0]!;
    const hallId = facilityIds[1]!;
    const eventDefs = [
      {
        name: 'Holy Qurbana',
        eventType: EventType.SERVICE,
        startAt: daysFromNow(3, 9),
        endAt: daysFromNow(3, 11),
        facilityId: sanctuaryId,
        maxCapacity: 350,
      },
      {
        name: 'Parish General Body',
        eventType: EventType.MEETING,
        startAt: daysFromNow(14, 13),
        endAt: daysFromNow(14, 16),
        facilityId: hallId,
        maxCapacity: 200,
      },
      {
        name: 'Family Night Social',
        eventType: EventType.SOCIAL,
        startAt: daysFromNow(21, 18),
        endAt: daysFromNow(21, 21),
        facilityId: hallId,
        maxCapacity: 150,
      },
      {
        name: 'Neighborhood Food Drive',
        eventType: EventType.OUTREACH,
        startAt: daysFromNow(28, 9),
        endAt: daysFromNow(28, 13),
        facilityId: facilityIds[4]!,
        maxCapacity: 80,
      },
      {
        name: 'Last Sunday Qurbana (past)',
        eventType: EventType.SERVICE,
        startAt: daysFromNow(-7, 9),
        endAt: daysFromNow(-7, 11),
        facilityId: sanctuaryId,
        maxCapacity: 350,
      },
    ];

    for (const ev of eventDefs) {
      const eventId = randomUUID();
      await prisma.event.create({
        data: {
          id: eventId,
          dioceseId,
          parishId: pb.id,
          name: ev.name,
          description: `${ev.name} at ${pb.name}`,
          eventType: ev.eventType,
          startAt: ev.startAt,
          endAt: ev.endAt,
          maxCapacity: ev.maxCapacity,
          facilityId: ev.facilityId,
          isPublic: true,
        },
      });

      // Booking (skip if past cancellation noise — all confirmed)
      await prisma.facilityBooking.create({
        data: {
          dioceseId,
          parishId: pb.id,
          facilityId: ev.facilityId,
          eventId,
          title: ev.name,
          startAt: ev.startAt,
          endAt: ev.endAt,
          status: FacilityBookingStatus.CONFIRMED,
        },
      });

      // attended must stay false without parish_staff JWT (phase3_event_attendance_guard)
      const attendees = pickN(activeAdults, Math.min(activeAdults.length, 25));
      await prisma.eventAttendance.createMany({
        data: attendees.map((m) => ({
          dioceseId,
          parishId: pb.id,
          eventId,
          memberId: m.id,
          rsvpStatus: pick([
            RsvpStatus.YES,
            RsvpStatus.YES,
            RsvpStatus.MAYBE,
            RsvpStatus.NO,
          ]),
          attended: false,
        })),
        skipDuplicates: true,
      });
    }

    // Extra facility booking without event (maintenance closure)
    await prisma.facilityBooking.create({
      data: {
        dioceseId,
        parishId: pb.id,
        facilityId: facilityIds[2]!,
        title: 'HVAC maintenance',
        startAt: daysFromNow(10, 8),
        endAt: daysFromNow(10, 17),
        status: FacilityBookingStatus.CLOSURE,
      },
    });

    // Messages + templates
    await prisma.messageTemplate.createMany({
      data: [
        {
          dioceseId,
          parishId: pb.id,
          name: 'Weekly bulletin',
          channel: MessageChannel.EMAIL,
          subject: 'This week at {{parish}}',
          body: 'Dear members,\n\nJoin us for Holy Qurbana this Sunday.\n\nIn Christ,\nParish Office',
        },
        {
          dioceseId,
          parishId: pb.id,
          name: 'Event reminder SMS',
          channel: MessageChannel.SMS,
          subject: null,
          body: 'Reminder: parish event this weekend. Reply STOP to opt out.',
        },
      ],
    });

    const messageId = randomUUID();
    const msgRecipients = pickN(activeAdults.filter((m) => m.email), 12);
    await prisma.message.create({
      data: {
        id: messageId,
        dioceseId,
        parishId: pb.id,
        channel: MessageChannel.EMAIL,
        subject: `Greetings from ${pb.name}`,
        body: 'Thank you for being part of our parish family.',
        audienceType: AudienceType.ALL_MEMBERS,
        status: MessageStatus.SENT,
        createdByUserId: pb.adminUserId,
      },
    });
    await prisma.messageRecipient.createMany({
      data: msgRecipients.map((m) => ({
        dioceseId,
        parishId: pb.id,
        messageId,
        memberId: m.id,
        channel: MessageChannel.EMAIL,
        status: RecipientStatus.SENT,
        destination: m.email,
        sentAt: daysFromNow(-2, 12),
      })),
      skipDuplicates: true,
    });

    // Queued message sample
    await prisma.message.create({
      data: {
        dioceseId,
        parishId: pb.id,
        channel: MessageChannel.EMAIL,
        subject: 'Upcoming General Body',
        body: 'Please attend the parish general body meeting.',
        audienceType: AudienceType.ALL_MEMBERS,
        status: MessageStatus.QUEUED,
        createdByUserId: pb.staffUserId,
      },
    });

    // Communication preferences (some opt-outs)
    const optOuts = pickN(activeAdults, 5);
    await prisma.communicationPreference.createMany({
      data: optOuts.flatMap((m) => [
        {
          dioceseId,
          parishId: pb.id,
          memberId: m.id,
          channel: MessageChannel.EMAIL,
          optedOut: chance(0.5),
        },
        {
          dioceseId,
          parishId: pb.id,
          memberId: m.id,
          channel: MessageChannel.SMS,
          optedOut: chance(0.7),
        },
      ]),
      skipDuplicates: true,
    });

    // Pending registrations
    await prisma.memberRegistration.createMany({
      data: [
        {
          dioceseId,
          parishId: pb.id,
          firstName: pick(MALE_FIRST),
          lastName: pick(SURNAMES),
          email: `pending.${pb.idx}.${randomUUID().slice(0, 8)}@demo.cms.local`,
          phone: phoneFor(pb.idx, 900 + pb.idx),
          familyName: pick(SURNAMES),
          notes: 'New family relocating from India',
          approvalStatus: RegistrationStatus.PENDING,
        },
        {
          dioceseId,
          parishId: pb.id,
          firstName: pick(FEMALE_FIRST),
          lastName: pick(SURNAMES),
          email: `rejected.${pb.idx}.${randomUUID().slice(0, 8)}@demo.cms.local`,
          approvalStatus: RegistrationStatus.REJECTED,
          reviewedByUserId: pb.adminUserId,
          reviewedAt: daysFromNow(-5),
          notes: 'Duplicate of existing member',
        },
      ],
    });

    // Sacramental records (baptism, communion, marriage sample)
    const sacramentMembers = pickN(
      pb.members.filter((m) => m.status === MemberStatus.ACTIVE),
      20,
    );
    const sacramentalRows = [];
    for (const m of sacramentMembers) {
      if (m.ageYears >= 0) {
        sacramentalRows.push({
          parishId: pb.id,
          memberId: m.id,
          sacramentType: SacramentType.BAPTISM,
          occurredOn: yearsAgo(m.ageYears, 100),
          officiantName: `Fr. ${pick(MALE_FIRST)} ${pick(SURNAMES)}`,
          locationText: chance(0.4) ? 'Kerala, India' : pb.name,
          registerBook: `B-${pb.idx + 1}`,
          registerPage: String(intBetween(1, 200)),
          registerEntry: String(intBetween(1, 50)),
          sponsorNames: `${pick(MALE_FIRST)} & ${pick(FEMALE_FIRST)} ${pick(SURNAMES)}`,
          createdByUserId: pb.clergyUserId,
        });
      }
      if (m.ageYears >= 12 && chance(0.7)) {
        sacramentalRows.push({
          parishId: pb.id,
          memberId: m.id,
          sacramentType: SacramentType.HOLY_COMMUNION,
          occurredOn: yearsAgo(Math.max(0, m.ageYears - 12), 80),
          officiantName: `Fr. ${pick(MALE_FIRST)} ${pick(SURNAMES)}`,
          locationText: pb.name,
          createdByUserId: pb.clergyUserId,
        });
      }
      if (m.ageYears >= 14 && chance(0.5)) {
        sacramentalRows.push({
          parishId: pb.id,
          memberId: m.id,
          sacramentType: SacramentType.CONFIRMATION,
          occurredOn: yearsAgo(Math.max(0, m.ageYears - 14), 60),
          officiantName: `Fr. ${pick(MALE_FIRST)} ${pick(SURNAMES)}`,
          locationText: pb.name,
          createdByUserId: pb.clergyUserId,
        });
      }
    }

    // Marriage records for couples
    for (const fam of pb.families.slice(0, 8)) {
      const head = fam.members.find((m) => m.roleInFamily === 'head');
      const spouse = fam.members.find((m) => m.roleInFamily === 'spouse');
      if (head && spouse) {
        sacramentalRows.push({
          parishId: pb.id,
          memberId: head.id,
          sacramentType: SacramentType.MARRIAGE,
          occurredOn: yearsAgo(intBetween(2, 35)),
          officiantName: `Fr. ${pick(MALE_FIRST)} ${pick(SURNAMES)}`,
          locationText: chance(0.5) ? pb.name : 'Kerala, India',
          spouseMemberId: spouse.id,
          spouseName: `${spouse.firstName} ${spouse.lastName}`,
          witnessNames: `${pick(MALE_FIRST)} ${pick(SURNAMES)}, ${pick(FEMALE_FIRST)} ${pick(SURNAMES)}`,
          createdByUserId: pb.clergyUserId,
        });
      }
    }

    // One ordination per parish (clergy)
    sacramentalRows.push({
      parishId: pb.id,
      memberId: pb.clergyMemberId,
      sacramentType: SacramentType.ORDINATION,
      occurredOn: yearsAgo(intBetween(5, 25)),
      officiantName: 'Rt. Rev. Dr. Isaac Mar Philoxenos',
      locationText: 'Diocesan Cathedral',
      ordainedOffice: 'Priest',
      createdByUserId: dioceseAdminId,
    });

    await prisma.sacramentalRecord.createMany({ data: sacramentalRows });

    // Parish-local liturgical observance
    await prisma.liturgicalObservance.create({
      data: {
        dioceseId,
        parishId: pb.id,
        title: `${pb.name.split(' ')[0]} Parish Day`,
        observanceType: ObservanceType.DIOCESAN_EVENT,
        month: ((pb.idx + 3) % 12) + 1,
        day: 10 + (pb.idx % 15),
        isPublished: true,
      },
    });
  }

  // ── Diocese liturgical calendar ──────────────────────────────────────────
  console.log('   Diocese liturgical observances…');
  await prisma.liturgicalObservance.createMany({
    data: DIOCESE_LITURGICAL.map((o) => ({
      dioceseId,
      parishId: null,
      title: o.title,
      observanceType: o.observanceType,
      month: o.month,
      day: o.day,
      lectionaryRef: o.lectionaryRef ?? null,
      isPublished: true,
    })),
  });

  // ── Data sharing samples (first 3 parishes) ──────────────────────────────
  console.log('   Data-sharing grants & requests…');
  for (let p = 0; p < 3; p++) {
    const pb = parishBundles[p]!;
    const requestId = randomUUID();
    await prisma.dataSharingRequest.create({
      data: {
        id: requestId,
        parishId: pb.id,
        dioceseId,
        dataCategory: DataCategory.MEMBER_DEMOGRAPHICS_DETAIL,
        reason: 'Annual diocese statistical report',
        status:
          p === 0
            ? SharingRequestStatus.APPROVED
            : p === 1
              ? SharingRequestStatus.PENDING
              : SharingRequestStatus.REJECTED,
        requestedByUserId: dioceseReportViewerId,
        reviewedByUserId: p === 1 ? null : pb.sharingManagerUserId,
        reviewedAt: p === 1 ? null : daysFromNow(-3),
        expiresAt: daysFromNow(60),
      },
    });

    if (p === 0) {
      await prisma.dataSharingGrant.create({
        data: {
          parishId: pb.id,
          dioceseId,
          dataCategory: DataCategory.MEMBER_DEMOGRAPHICS_DETAIL,
          granteeType: GranteeType.DIOCESE,
          granteeId: dioceseId,
          scope: SharingScope.SUMMARY_ONLY,
          grantedByUserId: pb.sharingManagerUserId,
          requestId,
          expiresAt: daysFromNow(90),
          isActive: true,
          notes: 'Approved for annual report cycle',
        },
      });
    }

    await prisma.dataSharingGrant.create({
      data: {
        parishId: pb.id,
        dioceseId,
        dataCategory: DataCategory.SACRAMENTAL_RECORDS,
        granteeType: GranteeType.DIOCESE,
        granteeId: dioceseId,
        scope: SharingScope.ALL_RECORDS,
        grantedByUserId: pb.adminUserId,
        expiresAt: daysFromNow(180),
        isActive: true,
      },
    });
  }

  // Emergency access (parish 0, short-lived)
  await prisma.emergencyAccessGrant.create({
    data: {
      parishId: parishBundles[0]!.id,
      dioceseId,
      grantedByUserId: parishBundles[0]!.adminUserId,
      justification: 'Pastoral emergency — clergy hospitalization coverage',
      expiresAt: daysFromNow(7),
      isActive: true,
    },
  });

  // Contextual shares
  const shareToken = 'demo-secure-share-token-r4';
  await prisma.contextualShare.createMany({
    data: [
      {
        parishId: parishBundles[0]!.id,
        dioceseId,
        resourceType: 'member',
        resourceId: parishBundles[0]!.members[0]!.id,
        shareMode: ShareMode.SECURE_LINK,
        createdByUserId: parishBundles[0]!.adminUserId,
        tokenHash: tokenHash(shareToken),
        isAnonymized: false,
        expiresAt: daysFromNow(30),
        maxViews: 25,
        viewCount: 2,
        isActive: true,
      },
      {
        parishId: parishBundles[1]!.id,
        dioceseId,
        resourceType: 'family',
        resourceId: parishBundles[1]!.families[0]!.id,
        shareMode: ShareMode.USER_SHARE,
        createdByUserId: parishBundles[1]!.adminUserId,
        recipientUserId: dioceseStaffId,
        expiresAt: daysFromNow(14),
        isActive: true,
      },
      {
        parishId: parishBundles[2]!.id,
        dioceseId,
        resourceType: 'member',
        resourceId: parishBundles[2]!.members[1]!.id,
        shareMode: ShareMode.ROLE_SHARE,
        createdByUserId: parishBundles[2]!.sharingManagerUserId,
        recipientRole: Role.DIOCESE_STAFF,
        isAnonymized: true,
        expiresAt: daysFromNow(45),
        isActive: true,
      },
    ],
  });

  // ── Audit samples ────────────────────────────────────────────────────────
  console.log('   Audit entries…');
  await prisma.auditEntry.createMany({
    data: [
      {
        requestId: randomUUID(),
        actorType: ActorType.HUMAN,
        actorUserId: dioceseAdminId,
        actorLabel: 'admin@cms.local',
        action: 'seed.initialize',
        entityType: 'diocese',
        entityId: dioceseId,
        outcome: AuditOutcome.SUCCESS,
        dioceseId,
        metadata: { source: 'prisma/seed.ts', parishes: PARISHES.length },
      },
      {
        requestId: randomUUID(),
        actorType: ActorType.HUMAN,
        actorUserId: parishBundles[0]!.adminUserId,
        actorLabel: 'parish1.admin@cms.local',
        action: 'member.create',
        entityType: 'member',
        entityId: parishBundles[0]!.members[0]!.id,
        outcome: AuditOutcome.SUCCESS,
        dioceseId,
        parishId: parishBundles[0]!.id,
      },
      {
        requestId: randomUUID(),
        actorType: ActorType.SYSTEM,
        actorLabel: 'cron',
        action: 'jobs.process_communications',
        entityType: 'message',
        outcome: AuditOutcome.SUCCESS,
        dioceseId,
        metadata: { processed: 10 },
      },
    ],
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  const counts = {
    parishes: await prisma.parish.count(),
    families: await prisma.family.count(),
    members: await prisma.member.count(),
    users: await prisma.appUser.count(),
    programs: await prisma.program.count(),
    organizations: await prisma.organization.count(),
    events: await prisma.event.count(),
    sacramental: await prisma.sacramentalRecord.count(),
    liturgical: await prisma.liturgicalObservance.count(),
    relationships: await prisma.memberRelationship.count(),
    multiParish: await prisma.memberParish.count({
      where: { isPrimary: false },
    }),
  };

  console.log('\n✅ Seed complete');
  console.log(JSON.stringify(counts, null, 2));
  console.log(`
Login accounts (password: Admin@Local1):
  admin@cms.local              DIOCESE_ADMIN
  diocese.staff@cms.local      DIOCESE_STAFF
  reports@cms.local            DIOCESE_REPORT_VIEWER
  parish1.admin@cms.local      PARISH_ADMIN (Dallas)
  parish1.clergy@cms.local     CLERGY
  parish1.staff@cms.local      PARISH_STAFF
  parish1.member@cms.local     MEMBER
  parish1.sharing@cms.local    PARISH_DATA_SHARING_MANAGER
  parishN.*@cms.local          same pattern for parishes 2–10

Secure share demo token: ${shareToken}
`);
}

/**
 * Ensure Supabase Auth users exist and return email-key → auth user id.
 * AppUser rows are created later with these same ids (no FK remapping).
 */
async function ensureAuthUsers(
  users: Array<{
    email: string;
    password: string;
    displayName: string;
    key: string;
  }>,
): Promise<Map<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = new Map<string, string>();

  if (!url || !serviceKey) {
    console.log('   Auth: SUPABASE env not set — skip');
    return result;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('   Provisioning Supabase Auth users…');

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const byEmail = new Map(
    listed.data.users
      .filter((x) => x.email)
      .map((x) => [x.email!.toLowerCase(), x]),
  );

  for (const u of users) {
    const existing = byEmail.get(u.email.toLowerCase());
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, {
        password: u.password,
        email_confirm: true,
        user_metadata: { display_name: u.displayName },
      });
      result.set(u.key, existing.id);
      console.log(`     ✓ ${u.email}`);
      continue;
    }

    const created = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.displayName },
    });
    if (created.error) throw created.error;
    result.set(u.key, created.data.user.id);
    console.log(`     ✓ ${u.email} (created)`);
  }

  return result;
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
