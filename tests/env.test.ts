import { describe, expect, it, beforeEach, vi } from "vitest";

describe("env validation", () => {
  beforeEach(() => vi.resetModules());

  it("fails loudly and readably on a bad config", async () => {
    vi.stubEnv("APP_URL", "not-a-url");
    vi.stubEnv("AUTH_SECRET", "short");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/Invalid environment configuration[\s\S]*APP_URL[\s\S]*AUTH_SECRET/);
    vi.unstubAllEnvs();
  });

  it("accepts the dev example values", async () => {
    const vals: Record<string, string> = {
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgres://x",
      S3_ENDPOINT_INTERNAL: "http://127.0.0.1:8333",
      S3_ENDPOINT_PUBLIC: "http://127.0.0.1:8333",
      S3_ADMIN_ACCESS_KEY: "a",
      S3_ADMIN_SECRET_KEY: "b",
      AUTH_SECRET: "x".repeat(32),
      METRICS_TOKEN: "metrics-token",
    };
    for (const [k, v] of Object.entries(vals)) vi.stubEnv(k, v);
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().S3_REGION).toBe("us-east-1");
    vi.unstubAllEnvs();
  });
});
