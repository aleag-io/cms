/**
 * Resolve a Postgres URL for migrate / SQL apply CLIs.
 *
 * Priority:
 *   1. DATABASE_URL (local + explicit override)
 *   2. POSTGRES_URL_NON_POOLING (Vercel/Supabase direct — preferred for DDL)
 *   3. POSTGRES_URL (pooler; last resort)
 *   4. Values loaded from .env.local when not already set
 */
const fs = require('fs');

function loadEnvLocal() {
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // no .env.local
  }
}

function resolveDatabaseUrl() {
  loadEnvLocal();
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    null
  );
}

module.exports = { loadEnvLocal, resolveDatabaseUrl };
