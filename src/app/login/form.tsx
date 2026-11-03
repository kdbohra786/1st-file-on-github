"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ from }: { from: string }) {
  const [error, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <input type="hidden" name="from" value={from} />
      <label className="text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button disabled={pending} className="rounded bg-cyan-600 px-3 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
