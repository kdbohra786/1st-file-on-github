import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/auth/rate-limit";
import { ApiError } from "./errors";
import { isUnlocked, resolveLink, unlockCookieName } from "./shares";

export function reqInfo(req: Request) {
  const h = req.headers;
  return {
    ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    referrer: h.get("referer"),
    country: h.get("cf-ipcountry"),
  };
}

export function cookieValue(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  return raw
    .split(/;\s*/)
    .map((c) => c.split("="))
    .find(([k]) => k === name)?.[1];
}

/** Resolves a public link and enforces state, rate limit and the password gate. Throws ApiError otherwise. */
export async function requirePublicLink(req: Request, token: string, opts: { needUnlock: boolean }) {
  z.string().min(20).max(100).parse(token);
  const info = reqInfo(req);
  if (!(await rateLimit(`public:${info.ip ?? "?"}`, 240, 60)))
    throw new ApiError(429, "rate_limited", "Too many requests");
  const r = await resolveLink(token);
  if (!r) throw new ApiError(404, "not_found", "This link does not exist");
  const messages: Record<string, [number, string]> = {
    revoked: [410, "This link has been revoked"],
    expired: [410, "This link has expired"],
    limit_reached: [410, "This link has reached its download limit"],
    unavailable: [404, "This content is no longer available"],
  };
  if (r.state !== "ok") throw new ApiError(messages[r.state][0], r.state, messages[r.state][1]);
  if (opts.needUnlock && !isUnlocked(r.link, cookieValue(req, unlockCookieName(r.link.id))))
    throw new ApiError(401, "password_required", "Password required");
  return { ...r, info };
}

export const noStore = (res: NextResponse) => {
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
};
