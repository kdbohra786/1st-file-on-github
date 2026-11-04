"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { signIn } from "@/lib/auth/config";
import { homeFor } from "@/lib/routes";

export async function loginAction(_: string | undefined, form: FormData) {
  const from = String(form.get("from") ?? "");
  try {
    await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
  } catch (e) {
    if (e instanceof AuthError) return "Invalid email or password, or the account is locked or suspended.";
    throw e;
  }
  const [u] = await getDb()
    .select({ role: users.role, mcp: users.mustChangePassword })
    .from(users)
    .where(and(eq(users.email, String(form.get("email") ?? "")), isNull(users.deletedAt)))
    .limit(1);
  // Server-action redirects render the target inline and skip proxy.ts, so decide here too.
  if (u?.mcp) redirect("/change-password");
  // Only same-site paths are honoured as a post-login target; otherwise each role lands on its own panel.
  if (from.startsWith("/") && !from.startsWith("//")) redirect(from);
  redirect(homeFor(u?.role ?? "INDIVIDUAL"));
}
