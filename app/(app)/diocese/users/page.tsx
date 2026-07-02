import { Role } from '@prisma/client';
import { DioceseUserManager } from '@/components/app/diocese-user-manager';
import { PageHeader } from '@/components/patterns/page-header';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';

export default async function DioceseUsersPage() {
    const actor = await requireRole([Role.GLOBAL_ADMIN, Role.DIOCESE_ADMIN]);
    const claims = await claimsFromUser(actor);

    const [users, parishes] = await withTenant(claims, async (tx) =>
        Promise.all([
            tx.appUser.findMany({
                where: { dioceseId: actor.dioceseId },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                    role: true,
                    parishId: true,
                    isActive: true,
                    createdAt: true,
                    parish: { select: { name: true } },
                },
                orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
            }),
            tx.parish.findMany({
                where: { dioceseId: actor.dioceseId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
        ]),
    );

    return (
        <div className="space-y-6 pb-6">
            <PageHeader
                title="Diocese Users"
                description="Assign Diocese Staff, Diocese Report Viewer, and Parish Admin roles without exposing raw parish records."
            />
            <div className="p-4 sm:p-6">
                <DioceseUserManager initialUsers={users} parishes={parishes} />
            </div>
        </div>
    );
}