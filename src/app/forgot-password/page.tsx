"use client";
import Link from "next/link";
import { useActionState } from "react";
import { forgotAction } from "./actions";

export default function ForgotPasswordPage() {
  const [msg, action, pending] = useActionState(forgotAction, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">Reset your password</h1>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        {msg && (
          <p role="status" className="text-sm">
            {msg}
          </p>
        )}
        <button disabled={pending} className="rounded bg-cyan-600 px-3 py-2 font-medium text-white disabled:opacity-60">
          Send reset link
        </button>
      </form>
      <Link href="/login" className="text-sm underline">
        Back to sign in
      </Link>
    </main>
  );
}
