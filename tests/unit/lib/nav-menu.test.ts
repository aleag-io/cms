import { describe, expect, it } from "vitest";
import { navSectionsFromClaims, visibleNavItems } from "@/lib/nav/menu";
import type { SessionClaims } from "@/lib/auth";

function claims(roles: string[]): SessionClaims {
  return {
    sub: "user-1",
    app_metadata: {
      diocese_id: "diocese-1",
      parish_id: "parish-1",
      roles,
      member_id: "member-1",
      clergy_parish_ids: [],
      program_leader_ids: [],
      org_leader_ids: [],
    },
  };
}

describe("visibleNavItems", () => {
  it("shows member-safe destinations to ordinary members", () => {
    expect(visibleNavItems(["member"]).map((item) => item.href)).toEqual([
      "/",
      "/directory",
    ]);
  });

  it("shows parish admin destinations without diocese-only entries", () => {
    expect(visibleNavItems(["parish_admin"]).map((item) => item.href)).toEqual([
      "/",
      "/directory",
      "/members",
      "/families",
      "/sharing",
      "/settings/permissions",
      "/audit",
    ]);
  });

  it("shows aggregate reporting to diocese report viewers", () => {
    expect(
      visibleNavItems(["diocese_report_viewer"]).map((item) => item.href),
    ).toEqual(["/", "/diocese/aggregate"]);
  });

  it("shows diocese admin destinations for management and reporting", () => {
    expect(visibleNavItems(["diocese_admin"]).map((item) => item.href)).toEqual([
      "/",
      "/diocese/settings",
      "/parishes",
      "/diocese/users",
      "/diocese/aggregate",
      "/sharing",
      "/audit",
    ]);
  });

  it("merges derived clergy roles with the base user role", () => {
    expect(visibleNavItems(["member", "clergy"]).map((item) => item.href)).toEqual([
      "/",
      "/directory",
      "/members",
      "/families",
    ]);
  });
});

describe("navSectionsFromClaims", () => {
  it("groups visible items by shell section", () => {
    expect(
      navSectionsFromClaims(claims(["parish_admin"])).map((section) => ({
        title: section.title,
        items: section.items.map((item) => item.href),
      })),
    ).toEqual([
      {
        title: "People",
        items: ["/", "/directory", "/members", "/families"],
      },
      { title: "Sharing", items: ["/sharing"] },
      {
        title: "Administration",
        items: ["/settings/permissions", "/audit"],
      },
    ]);
  });
});
