import { randomUUID } from 'node:crypto';
import { AuditOutcome } from '@prisma/client';
import { clearSessionUser, getSessionUser, setSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return Response.json({ ok: false, user: null }, { status: 401 });
  }

  return Response.json({ ok: true, user });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return Response.json(
      { ok: false, error: 'Email is required' },
      { status: 400 },
    );
  }

  const user = await prisma.appUser.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    await writeAuditEntry({
      requestId,
      actorLabel: email,
      action: 'auth.login',
      entityType: 'user',
      outcome: AuditOutcome.DENIED,
    });

    return Response.json({ ok: false, error: 'Invalid user' }, { status: 401 });
  }

  await setSessionUser(user.id);

  await writeAuditEntry({
    requestId,
    actorUserId: user.id,
    actorLabel: user.email,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    outcome: AuditOutcome.SUCCESS,
    dioceseId: user.dioceseId,
    parishId: user.parishId,
  });

  return Response.json({ ok: true, user });
}

export async function DELETE() {
  await clearSessionUser();
  return Response.json({ ok: true });
}
