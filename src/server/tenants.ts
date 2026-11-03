import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { plans, tenants, users, memberPermissions, nodes } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { hashPassword } from "@/lib/auth/password";
import { TEMPLATES } from "@/lib/permissions";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "co";
const shortId = () => randomBytes(4).toString("hex");

export const OBJECT_PREFIX = "files";

export async function createTenant(input: {
  type: "company" | "individual";
  name: string;
  planName: string;
  planExpiresAt?: Date | null;
}) {
  const db = getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.name, input.planName)).limit(1);
  if (!plan) throw new Error(`Unknown plan: ${input.planName}`);
  const sid = shortId();
  const slug = input.type === "company" ? `${slugify(input.name)}-${sid}` : `u-${sid}`;
  const bucketName = input.type === "company" ? `c-${slugify(input.name)}-${sid}` : `u-${sid}`;
  const storage = getStorage();
  await storage.createBucket(bucketName);
  try {
    const [tenant] = await db
      .insert(tenants)
      .values({
        type: input.type,
        name: input.name,
        slug,
        bucketName,
        planId: plan.id,
        quotaBytes: plan.quotaBytes,
        maxUsers: input.type === "company" ? plan.maxUsers : 1,
        planExpiresAt: input.planExpiresAt ?? null,
      })
      .returning();
    return tenant;
  } catch (e) {
    await storage.deleteBucket(bucketName).catch(() => {});
    throw e;
  }
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "MEMBER" | "INDIVIDUAL";
  tenantId?: string | null;
  mustChangePassword?: boolean;
  template?: keyof typeof TEMPLATES;
}) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: input.email.trim(),
      name: input.name,
      role: input.role,
      tenantId: input.tenantId ?? null,
      passwordHash: await hashPassword(input.password),
      mustChangePassword: input.mustChangePassword ?? true,
    })
    .returning();
  if (input.role === "MEMBER" && input.tenantId) {
    const template = input.template ?? "Contributor";
    await db.insert(memberPermissions).values({ userId: user.id, template, flags: TEMPLATES[template], scope: "own" });
  }
  // Every non-super-admin gets a home folder (the root of their "My Files").
  if (user.tenantId && user.role !== "SUPER_ADMIN" && user.role !== "COMPANY_ADMIN") {
    await db
      .insert(nodes)
      .values({ tenantId: user.tenantId, parentId: null, type: "folder", name: user.name, ownerId: user.id });
  }
  return user;
}
