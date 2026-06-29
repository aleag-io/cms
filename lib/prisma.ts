import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function createPrismaClient() {
  // LOCAL: DATABASE_URL (no SSL)   VERCEL: POSTGRES_URL (pooled, SSL required)
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL!;
  // pg v9 treats sslmode=require as verify-full; Supabase pooler cert chain is not
  // trusted by Node.js by default, so we disable host verification when SSL is in use.
  const ssl = connectionString.includes('sslmode=') ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString, ssl });
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
