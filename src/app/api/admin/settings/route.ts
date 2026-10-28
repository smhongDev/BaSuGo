import { isAdmin, unauthorized } from "@/lib/server/admin";
import { getSettings, saveSettings, THRESHOLD_LIMITS, validateThresholds } from "@/lib/server/settings";
import { THRESHOLDS } from "@/lib/score";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json({ ...(await getSettings()), defaults: THRESHOLDS, limits: THRESHOLD_LIMITS });
}

/** { banner?: {enabled,text,level}, thresholds?: {...} } */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = (await req.json().catch(() => null)) as { banner?: unknown; thresholds?: unknown } | null;
  if (!body) return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const patch: Parameters<typeof saveSettings>[0] = {};
  if (body.thresholds !== undefined) {
    const v = validateThresholds(body.thresholds);
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
    patch.thresholds = v.value;
  }
  if (body.banner && typeof body.banner === "object") patch.banner = body.banner as Parameters<typeof saveSettings>[0]["banner"];
  return Response.json(await saveSettings(patch));
}
