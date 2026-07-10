import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/marketing/landing-page";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mar Thoma CMS — Church Management for the Diocese of North America",
  description:
    "Multi-tenant church management with parish data sovereignty, membership, events, sacramental records, and governed sharing.",
};

export default async function HomePage() {
  // Signed-in users go straight into the product workspace.
  // Fail open to marketing if auth/env is unavailable (e.g. CI smoke).
  // Note: call redirect() outside try/catch — Next.js implements redirect via throw.
  let user = null;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }
  if (user) {
    redirect("/app");
  }

  return <LandingPage />;
}
