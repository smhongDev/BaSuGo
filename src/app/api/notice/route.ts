import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** 사이트 공지 배너 (관리자 화면에서 작성) */
export async function GET() {
  const { banner } = await getSettings();
  return Response.json(banner.enabled ? { text: banner.text, level: banner.level } : { text: null });
}
