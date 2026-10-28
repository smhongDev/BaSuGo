import { checkAlertSecret, isAdmin, unauthorized } from "@/lib/server/admin";
import { runAlerts } from "@/lib/server/push";

export const dynamic = "force-dynamic";

/** 알림 검사 실행: 서버 타이머(x-alert-secret) 또는 관리자 화면에서 부른다. */
export async function POST(req: Request) {
  if (!checkAlertSecret(req) && !(await isAdmin())) return unauthorized();
  try {
    return Response.json(await runAlerts());
  } catch (e) {
    console.error("alerts run failed", e);
    return Response.json({ error: "알림 검사에 실패했습니다." }, { status: 500 });
  }
}
