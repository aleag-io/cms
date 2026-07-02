import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest } from "@/lib/api-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(response: Response) {
  globalThis.fetch = vi.fn(async () => response) as typeof fetch;
}

describe("apiRequest", () => {
  it("returns parsed JSON for successful API envelopes", async () => {
    mockFetch(Response.json({ ok: true, families: [] }));

    await expect(apiRequest("/api/families")).resolves.toEqual({
      ok: true,
      families: [],
    });
  });

  it("maps 401 responses to unauthorized errors", async () => {
    mockFetch(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );

    await expect(apiRequest("/api/session")).rejects.toMatchObject({
      status: 401,
      kind: "unauthorized",
      message: "Unauthorized",
    } satisfies Partial<ApiClientError>);
  });

  it("maps 403 responses to forbidden errors", async () => {
    mockFetch(Response.json({ ok: false, error: "Forbidden" }, { status: 403 }));

    await expect(apiRequest("/api/audit")).rejects.toMatchObject({
      status: 403,
      kind: "forbidden",
      message: "Forbidden",
    } satisfies Partial<ApiClientError>);
  });

  it("surfaces resilient messages for non-json server failures", async () => {
    mockFetch(
      new Response("<html>Error</html>", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(apiRequest("/api/members")).rejects.toMatchObject({
      status: 500,
      kind: "server",
      message: "Request failed (500 Internal Server Error).",
    } satisfies Partial<ApiClientError>);
  });
});
