import { auth, signOut } from "@/lib/auth/config";

const ACCENT = { indigo: "bg-indigo-700", blue: "bg-blue-700", cyan: "bg-cyan-700" } as const;

export async function PanelShell({
  title,
  accent,
  nav,
  children,
}: {
  title: string;
  accent: keyof typeof ACCENT;
  nav?: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <div className="min-h-screen">
      <header className={`${ACCENT[accent]} flex flex-wrap items-center gap-4 px-4 py-3 text-white`}>
        <strong>Infinitive Cloud Bucket</strong>
        <span className="opacity-80">{title}</span>
        <nav className="flex flex-1 gap-3 text-sm">
          {nav?.map((n) => (
            <a key={n.href} href={n.href} className="underline-offset-2 hover:underline">
              {n.label}
            </a>
          ))}
        </nav>
        <span className="text-sm opacity-80">{session?.user.email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="rounded border border-white/40 px-2 py-1 text-sm">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
