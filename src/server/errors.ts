import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const notFound = () => new ApiError(404, "not_found", "Not found");
export const forbidden = () => new ApiError(403, "forbidden", "You do not have permission to do that");

export function handle(e: unknown) {
  if (e instanceof ApiError)
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Invalid input", issues: e.issues } },
      { status: 400 },
    );
  }
  logger.error({ err: e instanceof Error ? e.message : String(e) }, "unhandled api error");
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}
