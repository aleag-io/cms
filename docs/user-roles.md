# User Roles & Permissions

## Overview

The CMS uses **role-based access control (RBAC)** with roles scoped to each level of the hierarchy. A user may hold one or more roles, either at the diocese level or at a specific parish level.

---

## 1. Role Hierarchy

```
Diocese Admin
  └── Diocese Staff (readonly/limited)
      └── Parish Admin
          └── Parish Staff
              └── Ministry Leader
                  └── Member (self-service)
                      └── Guest (public/unauthenticated)
```

---

## 2. Role Definitions

### 2.1 Diocese Admin

**Scope:** Entire diocese

**Description:** Full administrative control over the diocese and all parishes. Typically the Chancellor, Director of Administration, or IT administrator for the diocese.

**Capabilities:**
- Manage diocese profile and settings
- Create, configure, and deactivate parishes
- Assign Parish Admin users
- View aggregate reports across all parishes
- Manage diocese-level programs and organizations
- Manage diocese-level events and calendar
- Send diocese-wide communications
- Access all audit logs
- Manage all system users

---

### 2.2 Diocese Staff

**Scope:** Diocese-level structural and aggregate data; detailed parish data only via explicit sharing grant

**Description:** Diocesan office staff who need visibility across parishes for coordination purposes but do not have full administrative authority. Under the **Parish Data Sovereignty** model, Diocese Staff no longer have implicit read access to raw parish data (member records, family records, sacramental records, giving records). They see aggregate/anonymized metrics by default and detailed data only when a Parish Admin has issued a sharing grant for that data category.

**Capabilities:**
- View parish structural data (name, address, pastor, status) for all parishes — always available
- View aggregate metrics (member counts, sacrament counts, total giving, attendance totals) for all parishes — always available
- View detailed parish data **only** for data categories where an active sharing grant exists (e.g., `member_directory`, `giving_detail`)
- Run diocese-level aggregate reports
- Manage assigned diocese programs or organizations (if designated coordinator)
- View own audit log entries
- Cannot create or deactivate parishes
- Cannot manage users at the parish level
- Cannot issue DataSharingRequests (only Diocese Admin can)
- Cannot access any individual member, family, sacramental, or financial records without an explicit sharing grant

---

### 2.3 Parish Admin

**Scope:** Own parish only

**Description:** The primary administrator for a single parish. Typically the parish office manager, deacon, or designated lay administrator.

**Capabilities:**
- Full control over own parish settings and profile
- Manage parish members (create, update, deactivate, transfer)
- Manage families (create, update, merge, deactivate)
- Manage parish programs, ministries, and organizations
- Manage parish events and facility bookings
- Manage sacramental records
- Manage giving campaigns and record donations
- Send parish-wide communications
- Generate and export parish reports
- Manage parish users and assign Parish Staff roles
- View audit logs for own parish

---

### 2.4 Parish Staff

**Scope:** Own parish only

**Description:** Office staff, administrative assistants, or ministry coordinators with elevated but not full access.

**Capabilities (configurable by Parish Admin):**
- View and update member and family records
- Record attendance at events
- Record donations and pledge payments
- Create and manage events
- Send communications (may require approval depending on config)
- Run standard parish reports
- Cannot delete records (soft-delete only, requires Parish Admin)
- Cannot manage sacramental records by default (configurable)
- Cannot manage users

---

### 2.5 Ministry Leader

**Scope:** Own parish; specific program or organization only

**Description:** A volunteer or staff member responsible for running a specific ministry, program, or organization.

**Capabilities:**
- View members enrolled in their assigned program/ministry
- Update enrollment records for their program/ministry
- Record attendance for their program's events
- Send communications to program/ministry members
- Cannot access other parish records outside their program

---

### 2.6 Member (Self-Service Portal)

**Scope:** Own profile and family record only

**Description:** Any registered parishioner with a user account.

**Capabilities:**
- View and update own profile
- View own family record (cannot change family membership structure)
- View own sacramental records (read-only)
- View own giving history and annual giving statements
- RSVP to parish events
- View parish calendar and public announcements
- Opt in/out of communications

---

### 2.7 Guest (Unauthenticated)

**Scope:** Public information only (if enabled per parish)

**Description:** Anonymous users visiting any public-facing parish pages.

**Capabilities:**
- View public parish profile (address, contact, Mass schedule)
- View public parish events calendar
- Submit contact form or online giving form
- No access to any membership or administrative data

---

### 2.8 Diocese Report Viewer (New)

**Scope:** Diocese-level aggregate and shared-report data only

**Description:** A read-only diocesan role for staff or leadership who need only aggregate statistics and reports — no operational access. Suitable for a bishop's office staff member, a finance committee reviewer, or a program evaluator.

**Capabilities:**
- View all Tier 1 (structural) parish data: names, addresses, pastor, status
- View all Tier 2 (aggregate/anonymized) metrics: member counts, giving totals, sacrament counts
- View reports explicitly published to the diocese by Parish Admins (summary scope only)
- Cannot view any raw parish records even if a sharing grant exists
- Cannot issue DataSharingRequests
- Cannot manage any data

---

### 2.9 Parish Data Sharing Manager (New)

**Scope:** Own parish data sharing configuration only

**Description:** An optional parish-level role delegated by a Parish Admin to a trusted staff member to manage the parish's data sharing settings without granting full Parish Admin authority.

**Capabilities:**
- View all active DataSharingGrants for own parish
- Create and revoke DataSharingGrants for own parish
- Approve or reject incoming DataSharingRequests from the diocese
- View sharing request history and audit entries for sharing events
- Cannot access data outside their parish
- Cannot manage parish members, finances, or sacramental records
- All actions are attributed to them in the audit log

---

## 3. Permission Matrix

The table below summarizes access by resource and role. **D** = Diocese only, **P** = Parish only.

> **Key:** ✅ Full access | 👁️ Read-only | 📊 Aggregate/anonymized counts only (no raw records) | ⚙️ Configurable | 🔑 Requires active sharing grant | ❌ No access

| Resource | Diocese Admin | Diocese Staff | Diocese Report Viewer | Parish Admin | Parish Staff | Ministry Leader | Member | Guest |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Diocese settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parish management — create/deactivate (D) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parish profile / structural data (D) | ✅ | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parish aggregate metrics (D) | 📊 | 📊 | 📊 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parish settings (P) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Parish data sharing grants (P) | 👁️ | ❌ | ❌ | ✅ | ⚙️ Data Sharing Manager | ❌ | ❌ | ❌ |
| Member records — raw (P) | 🔑 grant | 🔑 grant | ❌ | ✅ | ✅ | 👁️ (own program) | 👁️ (own) | ❌ |
| Family records — raw (P) | 🔑 grant | 🔑 grant | ❌ | ✅ | ✅ | ❌ | 👁️ (own) | ❌ |
| Sacramental records (P) | 🔑 grant | 🔑 grant | ❌ | ✅ | ⚙️ config | ❌ | 👁️ (own) | ❌ |
| Giving records — raw (P) | 🔑 grant | 🔑 grant | ❌ | ✅ | ✅ | ❌ | 👁️ (own) | ❌ |
| Financial ledger (P) | 🔑 grant | 🔑 grant | ❌ | ✅ | ⚙️ config | ❌ | ❌ | ❌ |
| Events (P) | 📊 agg | ❌ | ❌ | ✅ | ✅ | ✅ (own) | 👁️ | 👁️ public |
| Facilities (P) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Programs / Ministries (P) | 📊 agg | ❌ | ❌ | ✅ | ✅ | ✅ (own) | 👁️ enrolled | ❌ |
| Organizations (P) | 📊 agg | ❌ | ❌ | ✅ | ✅ | ✅ (own) | 👁️ enrolled | ❌ |
| Communications (P) | ❌ | ❌ | ❌ | ✅ | ⚙️ config | ✅ (own) | ❌ | ❌ |
| Diocese-wide aggregate reports | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Shared parish reports (published by parish) | 🔑 grant | 🔑 grant | 🔑 grant (summary only) | ✅ (own) | ❌ | ❌ | ❌ | ❌ |
| Parish standard reports (P) | 🔑 grant | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| User management — diocese level | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User management — parish level (P) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Data sharing requests — create (D→P) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Data sharing requests — approve/reject (P) | ❌ | ❌ | ❌ | ✅ | ⚙️ Data Sharing Manager | ❌ | ❌ | ❌ |
| Emergency access — invoke (D) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logs — diocese level | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logs — parish level (P) | 🔑 grant | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Legend:** ✅ Full access | 👁️ Read-only | 📊 Aggregate/anonymized counts only | ⚙️ Configurable | 🔑 Requires active sharing grant | ❌ No access

---

## 4. Role Assignment Rules

1. Roles are assigned by a user one level above in the hierarchy:
   - Diocese Admin assigns Diocese Staff, Diocese Report Viewer, and Parish Admin roles
   - Diocese Admin assigns Parish Admin roles
   - Parish Admin assigns Parish Staff, Parish Data Sharing Manager, and Ministry Leader roles
   - Ministry Leaders and Members receive their access upon parish enrollment

2. A user may hold **multiple roles** (e.g., a Parish Admin who is also a Member).

3. When a user has roles at both the diocese and parish level, **the most permissive applicable role is used** for each resource — but diocese roles never override the parish data sovereignty boundary. A diocese-level role does not grant raw parish data access; only an active sharing grant does.

4. Parish-level roles are **scoped to a specific parish** — a Parish Admin for Parish A has no access to Parish B.

5. All role assignments are logged in the **audit log**.

---

## 5. Permission Escalation Requests

Parish Staff or Ministry Leaders who need temporary elevated access for a specific task can request temporary access from their Parish Admin. Such grants:
- Must be time-limited (e.g., 7-day window)
- Are audited
- Are configurable by each parish

---

## 6. Future Roles Under Consideration

| Role | Description |
|------|-------------|
| Finance Manager | Full access to giving/financial records only |
| Sacramental Records Secretary | Create and manage sacramental records only |
| Communications Manager | Send communications; no membership write access |
| IT Administrator | User management only (no member data access) |

> **Note:** The Diocese Report Viewer and Parish Data Sharing Manager roles were elevated from "future" to confirmed roles as part of the parish data sovereignty model. See [access-control.md](access-control.md) for the full model.
