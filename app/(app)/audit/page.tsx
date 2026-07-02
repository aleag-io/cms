import { Role } from '@prisma/client';
import { AuditLogViewer } from '@/components/app/audit-log-viewer';
import { PageHeader } from '@/components/patterns/page-header';
import { requireRole } from '@/lib/auth';

export default async function AuditPage() {
    await requireRole([Role.DIOCESE_ADMIN, Role.DIOCESE_STAFF, Role.PARISH_ADMIN]);

    return (
        <div className="space-y-6 pb-6">
            <PageHeader
                title="Audit Log"
                description="Administrative audit history for the current scope. Diocese users see diocese-scope entries only; parish admins see only their parish."
            />
            <div className="p-4 sm:p-6">
                <AuditLogViewer />
            </div>
        </div>
    );
}