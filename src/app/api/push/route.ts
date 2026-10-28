import { clientIp, rateLimited } from "@/lib/server/admin";
import { isAllowedEndpoint, removeSubscription, saveSubscription, vapidKeys } from "@/lib/server/push";

export const dynamic = "force-dynamic";

/** 브라우저가 구독할 때 쓰는 공개키 */
export async function GET() {
  try {
    return Response.json({ publicKey: (await vapidKeys()).publicKey });
  } catch (e) {
    console.error("vapid failed", e);
    return Response.json({ error: "알림 기능을 준비하지 못했어요." }, { status: 503 });
  }
}

/** 구독 저장·갱신: { subscription, trips } (일정이 바뀔 때마다 다시 보낸다) */
export async function POST(req: Request) {
  if (rateLimited(`push:${clientIp(req)}`, 60, 10 * 60_000)) {
    return Response.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { subscription?: unknown; trips?: unknown } | null;
  if (!body) return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  const r = await saveSubscription(body.subscription, body.trips);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

/** 구독 해지: { endpoint } */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = String(body?.endpoint ?? "");
  if (!isAllowedEndpoint(endpoint)) return Response.json({ error: "구독 정보가 올바르지 않아요." }, { status: 400 });
  await removeSubscription(endpoint);
  return Response.json({ ok: true });
}
