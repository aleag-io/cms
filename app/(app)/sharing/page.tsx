"use client";

import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SharingPage() {
    return (
        <div className="flex min-h-full flex-col">
            <PageHeader
                title="Data sharing"
                description="Governed data-sharing requests, grants, and emergency access."
            />
            <div className="flex-1 p-4 sm:p-6">
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle>Sharing workflows</CardTitle>
                        <CardDescription>
                            This surface will host request/approval flows for parish-to-parish
                            and diocese-to-parish data sharing, active grants, and emergency
                            access invocation. The underlying sharing APIs are already
                            RLS-guarded and ready to be wired into the UI in the next release.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            For now, sharing operations continue to be available through the
                            secured API endpoints documented in the OpenAPI spec.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
