# Mar Thoma Church Management System (CMS)

A **multi-tenant church management platform** designed for the **Diocese of North America** of the **Mar Thoma Church** — from diocesan-level administration down to individual parish families and members.

## Purpose

The CMS provides a unified system for managing:

- **Diocese-wide** programs, organizations, events, and reporting
- **Parish (Church)** administration, membership, and ministry management
- **Family** records, household tracking, and contact management
- **Individual Members** — sacramental history, roles, and engagement

## Documentation

| Document                                                | Description                                        |
| ------------------------------------------------------- | -------------------------------------------------- |
| [Requirements](docs/requirements.md)                    | Functional and non-functional requirements         |
| [Architecture](docs/architecture.md)                    | System architecture and multi-tenancy design       |
| [Tech Stack](docs/tech-stack.md)                        | Confirmed technology choices and setup             |
| [Data Model](docs/data-model.md)                        | Entity relationships and data model                |
| [User Roles & Permissions](docs/user-roles.md)          | Role-based access control                          |
| [Access Control & Data Sharing](docs/access-control.md) | Parish data sovereignty and granular sharing model |
| [Features](docs/features.md)                            | Detailed feature descriptions                      |
| [Glossary](docs/glossary.md)                            | Domain terminology                                 |

## Project Status

> 📋 **Documentation & Design Phase** — requirements, architecture, and design are being refined before implementation begins.

## Development Environment

The recommended workflow is to run locally on macOS with npm for the fastest feedback loop.

1. Install Node.js 24.x LTS and npm 10.x or newer.
2. Install Docker Desktop (required for Supabase local services).
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env.local` if you need local overrides.
5. Start the app: `npm run dev`

## Prisma + Supabase Local

Use these commands from your local macOS terminal at the repo root.

1. Install dependencies if needed: `make install`
2. Generate Prisma client: `make prisma-generate`
3. Initialize Supabase once: `make supabase-init`
4. Start Supabase local stack: `make supabase-start`
5. Check status/keys/URLs: `make supabase-status`

When Supabase Local is running, use this database URL for Prisma:

`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=public`

Notes:

1. Supabase local uses Docker containers on your machine.
2. Supabase ports include API `54321`, DB `54322`, Studio `54323`, and Inbucket `54324`.
3. Existing local PostgreSQL service on `5432` is still available if you are not using Supabase Local.

## Key Design Principles

1. **Multi-tenancy** — Diocese is the root tenant; parishes are sub-tenants with data isolation
2. **Hierarchical** — Diocese → Parish → Family → Member
3. **Role-based access** — Fine-grained permissions at every level
4. **Privacy-first** — Sensitive sacramental and personal records are access-controlled
5. **Extensible** — Supports custom programs and organizations at each level
