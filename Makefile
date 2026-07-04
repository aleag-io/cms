SHELL := /bin/bash

NPM ?= npm
HOST ?= 0.0.0.0
PORT ?= 3000

.DEFAULT_GOAL := help

.PHONY: help install dev build start lint prisma-generate prisma-migrate prisma-studio db-seed db-reset db-migrate supabase supabase-init supabase-start supabase-stop supabase-status supabase-reset init

help:
	@echo "Available targets:"
	@echo "  make install                Install dependencies"
	@echo "  make dev                    Start Next.js dev server"
	@echo "  make build                  Build production bundle"
	@echo "  make start                  Start production server"
	@echo "  make lint                   Run ESLint"
	@echo "  make prisma-generate        Generate Prisma client"
	@echo "  make prisma-migrate         Run Prisma dev migration"
	@echo "  make prisma-studio          Open Prisma Studio"
	@echo "  make db-seed                Run npm script db:seed (when added)"
	@echo "  make db-reset               Run npm script db:reset (when added)"
	@echo "  make db-migrate             Run npm script db:migrate (when added)"
	@echo "  make db-rebuild             Run Prisma deploy + Supabase SQL migrations"
	@echo "  make supabase-init          Initialize Supabase local config"
	@echo "  make supabase-start         Start Supabase local stack"
	@echo "  make supabase-stop          Stop Supabase local stack"
	@echo "  make supabase-status        Show Supabase local status"
	@echo "  make supabase-reset         Reset Supabase local database"
	@echo ""
	@echo "Optional variables: HOST=$(HOST) PORT=$(PORT)"

install:
	$(NPM) install

dev:
	$(NPM) run dev -- --hostname $(HOST) --port $(PORT)

build:
	$(NPM) run build

start:
	$(NPM) run start

lint:
	$(NPM) run lint

prisma-generate:
	$(NPM) run prisma:generate

prisma-migrate:
	$(NPM) run prisma:migrate:dev

prisma-studio:
	$(NPM) run prisma:studio

db-seed:
	@if $(NPM) run | grep -q "  db:seed"; then \
		$(NPM) run db:seed; \
	else \
		echo "No db:seed script found in package.json yet."; \
		echo "Add one and this target will work without changing the Makefile."; \
	fi

db-reset:
	@if $(NPM) run | grep -q "  db:reset"; then \
		$(NPM) run db:reset; \
	else \
		echo "No db:reset script found in package.json yet."; \
		echo "Add one and this target will work without changing the Makefile."; \
	fi

db-migrate:
	@if $(NPM) run | grep -q "  db:migrate"; then \
		$(NPM) run db:migrate; \
	else \
		echo "No db:migrate script found in package.json yet."; \
		echo "Add one and this target will work without changing the Makefile."; \
	fi

db-rebuild:
	@if $(NPM) run | grep -q "  db:rebuild"; then \
		$(NPM) run db:rebuild; \
	else \
		echo "No db:rebuild script found in package.json yet."; \
		echo "Add one and this target will work without changing the Makefile."; \
	fi

supabase:
	@echo "Supabase commands:" \
	&& echo "  make supabase-init" \
	&& echo "  make supabase-start" \
	&& echo "  make supabase-stop" \
	&& echo "  make supabase-status" \
	&& echo "  make supabase-reset"

init: supabase-init

supabase-init:
	$(NPM) run supabase:init

supabase-start:
	$(NPM) run supabase:start

supabase-stop:
	$(NPM) run supabase:stop

supabase-status:
	$(NPM) run supabase:status

supabase-reset:
	$(NPM) run supabase:reset

# ─── RLS / SQL policy targets ─────────────────────────────────────────────────

.PHONY: db-apply-rls db-apply-ci-shims test-rls

db-apply-ci-shims:
	@echo "Applying CI auth shims (plain Postgres only — skip on Supabase)"
	$(NPM) run db:apply-ci-shims

db-apply-rls:
	@echo "Applying Supabase SQL migrations (role, RLS, audit trigger, claims hook)"
	@echo "Uses local supabase_admin via docker when Supabase local is running"
	$(NPM) run db:apply-rls

test-rls:
	@echo "Running RLS cross-tenant exit-gate suite"
	$(NPM) run test:rls
