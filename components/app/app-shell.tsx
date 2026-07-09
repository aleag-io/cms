"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BuildingsIcon,
  CaretDownIcon,
  ClipboardTextIcon,
  HouseIcon,
  IdentificationCardIcon,
  GearIcon,
  ShareNetworkIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UserCircleIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { NavSection } from "@/lib/nav/menu";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TenantContextSwitcher } from "@/components/app/tenant-context-switcher";

export type ShellUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  parishId: string | null;
};

export type ShellContext = {
  portal: "parish" | "diocese";
  canSwitchParish: boolean;
  parishName: string | null;
  workingParishId: string | null;
};

const NAV_ICONS: Record<string, Icon> = {
  "/": HouseIcon,
  "/directory": UsersThreeIcon,
  "/self-service": IdentificationCardIcon,
  "/registrations": IdentificationCardIcon,
  "/members": IdentificationCardIcon,
  "/families": UsersThreeIcon,
  "/diocese/settings": GearIcon,
  "/parishes": BuildingsIcon,
  "/diocese/users": UserCircleIcon,
  "/diocese/aggregate": BuildingsIcon,
  "/sharing": ShareNetworkIcon,
  "/settings/parish": GearIcon,
  "/settings/officers": IdentificationCardIcon,
  "/settings/users": UserCircleIcon,
  "/settings/permissions": ShieldCheckIcon,
  "/audit": ClipboardTextIcon,
  "/programs": ClipboardTextIcon,
  "/organizations": UsersThreeIcon,
  "/events": BuildingsIcon,
  "/facilities": BuildingsIcon,
  "/messages": ShareNetworkIcon,
};

function navIconFor(href: string): Icon {
  return NAV_ICONS[href] ?? ClipboardTextIcon;
}

function isActiveHref(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  user,
  sections,
  context,
}: {
  children: ReactNode;
  user: ShellUser;
  sections: NavSection[];
  context: ShellContext;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initials = useMemo(
    () =>
      user.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "U",
    [user.displayName],
  );

  async function signOut() {
    setSigningOut(true);
    try {
      await apiRequest("/api/session", { method: "DELETE" });
      await getSupabaseBrowserClient().auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign out failed");
      setSigningOut(false);
    }
  }

  return (
    <>
      <TooltipProvider>
        <SidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <div className="flex items-center gap-2 px-2 py-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <BuildingsIcon className="size-4" />
                </div>
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold">
                    Mar Thoma CMS
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Church Management System
                  </p>
                </div>
              </div>
            </SidebarHeader>
            <SidebarContent>
              {sections.map((section) => (
                <SidebarGroup key={section.title}>
                  <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => {
                        const ItemIcon = navIconFor(item.href);
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              isActive={isActiveHref(item.href, pathname)}
                              tooltip={item.title}
                            >
                              <Link href={item.href}>
                                <ItemIcon />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <SidebarFooter>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2 px-2 py-2"
                  >
                    <Avatar className="size-8 rounded-md">
                      <AvatarFallback className="rounded-md text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                      <span className="block truncate text-xs font-medium">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">
                        {user.role.replaceAll("_", " ")}
                      </span>
                    </span>
                    <CaretDownIcon className="size-3 group-data-[collapsible=icon]:hidden" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="right" className="w-56">
                  <DropdownMenuLabel>
                    <span className="block truncate">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>
                    <UserCircleIcon />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    <SignOutIcon />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <div className="flex min-h-svh flex-col bg-background">
              <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
                <SidebarTrigger className="-ml-1" />
                <div className="min-w-0 flex-1">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden sm:inline-flex">
                        <BreadcrumbLink asChild>
                          <Link href="/">Home</Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      {pathname !== "/" ? (
                        <>
                          <BreadcrumbSeparator className="hidden sm:block" />
                          <BreadcrumbItem>
                            <BreadcrumbPage className="truncate">
                              {currentPageTitle(sections, pathname)}
                            </BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      ) : null}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <TenantContextSwitcher
                  canSwitchParish={context.canSwitchParish}
                  initialPortal={context.portal}
                  initialParishName={context.parishName}
                  initialWorkingParishId={context.workingParishId}
                />
              </header>
              <main className="flex-1">{children}</main>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
      <Toaster />
    </>
  );
}

function currentPageTitle(sections: NavSection[], pathname: string): string {
  for (const section of sections) {
    const match = section.items.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    );
    if (match) return match.title;
  }

  return "CMS";
}
