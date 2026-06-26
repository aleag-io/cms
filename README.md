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
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` if you need local overrides.
4. Start the app: `npm run dev`

Use the VS Code Dev Container when you want environment parity across machines or a pre-wired PostgreSQL 16 service.

1. Install Docker Desktop and VS Code.
2. Open the repository in VS Code and choose **Dev Containers: Reopen in Container**.
3. The container runs `npm install` on create and starts `npm run dev` on port 3000.

The container exposes the Next.js dev server on port 3000 and PostgreSQL on port 5432.

## Prisma + Supabase Local In Dev Container

This repository is configured so you can run Prisma and Supabase Local from inside the devcontainer.

1. Rebuild the devcontainer after pulling these changes.
2. Install dependencies if needed: `make install`
3. Generate Prisma client: `make prisma-generate`
4. Initialize Supabase once: `make supabase-init`
5. Start Supabase local stack: `make supabase-start`
6. Check status/keys/URLs: `make supabase-status`

When Supabase Local is running, use this database URL for Prisma:

`DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres?schema=public`

Notes:

1. The devcontainer mounts `/var/run/docker.sock` and includes Docker CLI so Supabase CLI can manage its local services.
2. Supabase ports forwarded by the devcontainer include API `54321`, DB `54322`, Studio `54323`, and Inbucket `54324`.
3. Existing local PostgreSQL service on `5432` is still available if you are not using Supabase Local.

## Key Design Principles

1. **Multi-tenancy** — Diocese is the root tenant; parishes are sub-tenants with data isolation
2. **Hierarchical** — Diocese → Parish → Family → Member
3. **Role-based access** — Fine-grained permissions at every level
4. **Privacy-first** — Sensitive sacramental and personal records are access-controlled
5. **Extensible** — Supports custom programs and organizations at each level
