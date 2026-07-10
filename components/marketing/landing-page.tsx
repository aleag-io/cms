import Link from "next/link";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  LockKeyIcon,
  ShareNetworkIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
  CrossIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductFrame } from "@/components/marketing/product-frame";
import {
  MockDashboard,
  MockDirectory,
  MockEvents,
  MockSharing,
} from "@/components/marketing/product-mockups";

const features = [
  {
    title: "People & membership",
    description:
      "Families, members, multi-parish membership, directory, and self-service — with role-projected sensitive fields.",
    icon: UsersThreeIcon,
  },
  {
    title: "Parish operations",
    description:
      "Programs and attendance, organizations, events with RSVP, facility booking, and parish messaging.",
    icon: CalendarBlankIcon,
  },
  {
    title: "Data sovereignty",
    description:
      "Parishes control what leaves their boundaries. Explicit grants, secure links, and short-lived emergency access.",
    icon: ShareNetworkIcon,
  },
  {
    title: "Sacramental records",
    description:
      "Baptism, confirmation, marriage, and more — parish register search with certificate-ready records.",
    icon: CrossIcon,
  },
  {
    title: "Governance & roles",
    description:
      "Diocese and parish admins, clergy, ministry leaders, and members — each sees only what their role allows.",
    icon: ShieldCheckIcon,
  },
  {
    title: "Security by design",
    description:
      "Tenant isolation enforced in Postgres with row-level security. Append-only audit for sensitive actions.",
    icon: LockKeyIcon,
  },
];

const demos = [
  {
    id: "dashboard",
    title: "Role-aware dashboard",
    description: "KPIs and work queues tailored to parish administration.",
    url: "cms.marthoma.example/app",
    Mock: MockDashboard,
  },
  {
    id: "directory",
    title: "Parish directory",
    description: "Searchable member directory with safe field projection.",
    url: "cms.marthoma.example/directory",
    Mock: MockDirectory,
  },
  {
    id: "events",
    title: "Events & facilities",
    description:
      "Schedule worship, meetings, and facility bookings without conflicts.",
    url: "cms.marthoma.example/events",
    Mock: MockEvents,
  },
  {
    id: "sharing",
    title: "Governed data sharing",
    description: "Grants, secure links, and audited emergency access.",
    url: "cms.marthoma.example/sharing",
    Mock: MockSharing,
  },
];

const securityPoints = [
  "Parish data sovereignty — no silent diocese-wide row access",
  "Postgres row-level security as the security boundary",
  "Role-projected pastoral and private fields",
  "Append-only audit trail for create, update, and denied attempts",
];

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BuildingsIcon className="size-4" weight="fill" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Mar Thoma CMS</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Church Management System
              </p>
            </div>
          </a>
          <nav
            className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
            aria-label="Page sections"
          >
            <a href="#demo" className="hover:text-foreground">
              Demo
            </a>
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#security" className="hover:text-foreground">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/register">Register</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        <section className="relative overflow-hidden border-b border-border">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.457_0.24_277_/_0.12),transparent_55%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <Badge variant="secondary" className="mb-4">
                Diocese of North America
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                Church management built for parish sovereignty and diocese scale
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
                Mar Thoma CMS unifies membership, ministries, events, sacramental
                records, and governed data sharing — with multi-tenant security
                enforced at the database, not just the UI.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/login">Sign in to your parish</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#demo">See product demo</a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Log in
                </Link>
                . New members can{" "}
                <Link
                  href="/register"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  self-register
                </Link>
                .
              </p>
            </div>
            <ProductFrame
              url="cms.marthoma.example/app"
              className="lg:translate-y-2"
            >
              <MockDashboard />
            </ProductFrame>
          </div>
        </section>

        <section
          id="demo"
          className="scroll-mt-16 border-b border-border bg-muted/30"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                See the product in action
              </h2>
              <p className="mt-3 text-muted-foreground">
                Illustrative screens of the live application — people, operations,
                and sharing — using fictional demo data only.
              </p>
            </div>
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {demos.map(({ id, title, description, url, Mock }) => (
                <div key={id}>
                  <ProductFrame url={url} label={`${title} — ${description}`}>
                    <Mock />
                  </ProductFrame>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Everything a modern diocese and parish needs
              </h2>
              <p className="mt-3 text-muted-foreground">
                One platform from diocese administration down to family and
                member records — without compromising parish control of data.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="h-full">
                  <CardHeader>
                    <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <feature.icon className="size-5" />
                    </div>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          id="security"
          className="scroll-mt-16 border-b border-border bg-muted/30"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge variant="outline" className="mb-3">
                Security spine
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Trust that survives a misconfigured screen
              </h2>
              <p className="mt-3 text-muted-foreground">
                The UI is not the security boundary. Every parish-scoped read and
                write runs under restricted database roles and policies, so tenant
                isolation holds even when application code has a bug.
              </p>
            </div>
            <ul className="space-y-3">
              {securityPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <CheckCircleIcon
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    weight="fill"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to open your workspace?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Sign in with the credentials issued by your diocese or parish
              administrator. First-time diocese installs can provision a tenant
              from the bootstrap flow.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/register">Member self-registration</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BuildingsIcon className="size-3.5" weight="fill" />
            </div>
            <div>
              <p className="text-sm font-medium">Mar Thoma CMS</p>
              <p className="text-xs text-muted-foreground">
                Diocese of North America · Church Management System
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Register
            </Link>
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
