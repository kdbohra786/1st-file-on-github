"use server";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/server/audit";
import { sendMail } from "@/server/mail";
import { hashToken } from "@/server/tokens";
import { clientIp } from "@/server/request-ip";

const SAME = "If that email has an account, a reset link is on its way. It expires in 1 hour.";

export async function forgotAction(_: string | undefined, form: FormData) {
  const ip = await clientIp();
  const email = z.string().trim().email().safeParse(form.get("email"));
  if (!email.success) return "Enter a valid email address.";
  if (
    !(await rateLimit(`forgot:ip:${ip}`, 10, 3600)) ||
    !(await rateLimit(`forgot:email:${email.data.toLowerCase()}`, 3, 3600))
  )
    return SAME;

  const db = getDb();
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.data), isNull(users.deletedAt)))
    .limit(1);
  if (u && u.status === "active") {
    const token = randomBytes(32).toString("base64url");
    await db
      .insert(passwordResetTokens)
      .values({ userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) });
    await sendMail(
      u.email,
      "Reset your Infinitive Cloud Bucket password",
      `Reset your password (valid for 1 hour, single use):\n\n${getEnv().APP_URL}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this email.`,
    ).catch(() => false);
    await audit({ actorId: u.id, tenantId: u.tenantId, action: "password.reset_requested", ip });
  }
  return SAME;
}
