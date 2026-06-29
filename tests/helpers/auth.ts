/**
 * Auth helpers for integration tests.
 *
 * Usage:
 *   import { asUser } from '../helpers/auth';
 *   import { FX, testDb } from '../helpers/db';
 *
 *   let resetAuth: () => void;
 *   beforeEach(async () => {
 *     const user = await testDb.appUser.findUniqueOrThrow({ where: { id: FX.users.parishAAdmin.id } });
 *     resetAuth = asUser(user);
 *   });
 *   afterEach(() => resetAuth());
 */

import type { AppUser } from '@prisma/client';
import { _setSessionResolver } from '@/lib/auth';

/** Inject a fixed user as the current session. Returns a reset function. */
export function asUser(user: AppUser): () => void {
  return _setSessionResolver(async () => user);
}

/** Inject "no session" (unauthenticated). Returns a reset function. */
export function asGuest(): () => void {
  return _setSessionResolver(async () => null);
}
