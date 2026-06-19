# Data Model

## Overview

This document describes the core entities, their attributes, and relationships in the Diocese Church Management System. Entities are grouped by domain.

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
  ├── has many Families
  ├── has many Members (directly, without family)
  ├── has many ParishPrograms
  ├── has many ParishOrganizations
  ├── has many Events
  ├── has many SacramentalRecords
  ├── has many GivingCampaigns
  ├── has many Facilities
  └── has many Users (parish-level)

Family
  ├── belongs to Parish
  ├── has many FamilyMembers (join: Member + relationship role)
  └── has many GivingRecords

Member
  ├── belongs to Family (optional — can exist without family)
  ├── belongs to Parish
  ├── has many SacramentalRecords
  ├── has many MemberMinistries (join: Programs/Organizations)
  ├── has many AttendanceRecords
  └── has one User account (optional)
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
| `skills_interests` | text[] | Skills/interests for volunteer matching |
| `emergency_contact_name` | string | |
| `emergency_contact_phone` | string | |
| `user_id` | UUID (FK) | Linked user account (nullable) |
| `created_at` | datetime | |
| `updated_at` | datetime | |

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

Represents a group or association within the diocese or parish (e.g., Knights of Columbus, parish council, choir).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `diocese_id` | UUID (FK) | |
| `parish_id` | UUID (FK) | Null = diocesan organization |
| `name` | string | |
| `description` | text | |
| `organization_type` | enum | `ministry`, `council`, `committee`, `apostolate`, `youth`, `other` |
| `is_diocesan` | boolean | |
| `leader_member_id` | UUID (FK) | |
| `meeting_schedule` | text | Human-readable schedule description |
| `status` | enum | `active`, `inactive` |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 4.4 OrganizationMembership

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | UUID (FK) | |
| `member_id` | UUID (FK) | |
| `role` | string | Title/role within organization |
| `joined_at` | date | |
| `left_at` | date | (null = current member) |

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
| `account_code` | string | Account number (e.g., "1000", "4100") |
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
| `entry_date` | date | Transaction date |
| `reference` | string | Reference number (check #, transaction ID, etc.) |
| `description` | text | Memo / description |
| `source_type` | enum | `donation`, `expense`, `payroll`, `adjustment`, `transfer`, `other` |
| `source_id` | UUID | FK to source record (e.g., donation_id) |
| `created_by_user_id` | UUID (FK) | |
| `posted_at` | datetime | When entry was posted (null = draft) |
| `created_at` | datetime | |

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
