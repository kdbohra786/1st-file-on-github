import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const stamps = () => ({
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
const bytes = (name: string) => bigint(name, { mode: "number" });

export const roleEnum = pgEnum("role", ["SUPER_ADMIN", "COMPANY_ADMIN", "MEMBER", "INDIVIDUAL"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "invited"]);
export const tenantTypeEnum = pgEnum("tenant_type", ["company", "individual"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended", "read_only", "deleted"]);
export const nodeTypeEnum = pgEnum("node_type", ["file", "folder"]);
export const nodeStatusEnum = pgEnum("node_status", ["uploading", "ready", "failed"]);

export const plans = pgTable("plans", {
  id: id(),
  name: text("name").notNull().unique(),
  quotaBytes: bytes("quota_bytes").notNull(),
  maxUsers: integer("max_users").notNull().default(1),
  maxFileBytes: bytes("max_file_bytes")
    .notNull()
    .default(5 * 1024 ** 3),
  priceLabel: text("price_label"),
  features: jsonb("features").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  ...stamps(),
});

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    type: tenantTypeEnum("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: tenantStatusEnum("status").notNull().default("active"),
    planId: uuid("plan_id").references(() => plans.id),
    bucketName: text("bucket_name").notNull().unique(),
    quotaBytes: bytes("quota_bytes").notNull(),
    usedBytes: bytes("used_bytes").notNull().default(0),
    planExpiresAt: ts("plan_expires_at"),
    maxUsers: integer("max_users").notNull().default(1),
    settings: jsonb("settings").notNull().default({}),
    deletedAt: ts("deleted_at"),
    ...stamps(),
  },
  (t) => [index("tenants_plan_idx").on(t.planId), index("tenants_status_idx").on(t.status)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: citext("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    status: userStatusEnum("status").notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    storageCapBytes: bytes("storage_cap_bytes"),
    lastLoginAt: ts("last_login_at"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: ts("locked_until"),
    totpSecret: text("totp_secret"),
    deletedAt: ts("deleted_at"),
    ...stamps(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_tenant_idx").on(t.tenantId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    paidOn: ts("paid_on").notNull(),
    reference: text("reference"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    ...stamps(),
  },
  (t) => [index("payments_tenant_idx").on(t.tenantId)],
);

export const nodes = pgTable(
  "nodes",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    parentId: uuid("parent_id"),
    type: nodeTypeEnum("type").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id),
    sizeBytes: bytes("size_bytes").notNull().default(0),
    mime: text("mime"),
    s3Key: text("s3_key"),
    etag: text("etag"),
    status: nodeStatusEnum("status").notNull().default("ready"),
    isSharedRoot: boolean("is_shared_root").notNull().default(false),
    contentHash: text("content_hash"),
    deletedAt: ts("deleted_at"),
    deletedBy: uuid("deleted_by").references(() => users.id),
    ...stamps(),
  },
  (t) => [
    index("nodes_tenant_parent_idx").on(t.tenantId, t.parentId),
    index("nodes_owner_idx").on(t.ownerId),
    index("nodes_deleted_idx").on(t.tenantId, t.deletedAt),
  ],
);

export const starredNodes = pgTable(
  "starred_nodes",
  {
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.userId] }), index("starred_user_idx").on(t.userId)],
);

export const sharedFolderAccess = pgTable(
  "shared_folder_access",
  {
    id: id(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...stamps(),
  },
  (t) => [uniqueIndex("sfa_node_user_uq").on(t.nodeId, t.userId), index("sfa_user_idx").on(t.userId)],
);

export const memberPermissions = pgTable("member_permissions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  template: text("template").notNull().default("Contributor"),
  flags: text("flags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  scope: text("scope").notNull().default("own"),
  ...stamps(),
});

export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    passwordHash: text("password_hash"),
    expiresAt: ts("expires_at"),
    maxDownloads: integer("max_downloads"),
    downloadCount: integer("download_count").notNull().default(0),
    allowDownload: boolean("allow_download").notNull().default(true),
    revokedAt: ts("revoked_at"),
    ...stamps(),
  },
  (t) => [
    uniqueIndex("share_token_uq").on(t.token),
    index("share_node_idx").on(t.nodeId),
    index("share_tenant_idx").on(t.tenantId),
  ],
);

export const shareLinkVisits = pgTable(
  "share_link_visits",
  {
    id: id(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    visitedAt: ts("visited_at").notNull().defaultNow(),
    ipHash: text("ip_hash"),
    country: text("country"),
    city: text("city"),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    action: text("action").notNull().default("view"),
  },
  (t) => [index("visits_link_idx").on(t.linkId, t.visitedAt)],
);

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: id(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    s3UploadId: text("s3_upload_id").notNull(),
    parts: jsonb("parts").notNull().default([]),
    expectedSize: bytes("expected_size").notNull(),
    partSize: integer("part_size").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ...stamps(),
  },
  (t) => [index("upload_node_idx").on(t.nodeId), index("upload_expires_idx").on(t.expiresAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    ...stamps(),
  },
  (t) => [
    index("audit_tenant_idx").on(t.tenantId, t.createdAt),
    index("audit_actor_idx").on(t.actorId),
    index("audit_action_idx").on(t.action),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("prt_user_idx").on(t.userId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  lastRunAt: ts("last_run_at"),
  lastStatus: text("last_status"),
  lastResult: jsonb("last_result"),
});
