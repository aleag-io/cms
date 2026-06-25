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

## Key Design Principles

1. **Multi-tenancy** — Diocese is the root tenant; parishes are sub-tenants with data isolation
2. **Hierarchical** — Diocese → Parish → Family → Member
3. **Role-based access** — Fine-grained permissions at every level
4. **Privacy-first** — Sensitive sacramental and personal records are access-controlled
5. **Extensible** — Supports custom programs and organizations at each level
