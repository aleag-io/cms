#!/usr/bin/env bash
# Reseed the disposable preview Supabase branch with the dense demo profile.
#
# Requires (from vercel env / Supabase branch credentials — never production):
#   DATABASE_URL                  — preview Postgres connection string
#   NEXT_PUBLIC_SUPABASE_URL      — preview API URL (or *_OVERRIDE)
#   SUPABASE_SERVICE_ROLE_KEY     — preview service role (or *_OVERRIDE)
#
# Safety:
#   - Sets SEED_ALLOW_REMOTE=1 and SEED_PROFILE=demo
#   - prisma/seed.ts refuses the production project ref even with the flag
#   - This TRUNCATEs all tenant data on the target database
#
# Usage:
#   export DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
#   npm run db:seed:preview
#
# Or after pulling preview env into a file:
#   set -a && source .env.preview && set +a && npm run db:seed:preview

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Prefer override names used by Vercel Preview wiring
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL_OVERRIDE:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY_OVERRIDE:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_URL_NON_POOLING:-${POSTGRES_URL:-}}}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "error: DATABASE_URL (or POSTGRES_URL_NON_POOLING) must be set to the preview DB" >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL}" || -z "${SUPABASE_SERVICE_ROLE_KEY}" ]]; then
  echo "error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required to provision Auth logins" >&2
  exit 1
fi

# Hard refuse known production project ref in URL or Supabase host
if [[ "${DATABASE_URL}" == *nehywddvywocalnhuqig* ]] || \
   [[ "${NEXT_PUBLIC_SUPABASE_URL}" == *nehywddvywocalnhuqig* ]]; then
  echo "error: refusing production Supabase project nehywddvywocalnhuqig" >&2
  exit 1
fi

echo "→ Seeding preview with SEED_PROFILE=demo (TRUNCATE + rebuild)"
echo "  DATABASE host: $(node -e "try{console.log(new URL(process.env.DATABASE_URL).hostname)}catch{console.log('(unparsed)')}")"
echo "  Supabase URL:  ${NEXT_PUBLIC_SUPABASE_URL}"

export SEED_PROFILE=demo
export SEED_ALLOW_REMOTE=1

exec npx tsx prisma/seed.ts "$@"
