"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { platformSettings, users } from "@/db/schema";
import { passwordProblems } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/request-ip";
import { createTenant, createUser } from "@/server/tenants";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().max(256),
});

export async function signupAction(_: string | undefined, form: FormData) {
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${ip}`, 5, 3600))) return "Too many sign-up attempts. Try again later.";
  const [setting] = await getDb()
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "signup_enabled"))
    .limit(1);
  if (setting && setting.value === false) return "Sign-up is currently closed.";

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return "Enter your name and a valid email address.";
  const { name, email, password } = parsed.data;
  const problems = passwordProblems(password);
  if (problems.length) return `Password needs: ${problems.join(", ")}.`;

  const [existing] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return "Could not create the account. If you already have one, sign in or reset your password.";

  const tenant = await createTenant({ type: "individual", name, planName: "Free" });
  const user = await createUser({
    email,
    name,
    password,
    role: "INDIVIDUAL",
    tenantId: tenant.id,
    mustChangePassword: false,
  });
  await audit({ actorId: user.id, tenantId: tenant.id, action: "signup", ip });
  redirect("/login?registered=1");
}
