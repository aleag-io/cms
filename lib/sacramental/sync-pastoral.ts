import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

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
}
