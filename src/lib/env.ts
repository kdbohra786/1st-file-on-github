import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT_INTERNAL: z.string().url(),
  S3_ENDPOINT_PUBLIC: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ADMIN_ACCESS_KEY: z.string().min(1),
  S3_ADMIN_SECRET_KEY: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars (npm run gen:secrets)"),
  METRICS_TOKEN: z.string().min(8),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("Infinitive Cloud Bucket <no-reply@localhost>"),
  SEED_SUPERADMIN_EMAIL: z.string().email().default("superadmin@infinitivecloud.com"),
  SEED_SUPERADMIN_PASSWORD: z.string().min(10).default("Super@Bucket#2026"),
  SEED_DEMO: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validates process.env once; throws a readable error listing every problem. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
