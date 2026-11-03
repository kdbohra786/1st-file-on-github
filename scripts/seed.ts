import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../src/db/client";
import { memberPermissions, nodes, plans, sharedFolderAccess, tenants, users } from "../src/db/schema";
import { createTenant, createUser } from "../src/server/tenants";
import { getEnv } from "../src/lib/env";
import { TEMPLATES } from "../src/lib/permissions";

const GB = 1024 ** 3;
const PLANS = [
  { name: "Free", quotaBytes: 5 * GB, maxUsers: 1, priceLabel: "Free" },
  { name: "Starter", quotaBytes: 100 * GB, maxUsers: 5, priceLabel: "Contact us" },
  { name: "Business", quotaBytes: 1024 * GB, maxUsers: 50, priceLabel: "Contact us" },
  { name: "Enterprise", quotaBytes: 10240 * GB, maxUsers: 1000, priceLabel: "Custom" },
];

async function userExists(email: string) {
  const [u] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return u?.id;
}

async function main() {
  const env = getEnv();
  const db = getDb();
  for (const p of PLANS) await db.insert(plans).values(p).onConflictDoNothing({ target: plans.name });

  const rows: string[][] = [];
  if (!(await userExists(env.SEED_SUPERADMIN_EMAIL))) {
    await createUser({
      email: env.SEED_SUPERADMIN_EMAIL,
      name: "Super Admin",
      password: env.SEED_SUPERADMIN_PASSWORD,
      role: "SUPER_ADMIN",
    });
  }
  rows.push(["Super Admin", env.SEED_SUPERADMIN_EMAIL, env.SEED_SUPERADMIN_PASSWORD]);

  if (env.SEED_DEMO === "true") {
    const demo = [
      ["Company Admin", "companyadmin@demo.infinitivecloud.com", "Company@Bucket#2026"],
      ["Member 1 (Contributor)", "member1@demo.infinitivecloud.com", "Member1@Bucket#2026"],
      ["Member 2 (Viewer on Accounts)", "member2@demo.infinitivecloud.com", "Member2@Bucket#2026"],
      ["Individual", "individual@demo.infinitivecloud.com", "Individual@Bucket#2026"],
    ];
    if (!(await userExists(demo[0][1]))) {
      const co = await createTenant({ type: "company", name: "Acme Demo Pvt Ltd", planName: "Business" });
      await createUser({
        email: demo[0][1],
        name: "Acme Admin",
        password: demo[0][2],
        role: "COMPANY_ADMIN",
        tenantId: co.id,
      });
      const m1 = await createUser({
        email: demo[1][1],
        name: "Member One",
        password: demo[1][2],
        role: "MEMBER",
        tenantId: co.id,
        template: "Contributor",
      });
      const m2 = await createUser({
        email: demo[2][1],
        name: "Member Two",
        password: demo[2][2],
        role: "MEMBER",
        tenantId: co.id,
        template: "Viewer",
      });
      const [accounts] = await db
        .insert(nodes)
        .values({ tenantId: co.id, parentId: null, type: "folder", name: "Accounts", isSharedRoot: true })
        .returning();
      await db
        .insert(sharedFolderAccess)
        .values({ nodeId: accounts.id, userId: m2.id, permissions: [...TEMPLATES.Viewer] });
      void m1;
      // Member 2 only sees the Accounts shared folder: no flags on their own home.
      await db.update(memberPermissions).set({ flags: [], scope: "shared" }).where(eq(memberPermissions.userId, m2.id));
    }
    if (!(await userExists(demo[3][1]))) {
      const t = await createTenant({ type: "individual", name: "Demo Individual", planName: "Free" });
      await createUser({
        email: demo[3][1],
        name: "Demo Individual",
        password: demo[3][2],
        role: "INDIVIDUAL",
        tenantId: t.id,
      });
    }
    rows.push(...demo);
  }
  console.log("\nSeed complete. Credentials (all must change password on first login):");
  console.table(rows.map(([panel, email, password]) => ({ panel, email, password })));
  void tenants;
  await getSql().end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
