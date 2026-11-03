import { describe, expect, it } from "vitest";
import { authorize, type Actor } from "@/lib/authorize";
import { TEMPLATES } from "@/lib/permissions";

const T1 = "tenant-1";
const T2 = "tenant-2";
const member = (over: Partial<Actor> = {}): Actor => ({
  id: "m1",
  role: "MEMBER",
  tenantId: T1,
  homeFolderId: "home-m1",
  homeFlags: TEMPLATES.Contributor,
  sharedGrants: {},
  ...over,
});
const inHome = (home: string) => ({ tenantId: T1, pathIds: ["root", home, "file"] });

describe("authorize: tenant isolation", () => {
  it("member A cannot touch member B's folder", () => {
    expect(authorize(member(), "view", inHome("home-m2"))).toEqual({ ok: false, reason: "forbidden" });
    expect(authorize(member(), "download", inHome("home-m2")).ok).toBe(false);
  });
  it("company 1 cannot touch company 2 (even admins)", () => {
    const admin: Actor = { id: "a", role: "COMPANY_ADMIN", tenantId: T1 };
    expect(authorize(admin, "view", { tenantId: T2, pathIds: ["x"] })).toEqual({ ok: false, reason: "tenant" });
  });
  it("actor without a tenant never matches a tenant node", () => {
    expect(authorize({ id: "x", role: "MEMBER", tenantId: null }, "view", inHome("h")).ok).toBe(false);
  });
});

describe("authorize: permissions", () => {
  it("contributor can upload to own home but not delete", () => {
    expect(authorize(member(), "upload", inHome("home-m1")).ok).toBe(true);
    expect(authorize(member(), "delete", inHome("home-m1")).ok).toBe(false);
  });
  it("viewer on shared folder cannot upload/delete there", () => {
    const m = member({ homeFlags: [], sharedGrants: { acct: TEMPLATES.Viewer } });
    const n = { tenantId: T1, pathIds: ["root", "acct", "sub", "f"] };
    expect(authorize(m, "view", n).ok).toBe(true);
    expect(authorize(m, "upload", n).ok).toBe(false);
    expect(authorize(m, "delete", n).ok).toBe(false);
  });
  it("admins and individuals have full control inside their tenant", () => {
    const n = { tenantId: T1, pathIds: ["a"] };
    expect(authorize({ id: "a", role: "COMPANY_ADMIN", tenantId: T1 }, "delete", n).ok).toBe(true);
    expect(authorize({ id: "i", role: "INDIVIDUAL", tenantId: T1 }, "share", n).ok).toBe(true);
  });
});
