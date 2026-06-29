import { randomUUID } from 'node:crypto';
import { AuditOutcome, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditEntry } from '@/lib/audit';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const BOOTSTRAP_EMAIL = 'admin@cms.local';
const BOOTSTRAP_PASSWORD = 'Admin@Local1';

export async function POST() {
  const requestId = randomUUID();

  const existingDiocese = await prisma.diocese.findFirst();

  if (existingDiocese) {
    return Response.json({
      ok: true,
      message: 'Bootstrap already completed — log in with admin@cms.local',
    });
  }

  const admin = createSupabaseAdminClient();

  // Create the Supabase auth user first to obtain the stable UID.
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
      email_confirm: true,
    });

  if (authError ?? !authData.user) {
    return Response.json(
      { ok: false, error: authError?.message ?? 'Failed to create auth user' },
      { status: 500 },
    );
  }

  const authUserId = authData.user.id;

  const diocese = await prisma.diocese.create({
    data: { name: 'Diocese of North America' },
  });

  const parish = await prisma.parish.create({
    data: {
      dioceseId: diocese.id,
      name: 'St. Thomas Mar Thoma Parish',
      address: 'Dallas, TX',
    },
  });

  await prisma.appUser.create({
    data: {
      id: authUserId,
      email: BOOTSTRAP_EMAIL,
      displayName: 'Diocese Admin',
      role: Role.DIOCESE_ADMIN,
      dioceseId: diocese.id,
      parishId: parish.id,
    },
  });

  await writeAuditEntry({
    requestId,
    actorType: 'SYSTEM',
    actorLabel: 'bootstrap',
    action: 'bootstrap.initialize',
    entityType: 'diocese',
    entityId: diocese.id,
    outcome: AuditOutcome.SUCCESS,
    dioceseId: diocese.id,
    parishId: parish.id,
    metadata: { adminEmail: BOOTSTRAP_EMAIL },
  });

  return Response.json({
    ok: true,
    message: 'Bootstrap complete! Sign in with the credentials below.',
    credentials: {
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
    },
  });
}
