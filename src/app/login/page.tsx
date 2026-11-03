import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-cyan-600">Infinitive Cloud Bucket</h1>
      <LoginForm from={from ?? ""} />
    </main>
  );
}
