import { describe, expect, it, vi } from "vitest";

import { getMyMaterialPackages } from "@/components/materialPackage/materialPackageApi";

describe("materialPackageApi base fallback", () => {
  it("当 base 以 /api 结尾且返回 404 时，会回退尝试去掉 /api", async () => {
    const fetchSpy = vi.fn(async (url: any, init: any) => {
      if (url === "http://example.com/api/materialPackage/my") {
        return new Response("Not Found", { status: 404, statusText: "Not Found" });
      }

      if (url === "http://example.com/materialPackage/my") {
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer token-123");
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`unexpected url: ${String(url)}`);
    });

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchSpy;

    try {
      await getMyMaterialPackages({ base: "http://example.com/api", token: "token-123" });
    }
    finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

