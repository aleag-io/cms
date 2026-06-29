import { defineConfig } from 'prisma/config';

// Prisma 7: connection URL for Migrate CLI lives here.
// Runtime connection is handled by the PrismaPg adapter in lib/prisma.ts.
export default defineConfig({
  datasource: {
    // LOCAL: DATABASE_URL   VERCEL: POSTGRES_URL_NON_POOLING (direct, required for migrations)
    url: (process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING)!,
  },
});
