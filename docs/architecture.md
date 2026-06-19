# System Architecture

## Overview

The Diocese Church Management System (CMS) is a **multi-tenant web application** built on a hierarchical tenancy model: one diocese containing multiple parishes. This document describes the system architecture, technology choices (to be confirmed), and key architectural decisions.

---

## 1. Tenancy Model

### 1.1 Hierarchy

```
Diocese (root tenant)
└── Parish A (sub-tenant)
│   ├── Families
│   │   └── Members
│   ├── Programs & Ministries
│   ├── Events
│   └── Organizations
├── Parish B (sub-tenant)
│   └── ...
└── Parish N (sub-tenant)
    └── ...
```

### 1.2 Tenancy Strategy

The system uses a **shared database, shared schema with tenant discriminator** strategy:

- Every major table includes a `parish_id` foreign key (and implicitly a `diocese_id`).
- Diocese-level entities carry only `diocese_id`.
- Application-level middleware enforces tenant scoping on every query.
- A dedicated **Diocese Admin** role can query across all parishes for reporting purposes (read-only aggregate queries).

**Rationale:** This approach balances operational simplicity (single schema to maintain) with scalability (can migrate to per-tenant schemas or databases later if needed).

> **Future consideration:** If data isolation requirements increase (e.g., supporting multiple dioceses), each diocese can be migrated to its own database instance.

### 1.3 Tenant Provisioning

```
Diocese Admin
  → creates Parish record
  → system generates Parish tenant context
  → assigns Parish Admin user
Parish Admin
  → configures parish profile
  → begins managing membership
```

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Clients                          │
│  Web Browser        Mobile Browser      API Consumers   │
└────────────┬───────────────┬────────────────┬───────────┘
             │               │                │
             ▼               ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                     CDN / Load Balancer                 │
│           (static assets, SSL termination)              │
└──────────────────────────┬──────────────────────────────┘
                           │
             ┌─────────────▼──────────────┐
             │    Web / API Application   │
             │   (Next.js or similar SPA  │
             │    + REST/GraphQL API)      │
             └─────────────┬──────────────┘
                           │
        ┌──────────────────┼────────────────────┐
        │                  │                    │
        ▼                  ▼                    ▼
┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  Auth Service │  │  Background Jobs │  │  File Storage    │
│  (SSO / MFA)  │  │  (Queue Worker)  │  │  (S3 / Blob)     │
└──────────────┘  └─────────────────┘  └──────────────────┘
                           │
        ┌──────────────────┼────────────────────┐
        │                  │                    │
        ▼                  ▼                    ▼
┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  Primary DB   │  │  Cache (Redis)   │  │  Email/SMS       │
│  (PostgreSQL) │  │                 │  │  Provider        │
└──────────────┘  └─────────────────┘  └──────────────────┘
```

---

## 3. Component Descriptions

### 3.1 Frontend (Web Application)

- **Type:** Single-page application (SPA) or server-rendered (Next.js / React recommended)
- **Responsibilities:**
  - Diocesan admin portal
  - Parish admin portal
  - Member self-service portal
  - Responsive design for mobile and desktop
- **Key Considerations:**
  - Role-aware navigation (menus differ by user role and tenant level)
  - Tenant context communicated via JWT claims or session

### 3.2 API Layer

- **Type:** RESTful API (JSON) with optional GraphQL for flexible queries
- **Responsibilities:**
  - Business logic enforcement
  - Tenant isolation middleware (all queries scoped to current tenant)
  - Input validation and error handling
  - Rate limiting per tenant
- **Authentication:** JWT ****** issued by the Auth Service

### 3.3 Auth Service

- **Responsibilities:**
  - User authentication (username/password, SSO)
  - MFA enforcement
  - JWT issuance (includes `diocese_id`, `parish_id`, `role` claims)
  - Session management and token refresh
- **Options:** Auth0, AWS Cognito, Keycloak, or custom implementation

### 3.4 Background Job Queue

- **Responsibilities:**
  - Sending bulk email/SMS communications
  - Generating large reports (PDF, Excel)
  - Importing member data from CSV uploads
  - Sending scheduled reminders (event reminders, anniversary notifications)
- **Technology Options:** Redis + BullMQ, AWS SQS + Lambda, RabbitMQ

### 3.5 Primary Database

- **Type:** PostgreSQL (recommended)
- **Tenant Isolation:** Row-level security (RLS) policies enforced at DB level as secondary defense-in-depth
- **Key Schemas:**
  - `diocese` — diocese-level entities
  - `parish` — parish-level entities
  - `membership` — families and members
  - `sacraments` — sacramental records
  - `giving` — financial/giving records
  - `events` — events and scheduling
  - `communications` — message history
  - `audit` — audit log

### 3.6 File Storage

- **Responsibilities:**
  - Member photos
  - Parish documents (bulletins, policies)
  - Report exports
  - Imported CSV files
- **Access:** Signed URLs generated by the API, objects stored per-tenant prefixed path (`/{diocese_id}/{parish_id}/...`)

### 3.7 Cache

- **Type:** Redis
- **Responsibilities:**
  - Session store
  - Frequently accessed reference data (liturgical calendar, parish profile)
  - Rate limiting counters
  - Job queue backend

---

## 4. Security Architecture

### 4.1 Defense in Depth

```
Request
  → TLS (in transit)
  → CDN/WAF (DDoS, injection protection)
  → Auth Service (identity verification)
  → API Middleware (tenant scoping, authorization)
  → Database RLS (data isolation)
  → Audit Log (traceability)
```

### 4.2 JWT Structure

```json
{
  "sub": "user-uuid",
  "email": "admin@stmary.diocese.org",
  "diocese_id": "uuid-diocese",
  "parish_id": "uuid-parish",        // null for diocese-level admins
  "roles": ["parish_admin"],
  "iat": 1700000000,
  "exp": 1700003600
}
```

### 4.3 Data Isolation Rules

| Actor | Can Access |
|-------|-----------|
| Diocese Admin | All parishes (read aggregate), diocese entities (read/write) |
| Parish Admin | Own parish data only (full read/write) |
| Parish Staff | Assigned parish, limited write scope |
| Member | Own profile and family record |
| Anonymous | Public parish information only (if enabled) |

---

## 5. Deployment Architecture

### 5.1 Environments

| Environment | Purpose |
|-------------|---------|
| Development | Local developer machines |
| Staging | Pre-production testing, mirrors production config |
| Production | Live system |

### 5.2 Infrastructure (Cloud-Native)

```
Cloud Provider (AWS / Azure / GCP)
├── Compute: Container service (ECS, App Service, Cloud Run)
├── Database: Managed PostgreSQL (RDS, Azure DB, Cloud SQL)
├── Cache: Managed Redis (ElastiCache, Azure Cache)
├── Storage: Object storage (S3, Azure Blob, GCS)
├── CDN: CloudFront / Azure CDN / Cloud CDN
├── Queue: SQS / Service Bus / Pub Sub
├── Email: SES / SendGrid
└── Auth: Cognito / Auth0 / Keycloak
```

### 5.3 CI/CD Pipeline

```
Developer pushes to feature branch
  → Automated tests (unit + integration)
  → Code review / PR approval
  → Merge to main
  → Build Docker image
  → Deploy to Staging
  → Integration / E2E tests
  → Manual approval gate
  → Deploy to Production
  → Post-deploy health checks
```

---

## 6. Integration Points

| Integration | Purpose | Protocol |
|-------------|---------|---------|
| Email provider (SendGrid / SES) | Transactional & bulk email | HTTPS API |
| SMS provider (Twilio / SNS) | SMS notifications | HTTPS API |
| Payment processor (Stripe) | Online giving | HTTPS API + Webhooks |
| Accounting software (QuickBooks) | Export giving data | CSV export / API |
| SSO provider (Google, Microsoft) | Staff login | OAuth 2.0 / OIDC |
| Calendar (Google Calendar, iCal) | Event sync | iCal / CalDAV |

---

## 7. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tenancy model | Shared DB, shared schema with discriminator | Simplest to operate; can migrate later |
| API style | REST with optional GraphQL | REST for simplicity; GraphQL for flexible reporting queries |
| Auth | JWT with role claims | Stateless, works well for SPA and API clients |
| Database | PostgreSQL | Strong ACID, RLS support, rich query capabilities |
| Background jobs | Queue-based async processing | Prevents long-running requests from impacting UX |
| File storage | Object storage (S3-compatible) | Scalable, durable, cost-effective |

---

## 8. Open Questions (To Be Resolved)

1. **Mobile apps:** Will native iOS/Android apps be required, or is mobile browser sufficient?
2. **Offline support:** Should parish admins be able to use the app offline (e.g., during Mass)?
3. **Multiple dioceses:** Timeline and priority for supporting multiple diocese tenants?
4. **Financial integration depth:** Full ledger or only giving/donation tracking?
5. **Public-facing pages:** Should parishes have public-facing web pages (bulletin, Mass schedule) generated by the CMS?
6. **Notification channels:** SMS and push notifications in addition to email?
