"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "./actions";

export default function SignupPage() {
  const [error, action, pending] = useActionState(signupAction, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-cyan-600">Create your free account</h1>
      <p className="text-sm opacity-70">5 GB of private storage. No card needed.</p>
      <form action={action} className="flex flex-col gap-3">
        <input name="name" required autoComplete="name" placeholder="Full name" className="rounded border px-3 py-2" />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          placeholder="Password (10+ chars, upper, lower, number)"
          className="rounded border px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button disabled={pending} className="rounded bg-cyan-600 px-3 py-2 font-medium text-white disabled:opacity-60">
          {pending ? "Creating..." : "Create account"}
        </button>
      </form>
      <p className="text-sm">
        Already registered?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
