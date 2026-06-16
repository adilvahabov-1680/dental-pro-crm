/**
 * Route protection (первый слой; второй — requireAuth в layout).
 * Edge runtime: импортируем только lib/session.ts (jose), НЕ prisma.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Health checks — без авторизации, для reverse proxy / monitoring.
  if (pathname === "/api/health" || pathname === "/api/health/db") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // всё, кроме статики и файлов с расширением
  matcher: ["/((?!_next|favicon\\.ico|.*\\..*).*)"],
};
