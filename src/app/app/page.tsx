import { auth, signOut } from "@/lib/auth/config";

export default async function Page() {
  const session = await auth();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold text-cyan-600">My Files</h1>
      <p className="mt-2 opacity-70">
        Signed in as {session?.user.email} ({session?.user.role}). Panel features arrive in the next Phase 1 steps.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button className="mt-4 rounded border px-3 py-1">Sign out</button>
      </form>
    </main>
  );
}
