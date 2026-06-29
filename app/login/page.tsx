"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">CMS · Local development</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {info ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            Sign in
          </button>
        </form>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            First time? Bootstrap the demo tenant then log in with the generated
            credentials.
          </p>
          <button
            type="button"
            onClick={handleBootstrap}
            disabled={busy}
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Bootstrap Demo Tenant
          </button>
        </div>
      </div>
    </main>
  );
}
