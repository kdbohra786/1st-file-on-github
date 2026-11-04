import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/config";
import type { Role } from "@/lib/authorize";
import { homeFor } from "@/lib/routes";

const ACCENT = { indigo: "bg-indigo-700", blue: "bg-blue-700", cyan: "bg-cyan-700" } as const;

export async function PanelShell({
  title,
  accent,
  roles,
  nav,
  children,
}: {
  title: string;
  accent: keyof typeof ACCENT;
  roles: Role[];
  nav?: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const session = await auth();
  // Defence in depth: proxy.ts is skipped when a server action redirects here, so check again.
  if (!session?.user) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (!roles.includes(session.user.role)) redirect(homeFor(session.user.role));
  return (
    <div className="min-h-screen">
      <header className={`${ACCENT[accent]} flex flex-wrap items-center gap-4 px-4 py-3 text-white`}>
        <strong>Infinitive Cloud Bucket</strong>
        <span className="opacity-80">{title}</span>
        <nav aria-label="Panel" className="flex flex-1 flex-wrap gap-3 text-sm">
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

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tenants?type=company", label: "Companies" },
  { href: "/admin/tenants?type=individual", label: "Individuals" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
];
