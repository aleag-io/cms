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

**Scope:** Diocese-level read access; limited write access

**Description:** Diocesan office staff who need visibility across parishes for coordination purposes but do not have full administrative authority.

**Capabilities:**
- View (read-only) all parish data and member records
- Run diocese-level reports
- Manage assigned diocese programs or organizations (if designated coordinator)
- View audit logs (own actions only)
- Cannot create or deactivate parishes
- Cannot manage users at the parish level

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

## 3. Permission Matrix

The table below summarizes access by resource and role. **D** = Diocese only, **P** = Parish only.

| Resource | Diocese Admin | Diocese Staff | Parish Admin | Parish Staff | Ministry Leader | Member | Guest |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Diocese settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parish management (D) | ✅ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Parish settings (P) | ✅ | 👁️ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Member records | ✅ | 👁️ | ✅ | ✅ | 👁️ (own program) | 👁️ (own) | ❌ |
| Family records | ✅ | 👁️ | ✅ | ✅ | ❌ | 👁️ (own) | ❌ |
| Sacramental records | ✅ | 👁️ | ✅ | ⚙️ config | ❌ | 👁️ (own) | ❌ |
| Giving records | ✅ | 👁️ | ✅ | ✅ | ❌ | 👁️ (own) | ❌ |
| Events (P) | ✅ | 👁️ | ✅ | ✅ | ✅ (own) | 👁️ | 👁️ public |
| Facilities | ✅ | 👁️ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Programs / Ministries | ✅ | 👁️ | ✅ | ✅ | ✅ (own) | 👁️ | ❌ |
| Organizations | ✅ | 👁️ | ✅ | ✅ | ✅ (own) | 👁️ | ❌ |
| Communications | ✅ | ❌ | ✅ | ⚙️ config | ✅ (own) | ❌ | ❌ |
| Reports (D-wide) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reports (parish) | ✅ | 👁️ | ✅ | ✅ | ❌ | ❌ | ❌ |
| User management (D) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User management (P) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit logs (D) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit logs (P) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Legend:** ✅ Full access | 👁️ Read-only | ⚙️ Configurable | ❌ No access

---

## 4. Role Assignment Rules

1. Roles are assigned by a user one level above in the hierarchy:
   - Diocese Admin assigns Diocese Staff roles
   - Diocese Admin assigns Parish Admin roles
   - Parish Admin assigns Parish Staff and Ministry Leader roles
   - Ministry Leaders and Members receive their access upon parish enrollment

2. A user may hold **multiple roles** (e.g., a Parish Admin who is also a Member).

3. When a user has roles at both the diocese and parish level, **the most permissive applicable role is used** for each resource.

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
