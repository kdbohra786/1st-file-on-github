import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { db: false, s3: false };
  try {
    await getSql()`SELECT 1`;
    checks.db = true;
  } catch {}
  try {
    checks.s3 = await getStorage().ping();
  } catch {}
  const ok = checks.db && checks.s3;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, version: process.env.APP_VERSION ?? "0.1.0" },
    { status: ok ? 200 : 503 },
  );
}
