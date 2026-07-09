"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BuildingsIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("reason") === "session_expired";
  const [resetSent, setResetSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "admin@cms.local", password: "" },
  });

  async function onSubmit(data: LoginForm) {
    setError("root", { message: "" });
    const supabase = getSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError("root", { message: authError.message });
      return;
    }

    // Supabase Auth can succeed while CMS has no AppUser row (e.g. after a
    // test DB reset that TRUNCATEs public tables but leaves auth.users).
    // AuthenticatedLayout then treats the session as logged-out and bounces
    // back to /login — surface that clearly instead of a silent loop.
    try {
      const sessionRes = await fetch("/api/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const sessionJson = (await sessionRes.json()) as {
        ok?: boolean;
        user?: { id: string } | null;
      };
      if (!sessionJson.user) {
        await supabase.auth.signOut();
        setError("root", {
          message:
            "Signed in to Auth, but this account is not provisioned in the CMS (no AppUser). Re-run bootstrap for a first-time install, or ask a diocese admin to create your user. Local tip: integration tests wipe AppUser — re-link admin@cms.local or re-bootstrap after a DB reset.",
        });
        return;
      }
    } catch {
      // If the check fails, still attempt navigation; layout will re-validate.
    }

    router.push("/");
    router.refresh();
  }

  async function requestPasswordReset() {
    const emailValue = getValues("email");
    if (!emailValue || !loginSchema.shape.email.safeParse(emailValue).success) {
      setError("root", { message: "Enter your email to reset your password." });
      return;
    }
    // Stub: password reset is managed by the diocese admin until SMTP is configured.
    setResetSent(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Enter your credentials to access your parish or diocese workspace.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {sessionExpired ? (
            <Alert>
              <AlertDescription>
                Your session expired. Please sign in again.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              aria-invalid={errors.email ? "true" : "false"}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={requestPasswordReset}
              >
                Forgot password?
              </Button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              aria-invalid={errors.password ? "true" : "false"}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          {resetSent ? (
            <Alert>
              <AlertDescription>
                Password reset is managed by your diocese or parish admin. Please
                contact them to regain access.
              </AlertDescription>
            </Alert>
          ) : null}

          {errors.root?.message ? (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Sign in
          </Button>
          <p className="text-xs text-muted-foreground">
            First time?{" "}
            <Link
              href="/bootstrap"
              className="text-primary underline-offset-2 hover:underline"
            >
              Provision your tenant
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

function LoginFormFallback() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center py-8">
        <Spinner />
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
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

        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
