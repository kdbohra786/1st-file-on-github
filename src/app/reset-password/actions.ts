"use server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/request-ip";
import { hashToken } from "@/server/tokens";

export async function resetAction(_: string | undefined, form: FormData) {
  const ip = await clientIp();
  if (!(await rateLimit(`reset:${ip}`, 20, 3600))) return "Too many attempts. Try again later.";
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const problems = passwordProblems(password);
  if (problems.length) return `Password needs: ${problems.join(", ")}.`;

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    // Atomic single-use: only the request that flips used_at wins.
    const [row] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row) return null;
    const [u] = await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.userId))
      .returning();
    return u;
  });
  if (!result) return "This reset link is invalid or has expired. Request a new one.";
  await audit({ actorId: result.id, tenantId: result.tenantId, action: "password.reset", ip });
  redirect("/login?reset=1");
}
