import { isAdmin, unauthorized } from "@/lib/server/admin";
import { dataGoKrKey } from "@/lib/datagokr";
import { fetchKhoaTides } from "@/lib/khoa";
import { fetchSources } from "@/lib/forecast";
import { kstToday } from "@/lib/dates";
import { pushStats } from "@/lib/server/push";
import { stateDir } from "@/lib/server/state";
import { fetchPwnStatus, formatTmFc, splitLines } from "@/lib/warnings";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

async function check(name: string, fn: () => Promise<string>): Promise<Check> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** 데이터 출처 상태 + 알림 구독 현황. 부산(해운대) 기준으로 실제 호출해 본다. */
export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const today = kstToday();
  const hasKey = Boolean(dataGoKrKey());

  const checks = await Promise.all([
    check("Open-Meteo 날씨·바다 예보", async () => {
      const s = await fetchSources(35.1587, 129.1604, [today]);
      if (!s.weather) throw new Error("예보 없음");
      return `정상 (오늘 최대풍속 ${s.weather.wind_speed_10m_max[0] ?? "-"}m/s, 바다 ${s.marine ? "정상" : "실패"})`;
    }),
    hasKey
      ? check("기상청 기상특보", async () => {
          const st = await fetchPwnStatus();
          const n = splitLines(st.t6).length;
          return `정상 (발표 ${formatTmFc(st.tmFc) ?? "-"}, 발효 중 ${n}건)`;
        })
      : Promise.resolve({ name: "기상청 기상특보", ok: false, detail: "DATA_GO_KR_KEY 미설정" }),
    hasKey
      ? check("국립해양조사원 조석예보", async () => {
          const r = await fetchKhoaTides(35.1587, 129.1604, [today]);
          if (!r) throw new Error("응답에 만조·간조가 없습니다");
          const td = r.events.filter((e) => e.time.startsWith(today));
          return `정상 (${r.station.name}: ${td.map((e) => `${e.type === "high" ? "만조" : "간조"} ${e.time.slice(11)}`).join(", ")})`;
        })
      : Promise.resolve({ name: "국립해양조사원 조석예보", ok: false, detail: "DATA_GO_KR_KEY 미설정 (Open-Meteo 해수면 계산 사용 중)" }),
  ]);

  return Response.json({
    checks,
    push: await pushStats(),
    alertTimer: Boolean(process.env.ALERT_SECRET),
    stateDir: stateDir(),
    mock: process.env.BASUGO_MOCK === "1",
  });
}
