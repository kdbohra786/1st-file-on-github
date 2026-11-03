"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { auth, signOut } from "@/lib/auth/config";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/server/audit";

export async function changePasswordAction(_: string | undefined, form: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const problems = passwordProblems(next);
  if (problems.length) return `New password needs: ${problems.join(", ")}.`;
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!u || !(await verifyPassword(u.passwordHash, current))) return "Current password is incorrect.";
  if (current === next) return "Choose a different password.";
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, u.id));
  await audit({ actorId: u.id, tenantId: u.tenantId, action: "password.changed" });
  // Session claims are refreshed by signing in again.
  await signOut({ redirectTo: "/login" });
}
