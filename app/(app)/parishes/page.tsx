import { Role } from '@prisma/client';
import { ParishManager } from '@/components/app/parish-manager';
import { PageHeader } from '@/components/patterns/page-header';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';

export default async function ParishesPage() {
    const actor = await requireRole([
        Role.GLOBAL_ADMIN,
        Role.DIOCESE_ADMIN,
        Role.DIOCESE_STAFF,
    ]);
    const claims = await claimsFromUser(actor);

    const parishes = await withTenant(claims, (tx) =>
        tx.parish.findMany({
            where: { dioceseId: actor.dioceseId },
            orderBy: { name: 'asc' },
        }),
    );

    return (
        <div className="space-y-6 pb-6">
            <PageHeader
                title="Parishes"
                description="Tier-1 structural parish administration for the current diocese. Parish creation, configuration, and deactivation are audited."
            />
            <div className="p-4 sm:p-6">
                <ParishManager
                    initialParishes={parishes}
                    canManage={actor.role === Role.GLOBAL_ADMIN || actor.role === Role.DIOCESE_ADMIN}
                />
            </div>
        </div>
    );
}