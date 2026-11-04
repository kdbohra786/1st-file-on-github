"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { resetAction } from "./actions";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [error, action, pending] = useActionState(resetAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input
        name="password"
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
        Set new password
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold">Choose a new password</h1>
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
