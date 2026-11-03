"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/config";

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
  // Only same-site paths are honoured as a post-login target.
  redirect(from.startsWith("/") && !from.startsWith("//") ? from : "/app");
}
