"use client";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export default function ChangePasswordPage() {
  const [error, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">Set a new password</h1>
      <p className="text-sm opacity-70">
        You must change your temporary password before continuing. You will be signed out afterwards.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Current password"
          className="rounded border px-3 py-2"
        />
        <input
          name="next"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          placeholder="New password (10+ chars)"
          className="rounded border px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button disabled={pending} className="rounded bg-cyan-600 px-3 py-2 font-medium text-white disabled:opacity-60">
          Change password
        </button>
      </form>
    </main>
  );
}
