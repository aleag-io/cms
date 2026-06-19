# Requirements

## Overview

This document captures the functional and non-functional requirements for the Diocese Church Management System (CMS). Requirements are organized by the four levels of the system hierarchy: **Diocese**, **Parish**, **Family**, and **Member**.

---

## 1. Functional Requirements

### 1.1 Multi-Tenancy & Hierarchy

| ID | Requirement |
|----|-------------|
| MT-1 | The system shall support a single diocese as the root organizational tenant. |
| MT-2 | A diocese shall contain one or more parishes (churches). |
| MT-3 | Each parish shall be a sub-tenant with isolated data, visible to the diocese but not to other parishes. |
| MT-4 | The system shall enforce data boundaries so that Parish A cannot read or write data belonging to Parish B. |
| MT-5 | Diocese-level administrators shall have read access to aggregate data across all parishes. |
| MT-6 | Tenant onboarding shall allow the diocese to add new parishes with their own administrators. |

---

### 1.2 Diocese Administration

| ID | Requirement |
|----|-------------|
| DA-1 | The system shall provide a diocese-level dashboard showing aggregate statistics (total members, upcoming events, etc.). |
| DA-2 | Diocese administrators shall be able to create and manage diocese-wide **programs** (e.g., religious education programs, social ministry). |
| DA-3 | Diocese administrators shall be able to create and manage diocese-level **organizations** (e.g., Knights of Columbus, Catholic Youth Organization). |
| DA-4 | The system shall support diocese-wide **communications** sent to all parishes or selected subsets. |
| DA-5 | Diocese administrators shall be able to create and publish a **liturgical calendar** visible across all parishes. |
| DA-6 | The system shall generate diocese-level **reports** (membership trends, sacramental statistics, financial summaries). |
| DA-7 | Diocese administrators shall be able to configure system-wide settings (branding, fiscal year, sacramental record templates). |

---

### 1.3 Parish (Church) Administration

| ID | Requirement |
|----|-------------|
| PA-1 | Each parish shall have its own **profile** (name, address, contact details, parish website, pastor name). |
| PA-2 | Parish administrators shall manage **parish membership**: add, update, deactivate, and transfer members. |
| PA-3 | The system shall support parish-level **programs** and **ministries** (RCIA, choir, youth group, etc.). |
| PA-4 | Parish administrators shall manage **events** (Masses, meetings, retreats, fundraisers) with scheduling and RSVP support. |
| PA-5 | The system shall support **facility management** for each parish (rooms, halls, equipment booking). |
| PA-6 | Parish administrators shall manage **staff and volunteers**, including role assignments. |
| PA-7 | The system shall record and manage **sacramental records** (Baptism, First Communion, Confirmation, Marriage, Anointing) per parish. |
| PA-8 | Parish administrators shall be able to send **communications** to parish members via email and SMS; browser push notifications are planned for a future phase. |
| PA-9 | The system shall support parish **financial management** including a full ledger (chart of accounts, journal entries), giving campaigns, pledge tracking, donation recording, and financial reporting. |
| PA-10 | Each parish shall have its own **documents repository** for policies, bulletins, and announcements. |

---

### 1.4 Family Management

| ID | Requirement |
|----|-------------|
| FM-1 | The system shall represent a **household/family** as a unit that belongs to a parish. |
| FM-2 | A family record shall contain contact information, mailing address, preferred contact method, and registration date. |
| FM-3 | A family shall be composed of one or more **members** with defined relationships (head of household, spouse, child, dependent). |
| FM-4 | The system shall support the concept of a **primary contact** within a family for parish communications. |
| FM-5 | Family records shall track **envelope numbers** or giving IDs for contribution tracking. |
| FM-6 | The system shall allow families to be marked as **inactive** while preserving historical records. |
| FM-7 | Families shall be transferable between parishes when they change their home church. |
| FM-8 | The system shall record family **anniversaries** (wedding anniversary, registration anniversary) for outreach purposes. |

---

### 1.5 Member Management

| ID | Requirement |
|----|-------------|
| MM-1 | Each member shall have a profile including: name, date of birth, gender, contact details, and photo. |
| MM-2 | The system shall track each member's **sacramental history** (dates and parishes for each sacrament received). |
| MM-3 | Members shall be assignable to **ministries, programs, and organizations** at the parish or diocese level. |
| MM-4 | The system shall track member **attendance** for events, Masses, and programs. |
| MM-5 | The system shall support member **giving history** linked to their family record. |
| MM-6 | Members shall have a defined **status**: Active, Inactive, Deceased, Moved. |
| MM-7 | The system shall record **emergency contacts** per member. |
| MM-8 | Members shall be able to self-register and update their own profile via a member portal. |
| MM-9 | The system shall track member **skills and interests** to assist in volunteer matching. |

---

### 1.6 Authentication & Access

| ID | Requirement |
|----|-------------|
| AU-1 | The system shall require authenticated login for all users. |
| AU-2 | The system shall support **role-based access control** (see [user-roles.md](user-roles.md)). |
| AU-3 | The system shall support **Single Sign-On (SSO)** via OAuth 2.0 / OIDC providers (Google, Microsoft). |
| AU-4 | The system shall support **multi-factor authentication (MFA)**. |
| AU-5 | User sessions shall expire after a configurable period of inactivity. |
| AU-6 | All user actions shall be **audited** with timestamp, user identity, and action taken. |

---

### 1.7 Reporting & Analytics

| ID | Requirement |
|----|-------------|
| RP-1 | The system shall provide pre-built **standard reports** at diocese and parish levels. |
| RP-2 | Reports shall be exportable in PDF, CSV, and Excel formats. |
| RP-3 | The system shall provide an **ad-hoc query builder** for power users. |
| RP-4 | Dashboard visualizations shall include membership trends, event attendance, and giving summaries. |
| RP-5 | The system shall generate **annual giving statements** for members and families. |

---

## 2. Non-Functional Requirements

### 2.1 Security

| ID | Requirement |
|----|-------------|
| SE-1 | All data in transit shall be encrypted via TLS 1.2 or higher. |
| SE-2 | All data at rest shall be encrypted using AES-256 or equivalent. |
| SE-3 | The system shall enforce tenant data isolation — no cross-tenant data leakage. |
| SE-4 | Sensitive fields (SSN, sacramental records) shall have additional access controls and audit logging. |
| SE-5 | The system shall pass annual security audits and support GDPR/CCPA-compatible data handling. |

### 2.2 Performance

| ID | Requirement |
|----|-------------|
| PE-1 | Page load times shall be under 2 seconds for 95% of requests under normal load. |
| PE-2 | The system shall support up to 500 concurrent users per diocese deployment. |
| PE-3 | Bulk operations (import, mass communications) shall process asynchronously with status feedback. |

### 2.3 Availability & Reliability

| ID | Requirement |
|----|-------------|
| AV-1 | The system shall target 99.9% uptime (excluding planned maintenance). |
| AV-2 | Automated database backups shall occur daily with a 30-day retention period. |
| AV-3 | The system shall support disaster recovery with a Recovery Point Objective (RPO) of 24 hours. |

### 2.4 Usability

| ID | Requirement |
|----|-------------|
| UX-1 | The system shall be responsive and accessible on desktop, tablet, and mobile browsers. |
| UX-2 | The system shall meet WCAG 2.1 AA accessibility standards. |
| UX-3 | Key administrative workflows shall be completable in 5 steps or fewer. |

### 2.5 Scalability

| ID | Requirement |
|----|-------------|
| SC-1 | The architecture shall support horizontal scaling of application and database tiers. |
| SC-2 | A single deployment shall support 1 diocese with up to 200 parishes and 100,000 members. |
| SC-3 | The system shall be designed to eventually support multiple dioceses as separate tenants. |

### 2.6 Integration

| ID | Requirement |
|----|-------------|
| IN-1 | The system shall expose a **REST API** for third-party integrations. |
| IN-2 | The system shall support **webhook notifications** for key events (new member, donation received). |
| IN-3 | The system shall support data **import/export** via CSV and standard church data formats. |
| IN-4 | The system shall integrate with **Stripe** for online giving (one-time and recurring). |
| IN-5 | The system shall integrate with **Resend or SendGrid** for transactional and bulk email delivery. |
| IN-6 | The system shall integrate with **Twilio** for SMS notifications to members. |
| IN-7 | The system shall use **Supabase Auth** for user authentication, SSO, and MFA. |
| IN-8 | The system shall use **Vercel Blob** for file storage (photos, documents, exports). |

---

## 3. Constraints

- The system will support a **full financial ledger** (chart of accounts, journal entries, transaction history) for each parish, in addition to giving campaigns and donations.
- The system is intended to **integrate with** but not replace dedicated accounting software; the ledger tracks church finances and can export data to QuickBooks or similar tools.
- The system will initially be deployed for **one diocese** (single-diocese multi-tenant model). Support for multiple dioceses is a future priority.
- All monetary values shall be stored and displayed in **USD**.
- The system shall be hosted on **Vercel** using **Next.js**, **Supabase** (auth and PostgreSQL), and **Vercel Blob** (file storage).
- The web application shall be fully responsive and support desktop, tablet, and mobile browsers. A separate **Expo mobile app** with offline capability is planned as a future project.
- **Offline support** is not in scope for the web application.
- **Public-facing parish pages** (bulletin, Mass schedule, events calendar) are **out of scope**. The CMS is an internal management tool.
- **Confession scheduling** is out of scope.
