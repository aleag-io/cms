"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from "@/components/patterns/states";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";

type Subscription = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secretPreview: string;
  deliveryCount: number;
};

type Delivery = {
  id: string;
  eventType: string;
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "DEAD";
  attemptCount: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
};

const STATUS_VARIANT: Record<Delivery["status"], "default" | "secondary" | "outline" | "destructive"> = {
  DELIVERED: "secondary",
  PENDING: "outline",
  PROCESSING: "outline",
  FAILED: "destructive",
  DEAD: "destructive",
};

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    ...WEBHOOK_EVENTS,
  ]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);

  const subscriptionsQuery = useQuery({
    queryKey: ["integrations", "webhooks"],
    queryFn: () =>
      apiRequest<{ ok: true; subscriptions: Subscription[] }>(
        "/api/integrations/webhooks",
      ),
  });

  const deliveriesQuery = useQuery({
    queryKey: ["integrations", "webhooks", openLog, "deliveries"],
    enabled: Boolean(openLog),
    queryFn: () =>
      apiRequest<{ ok: true; deliveries: Delivery[] }>(
        `/api/integrations/webhooks/${openLog}/deliveries`,
      ),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["integrations", "webhooks"] });

  const createSubscription = useMutation({
    mutationFn: () =>
      apiRequest<{ ok: true; secret: string }>("/api/integrations/webhooks", {
        method: "POST",
        body: JSON.stringify({ name, url, events: selectedEvents }),
      }),
    onSuccess: (data) => {
      setRevealedSecret(data.secret);
      setName("");
      setUrl("");
      toast.success("Endpoint created — copy the signing secret now");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to create"),
  });

  const toggleActive = useMutation({
    mutationFn: (subscription: Subscription) =>
      apiRequest(`/api/integrations/webhooks/${subscription.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !subscription.isActive }),
      }),
    onSuccess: invalidate,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to update"),
  });

  const rotateSecret = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true; secret: string }>(
        `/api/integrations/webhooks/${id}/rotate-secret`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setRevealedSecret(data.secret);
      toast.success("Secret rotated — update your receiver");
      invalidate();
    },
  });

  const sendTest = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/integrations/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: () => toast.success("Test delivery queued"),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to queue"),
  });

  const removeSubscription = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/integrations/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Endpoint deleted");
      invalidate();
    },
  });

  const retryDelivery = useMutation({
    mutationFn: ({ subscriptionId, deliveryId }: { subscriptionId: string; deliveryId: string }) =>
      apiRequest(
        `/api/integrations/webhooks/${subscriptionId}/deliveries/${deliveryId}/retry`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Delivery re-queued");
      void deliveriesQuery.refetch();
    },
  });

  if (subscriptionsQuery.isLoading) return <PageSkeleton rows={4} />;
  if (subscriptionsQuery.isError) {
    return (
      <ErrorState
        title="Could not load integrations"
        description="Webhook endpoints failed to load."
        retry={() => void subscriptionsQuery.refetch()}
      />
    );
  }

  const subscriptions = subscriptionsQuery.data?.subscriptions ?? [];

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="Integrations"
        description="Send parish events to an external system. Deliveries are signed with a per-endpoint secret and retried automatically on failure."
      />

      {revealedSecret ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Signing secret</CardTitle>
            <CardDescription>
              Copy this now — it is shown once and never returned again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-sm break-all">
              {revealedSecret}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(revealedSecret);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevealedSecret(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add an endpoint</CardTitle>
          <CardDescription>
            We POST a signed JSON envelope to this URL for each subscribed event.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="webhook-name">Name</Label>
              <Input
                id="webhook-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Parish CRM"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/hooks/cms"
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Events</legend>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={(changed) =>
                      setSelectedEvents((prev) =>
                        changed.target.checked
                          ? [...prev, event]
                          : prev.filter((value) => value !== event),
                      )
                    }
                  />
                  <code>{event}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            onClick={() => createSubscription.mutate()}
            disabled={
              !name || !url || selectedEvents.length === 0 || createSubscription.isPending
            }
          >
            Create endpoint
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoints</CardTitle>
          <CardDescription>
            {subscriptions.length} configured for this parish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <EmptyState
              title="No endpoints yet"
              description="Add an endpoint above to start receiving events."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Webhook endpoints">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Secret</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((subscription) => (
                    <TableRow key={subscription.id}>
                      <TableCell className="font-medium">
                        {subscription.name}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs">
                        {subscription.url}
                      </TableCell>
                      <TableCell className="text-xs">
                        {subscription.events.length} subscribed
                      </TableCell>
                      <TableCell className="text-xs">
                        {subscription.secretPreview}
                      </TableCell>
                      <TableCell>
                        <Badge variant={subscription.isActive ? "secondary" : "outline"}>
                          {subscription.isActive ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setOpenLog(
                              openLog === subscription.id ? null : subscription.id,
                            )
                          }
                        >
                          {openLog === subscription.id ? "Hide log" : "Log"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendTest.mutate(subscription.id)}
                        >
                          Send test
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive.mutate(subscription)}
                        >
                          {subscription.isActive ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rotateSecret.mutate(subscription.id)}
                        >
                          Rotate
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button size="sm" variant="destructive">
                              Delete
                            </Button>
                          }
                          title="Delete this endpoint?"
                          description={`${subscription.name} will stop receiving events. Delivery history is removed with it.`}
                          confirmLabel="Delete endpoint"
                          destructive
                          onConfirm={() =>
                            removeSubscription.mutate(subscription.id)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {openLog ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery log</CardTitle>
            <CardDescription>
              Most recent 50 deliveries. Failed deliveries retry automatically with
              backoff; &quot;Retry now&quot; re-queues immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deliveriesQuery.isLoading ? <PageSkeleton rows={3} /> : null}
            {deliveriesQuery.data?.deliveries.length === 0 ? (
              <EmptyState
                title="No deliveries yet"
                description="Deliveries appear once a subscribed event occurs."
              />
            ) : null}
            {deliveriesQuery.data && deliveriesQuery.data.deliveries.length > 0 ? (
              <div className="overflow-x-auto">
                <Table aria-label="Delivery log">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Attempts</TableHead>
                      <TableHead className="text-right">Response</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveriesQuery.data.deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="text-xs">
                          <code>{delivery.eventType}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[delivery.status]}>
                            {delivery.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {delivery.attemptCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {delivery.responseStatus ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-xs">
                          {delivery.lastError ?? ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {delivery.status === "FAILED" || delivery.status === "DEAD" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                retryDelivery.mutate({
                                  subscriptionId: openLog,
                                  deliveryId: delivery.id,
                                })
                              }
                            >
                              Retry now
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
