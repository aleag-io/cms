# Data Model

## Overview

This document describes the core entities, their attributes, and relationships in the Mar Thoma Church Management System (CMS) for the Diocese of North America. Entities are grouped by domain.

> **Note:** This is a logical data model. Physical column types and indexing strategies will be finalized during implementation.

---

## 1. Entity Relationship Summary

```
Diocese
  ├── has many Parishes
  ├── has many DiocesanPrograms
  ├── has many DiocesanOrganizations
  └── has many Users (diocese-level)

Parish
  ├── belongs to Diocese
  ├── has one ParishMemberIdConfig
  ├── has many ParishOfficers (clergy + board)
  ├── has many Families
  ├── has many Members (directly, without family)
  ├── has many ParishPrograms
  ├── has many ParishOrganizations
  ├── has many Events
  ├── has many SacramentalRecords
  ├── has many GivingCampaigns
  ├── has many Facilities
  ├── has many ParishPermissionOverrides
  └── has many Users (parish-level)

Family
  ├── belongs to Parish
  ├── has a parish-assigned member_number
  ├── has many FamilyMembers (join: Member + relationship role)
  └── has many GivingRecords

Member
  ├── belongs to Family (optional — can exist without family)
  ├── belongs to Parish
  ├── has many SacramentalRecords
  ├── has many MemberMinistries (join: Programs/Organizations)
  ├── has many AttendanceRecords
  ├── has many MemberRelationships (cross-family extended family links)
  └── has one User account (optional)

Organization
  ├── belongs to Parish (or Diocese for diocesan orgs)
  ├── has many OrganizationMembers
  ├── has many OrganizationOfficers
  └── optionally has own Accounts + JournalEntries (when has_own_ledger = true)
```

---

## 2. Core Entities

### 2.1 Diocese

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Full name of the diocese (e.g., "Archdiocese of Chicago") |
| `short_name` | string | Abbreviated name for display |
| `bishop_name` | string | Name of the current Bishop/Archbishop |
| `address` | Address | Mailing address |
| `phone` | string | Main contact phone |
| `email` | string | Main contact email |
| `website` | string | Diocese website URL |
| `logo_url` | string | URL to diocese logo |
| `timezone` | string | Default timezone (e.g., "America/Chicago") |
| `fiscal_year_start` | integer | Month the fiscal year starts (1–12) |
| `created_at` | datetime | Record creation timestamp |
| `updated_at` | datetime | Last updated timestamp |

---

### 2.2 Parish

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | Parent diocese |
| `name` | string | Parish name (e.g., "Saint Mary Parish") |
| `short_name` | string | Abbreviated name |
| `pastor_name` | string | Current pastor name |
| `address` | Address | Physical address |
| `mailing_address` | Address | Mailing address (if different) |
| `phone` | string | Main parish phone |
| `email` | string | Main parish email |
| `website` | string | Parish website |
| `logo_url` | string | Parish logo URL |
| `established_date` | date | Date parish was established |
| `status` | enum | `active`, `merged`, `closed` |
| `created_at` | datetime | |
| `updated_at` | datetime | |

---

### 2.3 Family

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | Owning parish |
| `family_name` | string | Family/household name (e.g., "The Smith Family") |
| `member_number` | string | Parish-assigned member ID (format configured per parish; e.g., "100", "101"). Unique per parish. |
| `envelope_number` | string | Giving envelope number (unique per parish) |
| `mailing_address` | Address | Household mailing address |
| `email` | string | Primary family email |
| `phone` | string | Primary family phone |
| `preferred_contact` | enum | `email`, `phone`, `mail` |
| `registration_date` | date | Date joined this parish |
| `anniversary_date` | date | Wedding anniversary (if applicable) |
| `status` | enum | `active`, `inactive`, `transferred` |
| `notes` | text | Free-text notes |
| `created_at` | datetime | |
| `updated_at` | datetime | |

---

### 2.4 Member

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | Home parish |
| `first_name` | string | |
| `middle_name` | string | Optional |
| `last_name` | string | |
| `preferred_name` | string | Name they go by |
| `date_of_birth` | date | |
| `gender` | enum | `male`, `female`, `other`, `prefer_not_to_say` |
| `email` | string | Personal email |
| `phone_mobile` | string | |
| `phone_home` | string | |
| `photo_url` | string | Profile photo |
| `status` | enum | `active`, `inactive`, `deceased`, `moved` |
| `date_of_death` | date | If deceased |
| `moved_to_parish_id` | UUID (FK) | If transferred |
| `education_level` | enum | `less_than_high_school`, `high_school`, `some_college`, `associate`, `bachelor`, `master`, `doctorate`, `trade_certificate`, `other` |
| `work_notes` | text | Occupation / employer notes visible to authorized parish staff |
| `private_notes` | text | **Clergy-only** notes (vicar, associate pastor, deacon). Access restricted at RLS and application layers; not visible to parish staff or admins. |
| `skills_interests` | text[] | Skills/interests for volunteer matching |
| `emergency_contact_name` | string | |
| `emergency_contact_phone` | string | |
| `user_id` | UUID (FK) | Linked user account (nullable) |
| `created_at` | datetime | |
| `updated_at` | datetime | |

> **Privacy note:** `private_notes` is enforced as a separate RLS-protected column. It is excluded from all reports, exports, directory views, and data sharing grants. Only users whose `member_id` appears in the `ParishOfficer` table with an `officer_type` of `clergy` may read or write this field.

---

### 2.5 FamilyMember (Join Table)

Represents the relationship between a Member and a Family.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `family_id` | UUID (FK) | |
| `member_id` | UUID (FK) | |
| `relationship` | enum | `head_of_household`, `spouse`, `child`, `dependent`, `other` |
| `is_primary_contact` | boolean | Receives primary family communications |
| `joined_at` | date | When member joined this family |

---

### 2.6 ParishMemberIdConfig

Stores the configurable member ID (family number) format for a parish. Each parish can define its own numbering scheme independently.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | One-to-one with Parish |
| `prefix` | string | Optional prefix (e.g., "SMB-", "ST-"). Null = numeric only. |
| `min_digits` | integer | Zero-pad to this many digits (e.g., 3 → "100", "101"). Default: 3 |
| `start_value` | integer | First number assigned (e.g., 100). Default: 1 |
| `next_value` | integer | Next number to be auto-assigned (incremented on each new family) |
| `auto_increment` | boolean | If true, the system auto-assigns the next number on family creation. If false, admin must supply the number manually. |
| `allow_manual_override` | boolean | Allow admins to assign a specific number outside the sequence |
| `updated_at` | datetime | |

> **Example:** A church using 3-digit IDs starting at 100 sets `min_digits=3`, `start_value=100`, `auto_increment=true`. The formatted member number is `prefix + zero_pad(next_value, min_digits)` → "100", "101", "102".

---

### 2.7 MemberRelationship

Tracks extended family relationships between members **across different family records**. This captures connections like grandparents, uncles/aunts, cousins, and in-laws who belong to separate households/families within the same parish.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | Owning parish (both members must belong to this parish) |
| `member_id` | UUID (FK) | The member this relationship is recorded from |
| `related_member_id` | UUID (FK) | The related member |
| `relationship_type` | enum | `parent`, `child`, `grandparent`, `grandchild`, `sibling`, `aunt_uncle`, `niece_nephew`, `cousin`, `spouse`, `in_law`, `step_parent`, `step_child`, `guardian`, `other` |
| `notes` | text | Optional clarifying note |
| `created_at` | datetime | |

> **Note:** Spouse relationships *within* the same family unit are captured via `FamilyMember.relationship = 'spouse'`. `MemberRelationship` is for **cross-family** links — e.g., a member's parents who have their own separate family/member number at the same parish.

---

### 2.8 ParishOfficer

Tracks the official officers of the parish itself — clergy (vicar, associate pastors, deacons) and lay leadership (board members, executive committee, trustees, finance committee).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | |
| `member_id` | UUID (FK) | The member serving in this role |
| `title` | string | Official title (e.g., "Vicar", "Associate Pastor", "Deacon", "Board Chairman", "Treasurer", "Secretary") |
| `officer_type` | enum | `clergy`, `board`, `executive_committee`, `finance_committee`, `trustee`, `other` |
| `term_start` | date | |
| `term_end` | date | Null = current/indefinite |
| `is_active` | boolean | |
| `notes` | text | |
| `created_at` | datetime | |

> **Access note:** Members with `officer_type = 'clergy'` are automatically granted access to `private_notes` on member records within their parish.

## 3. Sacramental Records

### 3.1 SacramentalRecord

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `member_id` | UUID (FK) | Member who received the sacrament |
| `parish_id` | UUID (FK) | Parish where sacrament was administered |
| `sacrament_type` | enum | `baptism`, `first_communion`, `confirmation`, `marriage`, `anointing`, `holy_orders` |
| `sacrament_date` | date | Date sacrament was received |
| `minister_name` | string | Presiding minister/priest |
| `sponsor_name` | string | Godparent/sponsor (for Baptism, Confirmation) |
| `spouse_name` | string | Spouse name (for Marriage) |
| `book_number` | string | Parish register book number |
| `page_number` | string | Page in register |
| `entry_number` | string | Entry number in register |
| `notes` | text | Additional notes |
| `created_at` | datetime | |
| `updated_at` | datetime | |

---

## 4. Programs & Organizations

### 4.1 Program

Represents a structured educational, social, or ministry program at either the diocese or parish level.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | Owning diocese |
| `parish_id` | UUID (FK) | Owning parish (null = diocesan program) |
| `name` | string | Program name |
| `description` | text | |
| `program_type` | enum | `religious_education`, `social_ministry`, `youth`, `adult_formation`, `sacramental_prep`, `other` |
| `is_diocesan` | boolean | True if diocese-level program |
| `start_date` | date | |
| `end_date` | date | (null = ongoing) |
| `coordinator_member_id` | UUID (FK) | Member who coordinates the program |
| `status` | enum | `active`, `inactive`, `completed` |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 4.2 ProgramEnrollment

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `program_id` | UUID (FK) | |
| `member_id` | UUID (FK) | |
| `role` | enum | `participant`, `facilitator`, `coordinator` |
| `enrolled_at` | date | |
| `completed_at` | date | (null = in progress) |
| `notes` | text | |

---

### 4.3 Organization

Represents a group or association within the diocese or parish (e.g., Knights of Columbus, youth fellowship, Sunday school, prayer group, women's guild).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | |
| `parish_id` | UUID (FK) | Null = diocesan organization |
| `name` | string | |
| `description` | text | |
| `organization_type` | enum | **Required at creation.** `ministry`, `council`, `committee`, `apostolate`, `youth_fellowship`, `young_family_fellowship`, `sunday_school`, `prayer_group`, `womens_guild`, `mens_group`, `choir`, `confraternity`, `sodality`, `third_order`, `other` |
| `membership_mode` | enum | `open` (default) or `exclusive`. Controls whether a member may belong to more than one active organization of this type simultaneously. Defaults to `exclusive` for `prayer_group`; defaults to `open` for all other types. Admins may override the default when creating or editing the organization. |
| `is_diocesan` | boolean | |
| `meeting_schedule` | text | Human-readable schedule description |
| `has_own_ledger` | boolean | If true, this organization maintains its own chart of accounts and journal entries, separate from the parish ledger |
| `status` | enum | `active`, `inactive` |
| `created_at` | datetime | |
| `updated_at` | datetime | |

> **Type defaults for `membership_mode`:**
> | `organization_type` | Default `membership_mode` |
> |---------------------|--------------------------|
> | `prayer_group` | `exclusive` |
> | All other types | `open` |
>
> When `membership_mode = 'exclusive'`, the system enforces that a member may hold at most one **active** membership (`left_at IS NULL`) across all organizations of the same `organization_type` within the same parish. This constraint is enforced at the database layer (unique partial index or CHECK via trigger).

### 4.4 OrganizationMembership

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | UUID (FK) | |
| `member_id` | UUID (FK) | |
| `role` | string | General participation role (e.g., "member", "volunteer") |
| `joined_at` | date | |
| `left_at` | date | (null = current member) |

> **Exclusivity constraint:** When the parent `Organization.membership_mode = 'exclusive'`, the system prevents a member from having more than one active membership (`left_at IS NULL`) across all organizations sharing the same `organization_type` within the same parish. Attempting to add a member to a second exclusive organization of the same type will surface a validation error. An admin may resolve the conflict by first ending the member's existing membership.

### 4.5 OrganizationOfficer

Tracks elected or appointed officers of a parish or diocesan organization. An organization may have multiple officers simultaneously (president, vice president, secretary, treasurer, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | UUID (FK) | |
| `member_id` | UUID (FK) | The member serving as officer |
| `title` | string | Officer title (e.g., "President", "Vice President", "Secretary", "Treasurer", "Chaplain") |
| `term_start` | date | |
| `term_end` | date | Null = current/indefinite |
| `is_active` | boolean | |
| `notes` | text | |
| `created_at` | datetime | |

---

## 5. Events

### 5.1 Event

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | |
| `parish_id` | UUID (FK) | Null = diocesan event |
| `title` | string | |
| `description` | text | |
| `event_type` | enum | `mass`, `meeting`, `retreat`, `fundraiser`, `sacrament`, `celebration`, `other` |
| `is_recurring` | boolean | |
| `recurrence_rule` | string | iCal RRULE string |
| `start_datetime` | datetime | |
| `end_datetime` | datetime | |
| `location` | string | Address or facility name |
| `facility_id` | UUID (FK) | Linked facility (if applicable) |
| `max_capacity` | integer | Optional attendee cap |
| `is_public` | boolean | Visible on public calendar |
| `created_by_user_id` | UUID (FK) | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 5.2 EventAttendance

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `event_id` | UUID (FK) | |
| `member_id` | UUID (FK) | |
| `rsvp_status` | enum | `attending`, `not_attending`, `maybe` |
| `attended` | boolean | Actual attendance (recorded after event) |
| `rsvp_at` | datetime | |

---

## 6. Giving & Finances

The financial model supports a **full double-entry ledger** in addition to giving-specific entities (campaigns, donations, pledges). All financial transactions — donations, expenses, payroll, utilities — are recorded as journal entries in the general ledger.

### 6.1 Account (Chart of Accounts)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | Owning parish |
| `organization_id` | UUID (FK) | Owning organization (null = parish-level account). Must be null when `ledger_scope = 'parish'`. |
| `ledger_scope` | enum | `parish` (default) or `organization`. Determines which ledger this account belongs to. |
| `account_code` | string | Account number (e.g., "1000", "4100"). Unique per ledger scope (parish or org). |
| `name` | string | Account name (e.g., "General Fund", "Building Fund", "Salaries") |
| `account_type` | enum | `asset`, `liability`, `equity`, `income`, `expense` |
| `parent_account_id` | UUID (FK) | Parent account for hierarchical chart (nullable) |
| `description` | text | |
| `is_active` | boolean | |
| `created_at` | datetime | |

### 6.2 JournalEntry

Represents a single accounting transaction (double-entry).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | |
| `organization_id` | UUID (FK) | Null = parish-level entry. Set when this entry belongs to an organization's own ledger. |
| `ledger_scope` | enum | `parish` or `organization` — mirrors the owning Account's scope |
| `entry_date` | date | Transaction date |
| `reference` | string | Reference number (check #, transaction ID, etc.) |
| `description` | text | Memo / description |
| `source_type` | enum | `donation`, `expense`, `payroll`, `adjustment`, `transfer`, `other` |
| `source_id` | UUID | FK to source record (e.g., donation_id) |
| `created_by_user_id` | UUID (FK) | |
| `posted_at` | datetime | When entry was posted (null = draft) |
| `created_at` | datetime | |

> **Note:** Organization ledgers are financially separate from the parish ledger. An organization with `has_own_ledger = true` manages its own chart of accounts and journal entries. The parish admin retains visibility into all organization ledgers within the parish via the parish settings panel.

### 6.3 JournalLine

Each `JournalEntry` has two or more lines (debits and credits must balance).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `journal_entry_id` | UUID (FK) | |
| `account_id` | UUID (FK) | Account being debited or credited |
| `type` | enum | `debit`, `credit` |
| `amount` | decimal | Amount in USD (always positive) |
| `memo` | string | Optional line-level description |

### 6.4 GivingCampaign

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | |
| `name` | string | Campaign name (e.g., "Annual Fund 2025") |
| `description` | text | |
| `account_id` | UUID (FK) | Linked chart-of-accounts entry (fund) |
| `goal_amount` | decimal | Target fundraising goal |
| `start_date` | date | |
| `end_date` | date | |
| `status` | enum | `active`, `completed`, `cancelled` |
| `created_at` | datetime | |

### 6.5 Donation

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | |
| `family_id` | UUID (FK) | |
| `member_id` | UUID (FK) | Optional (if given by individual) |
| `campaign_id` | UUID (FK) | Optional (general giving if null) |
| `journal_entry_id` | UUID (FK) | Linked ledger entry |
| `amount` | decimal | Donation amount in USD |
| `donation_date` | date | |
| `method` | enum | `cash`, `check`, `online`, `ach`, `stock`, `other` |
| `check_number` | string | |
| `transaction_id` | string | Payment processor transaction ID (Stripe) |
| `is_pledged` | boolean | Part of a pledge |
| `pledge_id` | UUID (FK) | |
| `created_at` | datetime | |

### 6.6 Pledge

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | |
| `family_id` | UUID (FK) | |
| `campaign_id` | UUID (FK) | |
| `pledged_amount` | decimal | Total pledge commitment |
| `frequency` | enum | `one_time`, `weekly`, `monthly`, `annual` |
| `start_date` | date | |
| `end_date` | date | |
| `fulfilled_amount` | decimal | Amount paid to date (computed) |
| `status` | enum | `active`, `fulfilled`, `lapsed`, `cancelled` |

---

## 6.7 ParishPermissionOverride

Enables a Parish Admin to grant or deny specific capabilities to specific roles at a granular level, beyond the system defaults. This supports the parish settings page where admins configure exactly what each role can do within their parish.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | |
| `role` | enum | The role being configured (e.g., `parish_staff`, `ministry_leader`, `organization_leader`) |
| `resource` | string | The resource or module (e.g., `sacramental_records`, `giving_records`, `private_notes`, `org_ledger`, `communications`) |
| `action` | enum | `read`, `write`, `delete`, `export`, `send` |
| `is_allowed` | boolean | True = allow; false = explicitly deny (overrides role default) |
| `granted_by_user_id` | UUID (FK) | Parish Admin who set this override |
| `created_at` | datetime | |
| `updated_at` | datetime | |

> **Design note:** The system ships with a default permission set per role (matching the permission matrix in [user-roles.md](user-roles.md)). Parish Admins may override individual permissions up or down (within the bounds of their own authority). Overrides are applied on top of defaults at query time, logged in the audit trail, and visible on the Church Admin Settings → Permissions page.

---

## 7. Users & Access

### 7.1 User

> **Note:** User authentication is managed by **Supabase Auth**. The `auth.users` table is owned by Supabase. The application maintains a `profiles` table in the `public` schema that extends the Supabase user record with application-specific fields.

#### profiles (extends Supabase `auth.users`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key — matches `auth.users.id` |
| `display_name` | string | Full display name |
| `diocese_id` | UUID (FK) | Associated diocese |
| `parish_id` | UUID (FK) | Associated parish (null for diocese-level users) |
| `member_id` | UUID (FK) | Linked member record (nullable) |
| `status` | enum | `active`, `inactive`, `locked` |
| `last_login_at` | datetime | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 7.2 UserRole

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID (FK) | |
| `role` | enum | See [user-roles.md](user-roles.md) |
| `granted_at` | datetime | |
| `granted_by_user_id` | UUID (FK) | |

---

## 8. Audit Log

### 8.1 AuditEntry

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID (FK) | Actor |
| `diocese_id` | UUID (FK) | Context |
| `parish_id` | UUID (FK) | Context (nullable) |
| `action` | string | Action performed (e.g., `member.create`, `donation.update`) |
| `entity_type` | string | Table/entity affected |
| `entity_id` | UUID | ID of affected record |
| `changes` | jsonb | Before/after values |
| `ip_address` | string | Requestor IP |
| `timestamp` | datetime | When action occurred |

---

## 9. Data Sharing

These entities implement the **Parish Data Sovereignty** sharing model. See [access-control.md](access-control.md) for full details.

### 9.1 DataSharingGrant

Authorizes a specific grantee (diocese or another parish, for transfer workflows) to access a specific data category for a parish. Created by a Parish Admin or Parish Data Sharing Manager.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `parish_id` | UUID (FK) | The parish whose data is being shared |
| `data_category` | enum | One of: `member_directory`, `member_demographics_detail`, `family_records`, `sacramental_records`, `giving_detail`, `giving_statements`, `program_roster`, `financial_statements`, `ledger_detail`, `attendance_detail`, `audit_log`, `communications_history` |
| `grantee_type` | enum | `diocese` |
| `grantee_id` | UUID (FK) | UUID of the diocese |
| `grantee_role_filter` | string[] | Optional: restrict to specific roles (e.g., `["diocese_admin"]`) |
| `scope` | enum | `all_records`, `summary_only`, `program_scoped`, `period_scoped` |
| `scope_detail` | jsonb | Optional: `{ "program_id": "uuid" }` or `{ "year": 2025 }` |
| `access_type` | enum | `read_only` (default) |
| `granted_by_user_id` | UUID (FK) | Parish Admin or Data Sharing Manager who issued the grant |
| `granted_at` | datetime | |
| `expires_at` | datetime | Optional; null = permanent until revoked |
| `is_active` | boolean | `false` = revoked |
| `revoked_at` | datetime | Timestamp of revocation (nullable) |
| `revoked_by_user_id` | UUID (FK) | User who revoked (nullable) |
| `notes` | text | Reason for grant |
| `created_at` | datetime | |

### 9.2 DataSharingRequest

A request initiated by a Diocese Admin asking a parish to issue a sharing grant for a specific data category.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | Requesting diocese |
| `parish_id` | UUID (FK) | Target parish |
| `requested_by_user_id` | UUID (FK) | Diocese Admin who submitted the request |
| `data_category` | enum | Same enum as `DataSharingGrant.data_category` |
| `scope` | enum | Requested scope |
| `scope_detail` | jsonb | Optional scope parameters |
| `reason` | text | Required: justification for the request |
| `status` | enum | `pending`, `approved`, `rejected`, `expired` |
| `reviewed_by_user_id` | UUID (FK) | Parish Admin who approved/rejected (nullable) |
| `reviewed_at` | datetime | Nullable |
| `resulting_grant_id` | UUID (FK) | FK to `DataSharingGrant` if approved (nullable) |
| `expires_at` | datetime | Auto-expires 14 days after creation if not acted upon |
| `created_at` | datetime | |

### 9.3 EmergencyAccessGrant

A Diocese Admin–only override granting temporary access to parish data in exceptional circumstances. Separate from standard sharing grants.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | |
| `parish_id` | UUID (FK) | Target parish |
| `invoked_by_user_id` | UUID (FK) | Diocese Admin |
| `data_categories` | enum[] | List of categories covered by the override |
| `reason` | text | Mandatory justification |
| `invoked_at` | datetime | |
| `expires_at` | datetime | Maximum 7 days from `invoked_at`; system-enforced |
| `is_active` | boolean | Set to `false` on expiry or early revocation |
| `revoked_at` | datetime | Nullable |
| `notified_parish_admin_at` | datetime | When notification was sent to Parish Admin |

---

## 10. Shared Value Objects

### Address (Embedded)

| Field | Type |
|-------|------|
| `street1` | string |
| `street2` | string |
| `city` | string |
| `state` | string |
| `zip` | string |
| `country` | string (default: "US") |
