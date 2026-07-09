import { prisma } from '@/lib/prisma';
import type { ContextualShare } from '@prisma/client';

/**
 * Atomically consume one view of a share if it is still accessible.
 * Concurrent / double GETs cannot exceed maxViews (Strict Mode, races).
 * Returns the post-increment row, or null if the share cannot be viewed.
 */
export async function tryConsumeShareView(
  shareId: string,
): Promise<ContextualShare | null> {
  const rows = await prisma.$queryRaw<ContextualShare[]>`
    UPDATE "ContextualShare"
    SET "viewCount" = "viewCount" + 1
    WHERE id = ${shareId}::uuid
      AND "isActive" = true
      AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      AND ("maxViews" IS NULL OR "viewCount" < "maxViews")
    RETURNING *
  `;
  return rows[0] ?? null;
}
