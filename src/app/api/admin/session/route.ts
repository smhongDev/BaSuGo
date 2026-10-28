import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  adminConfigured,
  checkCredentials,
  clientIp,
  cookieOptions,
  isAdmin,
  makeToken,
  rateLimited,
} from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** 로그인 상태 */
export async function GET() {
  return Response.json({ configured: adminConfigured(), loggedIn: await isAdmin() });
}

/** 로그인: { user, password } — IP당 10분에 5번까지 */
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return Response.json({ error: "서버에 관리자 비밀번호(ADMIN_PASSWORD)가 설정되지 않았습니다." }, { status: 503 });
  }
  if (rateLimited(`login:${clientIp(req)}`, 5, 10 * 60_000)) {
    return Response.json({ error: "로그인 시도가 너무 많습니다. 10분 뒤에 다시 시도해 주세요." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { user?: unknown; password?: unknown } | null;
  const user = String(body?.user ?? "").slice(0, 100);
  const password = String(body?.password ?? "").slice(0, 200);
  if (!checkCredentials(user, password)) {
    return Response.json({ error: "아이디 또는 비밀번호가 맞지 않습니다." }, { status: 401 });
  }
  (await cookies()).set(ADMIN_COOKIE, makeToken(), cookieOptions);
  return Response.json({ ok: true });
}

/** 로그아웃 */
export async function DELETE() {
  (await cookies()).delete(ADMIN_COOKIE);
  return Response.json({ ok: true });
}
