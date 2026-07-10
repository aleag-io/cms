import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';

type Tx = Prisma.TransactionClient;

/**
 * RLS-denied writes and unique violations against an RLS-invisible row both
 * mean the actor lacks member_pastoral_data access (relevant for parish staff
 * enabled for the register via a member_sacramental_record override only).
 */
function isPastoralAccessError(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return true;
  }
  return err instanceof Error && /row-level security/i.test(err.message);
}

/**
 * Dual-write helper: when active baptism/confirmation register rows exist,
 * keep MemberPastoralData summary dates aligned with the latest active record.
 * Does not clear pastoral dates when no register row remains (manual dates stay).
 */
export async function syncPastoralDatesFromRegister(
  tx: Tx,
  memberId: string,
  parishId: string,
): Promise<void> {
  const [latestBaptism, latestConfirm] = await Promise.all([
    tx.sacramentalRecord.findFirst({
      where: { memberId, sacramentType: 'BAPTISM', isActive: true },
      orderBy: { occurredOn: 'desc' },
      select: { occurredOn: true },
    }),
    tx.sacramentalRecord.findFirst({
      where: { memberId, sacramentType: 'CONFIRMATION', isActive: true },
      orderBy: { occurredOn: 'desc' },
      select: { occurredOn: true },
    }),
  ]);

  const existing = await tx.memberPastoralData.findUnique({
    where: { memberId },
  });

  try {
    if (!existing) {
      if (!latestBaptism && !latestConfirm) return;
      await tx.memberPastoralData.create({
        data: {
          memberId,
          parishId,
          baptismDate: latestBaptism?.occurredOn ?? null,
          chrismationDate: latestConfirm?.occurredOn ?? null,
        },
      });
      return;
    }

    await tx.memberPastoralData.update({
      where: { memberId },
      data: {
        ...(latestBaptism ? { baptismDate: latestBaptism.occurredOn } : {}),
        ...(latestConfirm ? { chrismationDate: latestConfirm.occurredOn } : {}),
      },
    });
  } catch (err) {
    if (isPastoralAccessError(err)) {
      throw new ApiError(
        403,
        'Baptism/confirmation records dual-write summary dates — this also requires member_pastoral_data read + write permission',
      );
    }
    throw err;
  }
}
