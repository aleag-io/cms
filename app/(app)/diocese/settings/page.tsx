import { Role } from '@prisma/client';
import { DioceseSettingsManager } from '@/components/app/diocese-settings-manager';
import { PageHeader } from '@/components/patterns/page-header';
import { claimsFromUser, requireRole } from '@/lib/auth';
import { withTenant } from '@/lib/db/withTenant';

export default async function DioceseSettingsPage() {
    const actor = await requireRole([
        Role.GLOBAL_ADMIN,
        Role.DIOCESE_ADMIN,
        Role.DIOCESE_STAFF,
    ]);
    const claims = await claimsFromUser(actor);

    const data = await withTenant(claims, async (tx) => {
        const [diocese, parishes] = await Promise.all([
            tx.diocese.findFirstOrThrow({ where: { id: actor.dioceseId } }),
            tx.parish.findMany({
                where: { dioceseId: actor.dioceseId },
                select: { isActive: true },
            }),
        ]);

        return {
            diocese,
            stats: {
                parishes: parishes.length,
                activeParishes: parishes.filter((parish) => parish.isActive).length,
            },
        };
    });

    return (
        <div className="space-y-6 pb-6">
            <PageHeader
                title="Diocese Settings"
                description="Structural diocese profile and lifecycle settings. This page never renders parish member or family rows."
            />
            <div className="p-4 sm:p-6">
                <DioceseSettingsManager
                    initialDiocese={data.diocese}
                    stats={data.stats}
                    canEdit={actor.role === Role.GLOBAL_ADMIN || actor.role === Role.DIOCESE_ADMIN}
                />
            </div>
        </div>
    );
}