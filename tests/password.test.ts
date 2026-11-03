import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("Correct#Horse1");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Correct#Horse1")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
  it("enforces strength rules", () => {
    expect(passwordProblems("short")).not.toHaveLength(0);
    expect(passwordProblems("Sufficient123")).toHaveLength(0);
  });
});
