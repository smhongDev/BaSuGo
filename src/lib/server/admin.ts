import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 관리자 로그인: 아이디·비밀번호는 서버 설정 파일(/etc/basugo/env)의 ADMIN_USER·ADMIN_PASSWORD.
 * 로그인하면 서명한 쿠키(만료 시각 + HMAC)를 준다. 비밀번호를 바꾸면 기존 로그인은 모두 풀린다.
 */
export const ADMIN_COOKIE = "basugo_admin";
const SESSION_SECONDS = 12 * 3600;

const sha = (s: string) => createHash("sha256").update(s).digest();

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8);
}

function sessionKey(): Buffer {
  return sha(`basugo-admin-session|${process.env.ADMIN_PASSWORD ?? ""}|${process.env.ALERT_SECRET ?? ""}`);
}

export function checkCredentials(user: string, password: string): boolean {
  if (!adminConfigured()) return false;
  const okUser = timingSafeEqual(sha(user), sha(process.env.ADMIN_USER || "admin"));
  const okPass = timingSafeEqual(sha(password), sha(process.env.ADMIN_PASSWORD!));
  return okUser && okPass;
}

export function makeToken(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const sig = createHmac("sha256", sessionKey()).update(String(exp)).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !adminConfigured()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const want = createHmac("sha256", sessionKey()).update(exp).digest();
  const got = Buffer.from(sig, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function isAdmin(): Promise<boolean> {
  return verifyToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};

export function unauthorized() {
  return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
}

/** 단순 횟수 제한 (프로세스 메모리 기준) */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  h.n++;
  return h.n > max;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** 타이머(systemd)가 알림 검사를 부를 때 쓰는 비밀값 확인 */
export function checkAlertSecret(req: Request): boolean {
  const want = process.env.ALERT_SECRET;
  const got = req.headers.get("x-alert-secret");
  if (!want || want.length < 16 || !got) return false;
  return timingSafeEqual(sha(got), sha(want));
}
