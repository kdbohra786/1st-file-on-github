import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/auth/rate-limit";
import { ApiError, handle } from "@/server/errors";
import { noStore, requirePublicLink } from "@/server/public-request";
import { checkLinkPassword, makeUnlockCookie } from "@/server/shares";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { link, info } = await requirePublicLink(req, token, { needUnlock: false });
    // Brute-force guard per link and per client.
    if (
      !(await rateLimit(`sharepw:${link.id}`, 20, 900)) ||
      !(await rateLimit(`sharepw:${link.id}:${info.ip ?? "?"}`, 6, 900))
    ) {
      throw new ApiError(429, "rate_limited", "Too many password attempts. Try again in a few minutes.");
    }
    const { password } = z.object({ password: z.string().max(256) }).parse(await req.json());
    if (!(await checkLinkPassword(link, password))) throw new ApiError(403, "wrong_password", "Incorrect password");
    const c = makeUnlockCookie(link.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(c.name, c.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.url.startsWith("https:"),
      maxAge: c.maxAge,
      path: "/",
    });
    return noStore(res);
  } catch (e) {
    return noStore(handle(e));
  }
}
