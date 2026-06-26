# Technology Stack

This document is the definitive reference for the confirmed technology choices for the Mar Thoma Church Management System (CMS) for the Diocese of North America.

---

## Summary

| Layer           | Technology                                           | Purpose                                             |
| --------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Framework       | Next.js (App Router)                                 | Full-stack React framework                          |
| UI Library      | shadcn/ui + Tailwind CSS                             | Component library and styling                       |
| Hosting         | Vercel                                               | Application hosting, CDN, cron, preview deployments |
| Auth            | Supabase Auth                                        | Authentication, SSO, MFA                            |
| Database        | Supabase PostgreSQL                                  | Primary relational data store                       |
| ORM / Query     | Supabase JS client + `drizzle-orm` or `prisma` (TBD) | Type-safe database access                           |
| File Storage    | Vercel Blob                                          | Photos, documents, exported reports                 |
| Email           | Resend (preferred) or SendGrid                       | Transactional and bulk email                        |
| SMS             | Twilio                                               | SMS notifications                                   |
| Payments        | Stripe                                               | Online giving (one-time and recurring)              |
| Background Jobs | Vercel Cron Jobs + Supabase Edge Functions           | Scheduled tasks, async processing                   |
| Language        | TypeScript                                           | Type-safe JavaScript across the stack               |

---

## 1. Framework — Next.js (App Router)

**Why:** Next.js with the App Router provides React Server Components (RSC), co-located API route handlers, built-in caching and ISR, and first-class Vercel deployment support. Server Components reduce the client-side JavaScript bundle for data-heavy admin pages.

**Key Patterns:**

- Server Components for data fetching (direct Supabase queries server-side)
- Client Components for interactive UI (forms, modals, real-time updates)
- API Route Handlers (`/app/api/...`) for webhooks (Stripe, Twilio) and REST endpoints
- Middleware for auth guards and tenant context injection

---

## 2. UI Library — shadcn/ui + Tailwind CSS

**Why:** shadcn/ui provides accessible, composable React components built on Radix UI primitives. Components are copied into the project (not a black-box dependency), making them fully customizable. Tailwind CSS provides utility-first styling with a design token system for branding.

**Key Usage:**

- Data tables for member/family/donation lists
- Forms with validation (react-hook-form + zod)
- Modals, sheets, and dialogs for CRUD operations
- Charts for dashboards (Recharts via shadcn charts)
- Navigation sidebar with role-aware menu items
- Responsive layout using Tailwind breakpoints (`sm:`, `md:`, `lg:`)

---

## 3. Hosting — Vercel

**Why:** Zero-config deployments for Next.js, automatic preview URLs per pull request, edge network for global performance, built-in cron jobs, and Vercel Blob storage.

**Key Features Used:**

- **Vercel Edge Middleware** — Auth guards, redirect unauthenticated users
- **Vercel Cron Jobs** — Scheduled tasks (anniversary reminders, batch email, report generation)
- **Vercel Preview Deployments** — Each PR gets a unique URL for QA
- **Vercel Analytics** — Web Vitals and performance monitoring
- **Environment variables** — Securely store Supabase keys, Stripe keys, Twilio credentials

---

## 4. Auth — Supabase Auth

**Why:** Supabase Auth integrates directly with the PostgreSQL database and Row-Level Security policies. Provides email/password, SSO (Google, Microsoft), MFA (TOTP), and user management out of the box.

**Key Features Used:**

- Email/password login for all users
- OAuth SSO for diocese and parish staff (Google Workspace, Microsoft Entra)
- TOTP-based MFA (enforced for admin roles)
- Custom JWT claims via a PostgreSQL hook — injects `diocese_id`, `parish_id`, `roles` into the JWT
- Supabase `@supabase/ssr` package for server-side session handling in Next.js
- Row-Level Security (RLS) policies reference `auth.uid()` and custom JWT claims for tenant isolation

**JWT Custom Claims Example:**

```json
{
  "sub": "user-uuid",
  "email": "admin@stmary.example.org",
  "app_metadata": {
    "diocese_id": "uuid-diocese",
    "parish_id": "uuid-parish",
    "roles": ["parish_admin"]
  }
}
```

---

## 5. Database — Supabase PostgreSQL

**Why:** Managed PostgreSQL with built-in Row-Level Security, real-time subscriptions, and direct integration with Supabase Auth. Eliminates the need to manage a separate database server.

**Key Usage:**

- All application data stored in PostgreSQL
- RLS policies enforce tenant isolation at the database level (defense-in-depth)
- Supabase migrations (`supabase/migrations/`) for schema version control
- Full-text search for member directory queries
- `pg_cron` (available in Supabase) for database-level scheduled jobs if needed

**Schema Strategy:**

- Separate PostgreSQL schemas by domain (e.g., `public`, `membership`, `financials`, `sacraments`, `communications`)
- Every tenant-scoped table includes `diocese_id` and `parish_id` columns
- RLS policies filter all queries to the current user's tenant

---

## 6. File Storage — Vercel Blob

**Why:** Native Vercel integration with no additional infrastructure. Supports presigned upload/download URLs, making it secure and straightforward.

**Key Usage:**

- Member profile photos
- Parish document repository (bulletins, policies, forms)
- Exported reports (PDF, Excel, CSV)
- Uploaded CSV files for member/donation imports

**Path Convention:**

```
/{diocese_id}/{parish_id}/members/{member_id}/photo.jpg
/{diocese_id}/{parish_id}/documents/{filename}
/{diocese_id}/{parish_id}/exports/{report_name}_{date}.pdf
```

---

## 7. Email — Resend (preferred) or SendGrid

**Why:** Resend has native React Email template support, making it straightforward to build and maintain transactional email templates alongside the Next.js codebase. SendGrid is a fallback if Resend doesn't meet volume needs.

**Key Usage:**

- User invite and password reset emails
- Welcome emails for new parishioner registrations
- Event reminders and RSVP confirmations
- Parish and diocese communications (bulk send)
- Annual giving statements (bulk PDF attachment)

---

## 8. SMS — Twilio

**Why:** Industry-standard SMS provider with broad number availability and reliable delivery.

**Key Usage:**

- Opt-in SMS communications from parish to members
- Event reminders
- Urgent notifications (e.g., Mass cancellations)
- Two-way opt-out management (STOP keywords)

---

## 9. Payments — Stripe

**Why:** Best-in-class payment processing with strong nonprofit/church support, recurring billing, and webhooks for event-driven donation recording.

**Key Usage:**

- One-time online donations
- Recurring giving (weekly, monthly, annual)
- Stripe Checkout or Stripe Elements embedded in the member portal
- Stripe webhooks → Next.js API route → creates Donation + LedgerEntry records
- Annual giving statement generation references Stripe payment history

---

## 10. Background Jobs — Vercel Cron + Supabase Edge Functions

**Why:** Vercel Cron Jobs cover scheduled tasks without additional infrastructure. Supabase Edge Functions handle webhook processing and lightweight async tasks.

**Vercel Cron Job Use Cases:**

- Daily: send anniversary reminders, pledge fulfillment reminders
- Weekly: generate weekly bulletin digest
- Monthly: generate and email giving statements

**Supabase Edge Function Use Cases:**

- Auth hooks (inject custom JWT claims)
- Stripe webhook handler
- Twilio status callback handler

**Future upgrade path:** If job complexity grows, adopt [Inngest](https://inngest.com/) (has native Next.js + Vercel support) for durable workflow orchestration.

---

## 11. Audit Logging Stack

**Why:** Audit logging is a core security and compliance requirement for this CMS and must cover user, admin, and system operations.

**Implementation approach:**

- Central audit event utility shared across route handlers, server actions, and background jobs
- PostgreSQL `audit_entries` table in dedicated `audit` schema as system of record
- Correlation/request IDs propagated from middleware through async jobs and webhook handlers
- Redaction utility to remove secrets/tokens before persistence
- Operational monitoring for ingestion failures and lag (alerts routed to ops channels)

**Rules:**

- No sampling for security/audit events
- No production feature path may bypass audit logging
- Audit entries are append-only at the application layer

---

## 12. Local Development Setup

### Recommended workflow

Use local macOS development with npm as the default workflow for faster iteration. Use the VS Code Dev Container when you need reproducible tooling and a bundled PostgreSQL service.

```bash
# Prerequisites
Docker Desktop
VS Code with Dev Containers extension

# Local workflow (default)
node >= 20
npm >= 10

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in any external integration keys or Supabase values when needed.

# Start Next.js dev server
npm run dev

# Optional tooling for later Supabase integration work
Supabase CLI
Vercel CLI

# Optional container workflow
# VS Code command palette -> Dev Containers: Reopen in Container

# The dev container starts a local PostgreSQL 16 service automatically.
# Use the container's DATABASE_URL for app development.
```

---

## 12. Environment Variables

| Variable                             | Description                             |
| ------------------------------------ | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase project URL                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Supabase anonymous/public key           |
| `SUPABASE_SERVICE_ROLE_KEY`          | Supabase service role key (server-only) |
| `STRIPE_SECRET_KEY`                  | Stripe secret key (server-only)         |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key                  |
| `STRIPE_WEBHOOK_SECRET`              | Stripe webhook signing secret           |
| `TWILIO_ACCOUNT_SID`                 | Twilio account SID                      |
| `TWILIO_AUTH_TOKEN`                  | Twilio auth token                       |
| `TWILIO_PHONE_NUMBER`                | Twilio SMS sender number                |
| `RESEND_API_KEY`                     | Resend API key                          |
| `BLOB_READ_WRITE_TOKEN`              | Vercel Blob read/write token            |

---

## 13. Future — Expo Mobile App

A separate **Expo (React Native)** project is planned to complement the web CMS with:

- Offline data sync for parish staff
- Native push notifications
- Mobile-optimized member check-in and attendance tracking
- Barcode/QR code scanning for events

The Expo app will consume the CMS's REST API using the same Supabase Auth tokens. It is a **separate repository and project**, not part of this web application.
