import { defineConfig } from 'prisma/config';
import { readFileSync } from 'node:fs';

// Prisma 7: connection URL for Migrate CLI lives here.
// Runtime connection is handled by the PrismaPg adapter in lib/prisma.ts.

// The Prisma CLI does not auto-load .env.local (only .env), and local
// secrets live in .env.local — load it here so `prisma migrate/studio/generate`
// work from a fresh shell without requiring `source .env.local` first. CI sets
// DATABASE_URL directly, so this is a no-op there.
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // .env.local not present — fall through to POSTGRES_URL_NON_POOLING below.
  }
}

export default defineConfig({
  datasource: {
    // LOCAL: DATABASE_URL   VERCEL: POSTGRES_URL_NON_POOLING (direct, required for migrations)
    url: (process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING)!,
  },
});
