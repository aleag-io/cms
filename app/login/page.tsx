"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingsIcon } from "@phosphor-icons/react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@cms.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function handleBootstrap() {
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/bootstrap", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        credentials?: { email: string; password: string };
      };

      if (data.ok) {
        const creds = data.credentials;
        if (creds) {
          setInfo(
            `Bootstrap complete! Email: ${creds.email} · Password: ${creds.password}`,
          );
          setEmail(creds.email);
          setPassword(creds.password);
        } else {
          setInfo(data.message ?? "Bootstrap complete.");
        }
      } else {
        setError(data.error ?? "Bootstrap failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BuildingsIcon className="size-6" weight="fill" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Mar Thoma CMS</h1>
            <p className="text-sm text-muted-foreground">
              Church Management System
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access your parish or diocese workspace.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {info ? (
                <Alert>
                  <AlertDescription>{info}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Spinner /> : null}
                Sign in
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="rounded-lg border border-dashed bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            First time? Bootstrap the demo tenant, then sign in with the
            generated credentials.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={handleBootstrap}
            disabled={busy}
          >
            Bootstrap demo tenant
          </Button>
        </div>
      </div>
    </main>
  );
}
