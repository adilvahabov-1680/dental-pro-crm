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

  // Лого клиники (сессия 81) / аватар пользователя (сессия 83) — эти
  // API-маршруты сами решают авторизацию и возвращают JSON 403/404 (см.
  // app/api/clinic-logo/[clinicId]/route.ts, app/api/user-avatar/[userId]/route.ts).
  // Редирект на /login здесь недопустим: маршруты читаются через <img src>
  // и анонимные/curl-запросы должны получать корректный статус, а не html.
  if (pathname.startsWith("/api/clinic-logo/") || pathname.startsWith("/api/user-avatar/")) {
    return NextResponse.next();
  }

  // Patient response links (сессия 41) — публичный, без логина, доступ только
  // по уникальному token. Намеренно не через PUBLIC_PATHS: та логика также
  // редиректит залогиненных пользователей на /dashboard, что здесь не нужно
  // (staff должен мочь открыть/проверить ссылку, не выходя из сессии).
  if (pathname === "/r" || pathname.startsWith("/r/")) {
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
