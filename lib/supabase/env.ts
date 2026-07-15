// Resolve Supabase connection settings, preferring an *_OVERRIDE variable when
// one is set. This lets a specific deployment environment (e.g. the persistent
// `preview` branch) point at a different Supabase project than the one the
// Vercel↔Supabase integration injects.
//
// Why this exists: the integration owns `NEXT_PUBLIC_SUPABASE_URL`,
// `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, etc. as "All Environments"
// variables that take top precedence and cannot be scoped per Git branch, so a
// per-branch override of those names has no effect. It does NOT touch these
// `*_OVERRIDE` names, so a branch-scoped override here is applied cleanly. The
// `NEXT_PUBLIC_*` overrides are inlined into the client bundle at build time,
// exactly like their base counterparts.
//
// The database URL uses the same idea without an override name of its own: the
// app already reads `DATABASE_URL ?? POSTGRES_URL` (see lib/prisma.ts), and the
// integration only sets `POSTGRES_URL`, so a branch-scoped `DATABASE_URL` wins.

export function supabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL_OVERRIDE ??
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function supabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_OVERRIDE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function supabaseServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY_OVERRIDE ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
