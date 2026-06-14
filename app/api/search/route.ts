/**
 * Global search v1 (сессия 16). GET /api/search?q=...
 * Авторизация — getCurrentUser; clinicId/permissions/scope — внутри globalSearch.
 * Запрос короче SEARCH_MIN_LENGTH или без сессии → пустой результат (без утечки).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { globalSearch } from "@/lib/search";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const result = await globalSearch(user, q);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
