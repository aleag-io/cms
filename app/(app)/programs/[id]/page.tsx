"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { DataTable } from "@/components/patterns/data-table";
import { apiRequest, isApiClientError } from "@/lib/api-client";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/patterns/states";
import {
  attendanceRecordsPayload,
  buildAttendanceGrid,
  setAttendanceStatus,
  type AttendanceGridRow,
  type AttendanceStatusValue,
} from "@/lib/programs/attendance-grid";

type Program = {
  id: string;
  name: string;
  programType: string;
  description: string | null;
};

type Enrollment = {
  id: string;
  memberId: string;
  role: string;
  status: string;
  member: { id: string; firstName: string; lastName: string };
};

type Session = {
  id: string;
  title: string;
  scheduledAt: string;
  location: string | null;
};

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function ProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const programId = params.id;

  const [program, setProgram] = useState<Program | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [enrollMemberId, setEnrollMemberId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionAt, setSessionAt] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [grid, setGrid] = useState<AttendanceGridRow[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [programsRes, enrollRes, sessionsRes, membersRes] =
        await Promise.all([
          apiRequest<{ ok: true; programs: Program[] }>("/api/programs"),
          apiRequest<{ ok: true; enrollments: Enrollment[] }>(
            `/api/programs/${programId}/enrollments`,
          ),
          apiRequest<{ ok: true; sessions: Session[] }>(
            `/api/programs/${programId}/sessions`,
          ),
          apiRequest<{ ok: true; members: MemberOption[] }>("/api/members"),
        ]);

      const found =
        programsRes.programs.find((p) => p.id === programId) ?? null;
      if (!found) {
        setError("Program not found or not visible for your role.");
        setProgram(null);
      } else {
        setProgram(found);
      }
      setEnrollments(enrollRes.enrollments);
      setSessions(sessionsRes.sessions);
      setMembers(
        membersRes.members.map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
        })),
      );
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load program",
      );
    } finally {
      setBusy(false);
    }
  }, [programId]);

  useEffect(() => {
    // Defer so load()'s setState is not treated as sync set-state-in-effect.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function enrollMember() {
    if (!enrollMemberId) return;
    try {
      await apiRequest(`/api/programs/${programId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ memberId: enrollMemberId }),
      });
      toast.success("Member enrolled");
      setEnrollMemberId("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Enroll failed",
      );
    }
  }

  async function createSession() {
    if (!sessionTitle.trim() || !sessionAt) return;
    try {
      await apiRequest(`/api/programs/${programId}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          title: sessionTitle,
          scheduledAt: new Date(sessionAt).toISOString(),
        }),
      });
      toast.success("Session created");
      setSessionTitle("");
      setSessionAt("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Session create failed",
      );
    }
  }

  async function openAttendance(sessionId: string) {
    setActiveSessionId(sessionId);
    try {
      const res = await apiRequest<{
        ok: true;
        attendance: Array<{ memberId: string; status: AttendanceStatusValue }>;
      }>(`/api/programs/${programId}/sessions/${sessionId}/attendance`);
      setGrid(
        buildAttendanceGrid({
          enrollments,
          attendance: res.attendance,
        }),
      );
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load attendance",
      );
    }
  }

  async function saveAttendance() {
    if (!activeSessionId) return;
    setSavingAttendance(true);
    try {
      await apiRequest(
        `/api/programs/${programId}/sessions/${activeSessionId}/attendance`,
        {
          method: "POST",
          body: JSON.stringify({
            records: attendanceRecordsPayload(grid),
          }),
        },
      );
      toast.success("Attendance saved");
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed",
      );
    } finally {
      setSavingAttendance(false);
    }
  }

  const enrolledIds = useMemo(
    () => new Set(enrollments.map((e) => e.memberId)),
    [enrollments],
  );
  const enrollable = members.filter((m) => !enrolledIds.has(m.id));

  if (busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Program" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Program" description="Could not load program." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error ?? "Not found"} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={program.name}
        description={`${program.programType.replaceAll("_", " ")}${
          program.description ? ` · ${program.description}` : ""
        }`}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <Card data-testid="program-enrollments">
          <CardHeader>
            <CardTitle className="text-base">Enrollments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="enroll-member">Add member</Label>
                <Select value={enrollMemberId} onValueChange={setEnrollMemberId}>
                  <SelectTrigger id="enroll-member">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrollable.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.lastName}, {m.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => void enrollMember()}
                disabled={!enrollMemberId}
              >
                Enroll
              </Button>
            </div>
            <DataTable
              rows={enrollments}
              columns={[
                {
                  key: "name",
                  header: "Member",
                  cell: (row) =>
                    `${row.member.lastName}, ${row.member.firstName}`,
                },
                {
                  key: "role",
                  header: "Role",
                  cell: (row) => row.role,
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) => <Badge variant="secondary">{row.status}</Badge>,
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No enrollments"
                  description="Enroll members to build the roster."
                />
              }
            />
          </CardContent>
        </Card>

        <Card data-testid="program-sessions">
          <CardHeader>
            <CardTitle className="text-base">Sessions & attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="session-title">Session title</Label>
                <Input
                  id="session-title"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-at">Scheduled at</Label>
                <Input
                  id="session-at"
                  type="datetime-local"
                  value={sessionAt}
                  onChange={(e) => setSessionAt(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void createSession()}
                disabled={!sessionTitle.trim() || !sessionAt}
              >
                Add session
              </Button>
            </div>

            <DataTable
              rows={sessions}
              columns={[
                {
                  key: "title",
                  header: "Title",
                  cell: (row) => row.title,
                },
                {
                  key: "scheduledAt",
                  header: "When",
                  cell: (row) =>
                    new Date(row.scheduledAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                },
                {
                  key: "actions",
                  header: "Attendance",
                  cell: (row) => (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void openAttendance(row.id)}
                    >
                      {activeSessionId === row.id ? "Selected" : "Mark"}
                    </Button>
                  ),
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No sessions"
                  description="Create a session to record attendance."
                />
              }
            />

            {activeSessionId ? (
              <div
                className="space-y-3 rounded-md border p-4"
                data-testid="attendance-grid"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Attendance grid</h3>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveAttendance()}
                    disabled={savingAttendance}
                  >
                    {savingAttendance ? "Saving…" : "Save attendance"}
                  </Button>
                </div>
                <DataTable
                  rows={grid}
                  columns={[
                    {
                      key: "name",
                      header: "Member",
                      cell: (row) => `${row.lastName}, ${row.firstName}`,
                    },
                    {
                      key: "status",
                      header: "Status",
                      cell: (row) => (
                        <Select
                          value={row.status ?? "unset"}
                          onValueChange={(value) => {
                            if (value === "unset") return;
                            setGrid((prev) =>
                              setAttendanceStatus(
                                prev,
                                row.memberId,
                                value as AttendanceStatusValue,
                              ),
                            );
                          }}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">Unset</SelectItem>
                            <SelectItem value="PRESENT">Present</SelectItem>
                            <SelectItem value="ABSENT">Absent</SelectItem>
                            <SelectItem value="EXCUSED">Excused</SelectItem>
                          </SelectContent>
                        </Select>
                      ),
                    },
                  ]}
                  getRowKey={(row) => row.memberId}
                  empty={
                    <EmptyState
                      title="No roster"
                      description="Enroll members before marking attendance."
                    />
                  }
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
