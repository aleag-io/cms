import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function createPrismaClient() {
  // LOCAL: DATABASE_URL   VERCEL: POSTGRES_URL (pooled, good for serverless)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
