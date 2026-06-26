SHELL := /bin/bash

NPM ?= npm
HOST ?= 0.0.0.0
PORT ?= 3000

.DEFAULT_GOAL := help

.PHONY: help install dev build start lint db-seed db-reset db-migrate

help:
	@echo "Available targets:"
	@echo "  make install                Install dependencies"
	@echo "  make dev                    Start Next.js dev server"
	@echo "  make build                  Build production bundle"
	@echo "  make start                  Start production server"
	@echo "  make lint                   Run ESLint"
	@echo "  make db-seed                Run npm script db:seed (when added)"
	@echo "  make db-reset               Run npm script db:reset (when added)"
	@echo "  make db-migrate             Run npm script db:migrate (when added)"
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
