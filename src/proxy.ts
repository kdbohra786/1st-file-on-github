import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { homeFor } from "@/lib/routes";

const PANEL: Record<string, string[]> = {
  "/admin": ["SUPER_ADMIN"],
  "/company": ["COMPANY_ADMIN"],
  "/app": ["COMPANY_ADMIN", "MEMBER", "INDIVIDUAL"],
};

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/change-password") {
    return req.auth?.user ? NextResponse.next() : NextResponse.redirect(new URL("/login", req.url));
  }
  const panel = Object.keys(PANEL).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!panel) return NextResponse.next();
  const user = req.auth?.user;
  if (!user) return NextResponse.redirect(new URL(`/login?from=${encodeURIComponent(pathname)}`, req.url));
  if (user.mustChangePassword && pathname !== "/change-password")
    return NextResponse.redirect(new URL("/change-password", req.url));
  if (!PANEL[panel].includes(user.role)) return NextResponse.redirect(new URL(homeFor(user.role), req.url));
  return NextResponse.next();
});

export const config = { matcher: ["/change-password", "/admin/:path*", "/company/:path*", "/app/:path*"] };
