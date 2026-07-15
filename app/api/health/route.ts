import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseUrl } from '@/lib/supabase/env';

// Public, unauthenticated diagnostic. Reports which Supabase project the running
// deployment is actually wired to (auth vs. database), so prod/preview/branch
// mismatches are visible at a glance. Exposes only project refs (already public
// via NEXT_PUBLIC_SUPABASE_URL) and connectivity — never keys or passwords.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function refFromSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\./i);
  return match ? match[1] : null;
}

function refFromPostgres(conn: string | undefined): string | null {
  if (!conn) return null;
  // Pooler: postgres://postgres.<ref>:<pw>@aws-...pooler.supabase.com:6543/postgres
  const pooler = conn.match(/postgres\.([a-z0-9]+)/i);
  if (pooler) return pooler[1];
  // Direct: postgres://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
  const direct = conn.match(/@db\.([a-z0-9]+)\.supabase/i);
  return direct ? direct[1] : null;
}

export async function GET() {
  const authRef = refFromSupabaseUrl(supabaseUrl());
  const dbRef = refFromPostgres(
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  );

  const started = Date.now();
  let db: {
    connected: boolean;
    database?: string;
    appUsers?: number;
    latencyMs: number;
    error?: string;
  };
  try {
    const rows = await prisma.$queryRaw<
      { current_database: string; app_users: bigint }[]
    >`select current_database(),
             (select count(*) from "AppUser") as app_users`;
    db = {
      connected: true,
      database: rows[0]?.current_database,
      appUsers: Number(rows[0]?.app_users ?? 0),
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    db = {
      connected: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'query failed',
    };
  }

  const body = {
    ok: db.connected,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    auth: { supabaseProjectRef: authRef },
    db: { projectRef: dbRef, ...db },
    // True only when auth and database point at the same project — a mismatch
    // (e.g. auth=prod, db=preview) is exactly the class of bug this surfaces.
    consistent: authRef !== null && authRef === dbRef,
  };

  return NextResponse.json(body, {
    status: db.connected ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
