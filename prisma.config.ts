import { defineConfig } from 'prisma/config';

// Prisma 7: connection URL for Migrate CLI lives here.
// Runtime connection is handled by the PrismaPg adapter in lib/prisma.ts.
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
