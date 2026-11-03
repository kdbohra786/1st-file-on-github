import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { audit } from "@/server/audit";
import type { Role } from "@/lib/authorize";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; tenantId: string | null; mustChangePassword: boolean } & DefaultSession["user"];
  }
}

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
// Verified against when the email is unknown so response time doesn't reveal account existence.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-for-timing"));

const creds = z.object({ email: z.string().email(), password: z.string().min(1).max(256) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = creds.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (!(await rateLimit(`login:${email.toLowerCase()}`, 20, 900))) return null;

        const db = getDb();
        const [u] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, email), isNull(users.deletedAt)))
          .limit(1);
        if (!u) {
          await verifyPassword(await getDummyHash(), password);
          return null;
        }
        if (u.lockedUntil && u.lockedUntil > new Date()) return null;
        const ok = await verifyPassword(u.passwordHash, password);
        if (!ok) {
          const fails = u.failedAttempts + 1;
          await db
            .update(users)
            .set({ failedAttempts: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null })
            .where(eq(users.id, u.id));
          await audit({ actorId: u.id, tenantId: u.tenantId, action: "login.failed" });
          return null;
        }
        if (u.status !== "active") return null;
        if (u.tenantId) {
          const [t] = await db
            .select({ status: tenants.status })
            .from(tenants)
            .where(eq(tenants.id, u.tenantId))
            .limit(1);
          if (!t || t.status === "suspended" || t.status === "deleted") return null;
        }
        await db
          .update(users)
          .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
          .where(eq(users.id, u.id));
        await audit({ actorId: u.id, tenantId: u.tenantId, action: "login" });
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          tenantId: u.tenantId,
          mustChangePassword: u.mustChangePassword,
        } as never;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { id: string; role: Role; tenantId: string | null; mustChangePassword: boolean };
        token.uid = u.id;
        token.role = u.role;
        token.tenantId = u.tenantId;
        token.mcp = u.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      session.user.tenantId = (token.tenantId as string | null) ?? null;
      session.user.mustChangePassword = Boolean(token.mcp);
      return session;
    },
  },
});
