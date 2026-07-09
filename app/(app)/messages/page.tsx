"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type MessageRow = {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  audienceType: string;
  status: string;
  createdAt: string;
  _count: { recipients: number };
  statusCounts: Record<string, number>;
};

type Template = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
};

type Program = { id: string; name: string };
type Organization = { id: string; name: string };

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [channel, setChannel] = useState("EMAIL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState("ALL_MEMBERS");
  const [audienceRefId, setAudienceRefId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [msgRes, tplRes, progRes, orgRes] = await Promise.all([
        apiRequest<{ ok: true; messages: MessageRow[] }>("/api/messages"),
        apiRequest<{ ok: true; templates: Template[] }>(
          "/api/message-templates",
        ),
        apiRequest<{ ok: true; programs: Program[] }>("/api/programs"),
        apiRequest<{ ok: true; organizations: Organization[] }>(
          "/api/organizations",
        ),
      ]);
      setMessages(msgRes.messages);
      setTemplates(tplRes.templates);
      setPrograms(progRes.programs);
      setOrganizations(orgRes.organizations);
    } catch (err) {
      setError(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load messages",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setChannel(tpl.channel);
    setSubject(tpl.subject ?? "");
    setBody(tpl.body);
  }

  async function sendMessage() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest<{
        ok: true;
        message: { id: string; status: string };
        queued: number;
      }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channel,
          subject: subject || null,
          body,
          audienceType,
          audienceRefId:
            audienceType === "PROGRAM" || audienceType === "ORGANIZATION"
              ? audienceRefId
              : null,
        }),
      });
      toast.success(
        res.queued > 0
          ? `Message queued for ${res.queued} recipient(s)`
          : "Message recorded (no recipients after opt-out)",
      );
      setSubject("");
      setBody("");
      setTemplateId("");
      await load();
    } catch (err) {
      toast.error(
        isApiClientError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Send failed",
      );
    } finally {
      setSending(false);
    }
  }

  if (busy) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Messages" description="Loading…" />
        <PageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Messages" description="Could not load." />
        <div className="flex-1 p-4 sm:p-6">
          <ErrorState title="Load failed" description={error} />
        </div>
      </div>
    );
  }

  const audienceNeedsRef =
    audienceType === "PROGRAM" || audienceType === "ORGANIZATION";

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Communications"
        description="Compose email/SMS; opt-outs are enforced server-side. Delivery status updates via the worker."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <Card data-testid="message-composer">
          <CardHeader>
            <CardTitle className="text-base">Compose message</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template">Template (optional)</Label>
              <Select
                value={templateId || "none"}
                onValueChange={(v) => {
                  if (v === "none") {
                    setTemplateId("");
                    return;
                  }
                  applyTemplate(v);
                }}
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audienceType">Audience</Label>
              <Select
                value={audienceType}
                onValueChange={(v) => {
                  setAudienceType(v);
                  setAudienceRefId("");
                }}
              >
                <SelectTrigger id="audienceType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_MEMBERS">All members</SelectItem>
                  <SelectItem value="PROGRAM">Program</SelectItem>
                  <SelectItem value="ORGANIZATION">Organization</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audienceNeedsRef ? (
              <div className="space-y-2">
                <Label htmlFor="audienceRef">
                  {audienceType === "PROGRAM" ? "Program" : "Organization"}
                </Label>
                <Select value={audienceRefId} onValueChange={setAudienceRefId}>
                  <SelectTrigger id="audienceRef">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(audienceType === "PROGRAM" ? programs : organizations).map(
                      (item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div />
            )}
            {channel === "EMAIL" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                onClick={() => void sendMessage()}
                disabled={
                  sending ||
                  !body.trim() ||
                  (audienceNeedsRef && !audienceRefId)
                }
              >
                {sending ? "Queueing…" : "Queue send"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="message-status-list">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent messages</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
            >
              Refresh status
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={messages}
              columns={[
                {
                  key: "subject",
                  header: "Subject / body",
                  cell: (row) => (
                    <div className="max-w-xs truncate">
                      {row.subject || row.body.slice(0, 60)}
                    </div>
                  ),
                },
                {
                  key: "channel",
                  header: "Channel",
                  cell: (row) => row.channel,
                },
                {
                  key: "audience",
                  header: "Audience",
                  cell: (row) => row.audienceType.replaceAll("_", " "),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      <Badge data-testid="message-status">{row.status}</Badge>
                      {Object.entries(row.statusCounts ?? {}).map(
                        ([status, count]) => (
                          <Badge key={status} variant="outline">
                            {status}: {count}
                          </Badge>
                        ),
                      )}
                    </div>
                  ),
                },
                {
                  key: "recipients",
                  header: "Recipients",
                  cell: (row) => row._count?.recipients ?? 0,
                },
              ]}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No messages yet"
                  description="Queued messages and delivery status appear here."
                />
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
