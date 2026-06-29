import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionClaims } from '@/lib/auth';

/**
 * Run all Prisma queries in fn as the app_authenticated role with the
 * caller's JWT claims set in the request.jwt.claims GUC.
 *
 * Both SET LOCAL ROLE and set_config(..., true) are transaction-local:
 * they reset automatically at COMMIT, so connection-pool reuse is safe.
 *
 * Use this for every user-facing read/write so RLS policies fire.
 * Keep the bare `prisma` client for admin-only paths (provisioning,
 * audit writes) where privileged access is intentional and audited.
 */
export async function withTenant<T>(
  claims: SessionClaims,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify(claims);

  return prisma.$transaction(async (tx) => {
    // Drop to the restricted role — no BYPASSRLS — for this transaction.
    await tx.$executeRawUnsafe('SET LOCAL ROLE app_authenticated');
    // Populate auth.jwt() with the caller's claims.
    await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`;
    return fn(tx);
  });
}
