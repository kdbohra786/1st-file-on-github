import Link from "next/link";
import { LoginForm } from "./form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; registered?: string; reset?: string }>;
}) {
  const { from, registered, reset } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-cyan-600">Infinitive Cloud Bucket</h1>
      {registered && (
        <p role="status" className="text-sm text-green-700">
          Account created. Sign in to continue.
        </p>
      )}
      {reset && (
        <p role="status" className="text-sm text-green-700">
          Password updated. Sign in with your new password.
        </p>
      )}
      <LoginForm from={from ?? ""} />
      <p className="text-sm">
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>{" "}
        ·{" "}
        <Link href="/signup" className="underline">
          Create account
        </Link>
      </p>
    </main>
  );
}
