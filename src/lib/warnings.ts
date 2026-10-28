import { coastPointsByDistance, nearestCoastPoint, type CoastPoint } from "./regions.ts";
import { maybeInland } from "./water.ts";
import { dataGoKrKey, fetchDataGoKr } from "./datagokr.ts";

/** 바다수영과 관련 있는 특보 종류만 본다 (건조·황사 등은 뺀다) */
const RELEVANT = ["풍랑", "강풍", "호우", "태풍", "폭풍해일", "지진해일", "폭염", "한파", "대설"];

export type AlertLevel = "경보" | "주의보" | "예비특보";

export type WeatherAlert = {
  /** 예: "풍랑주의보", "강풍 예비특보" */
  kind: string;
  level: AlertLevel;
  /** exact: 그 지역·바다가 직접 포함 / province: 같은 시·도의 다른 곳 */
  match: "exact" | "province";
  /** 특보 문구 중 해당 부분 (예: "강원도(강릉시평지, 동해시평지)") */
  areas: string;
};

export type WarningsResult = {
  /** 특보 정보를 실제로 받아왔는가 (키가 없거나 실패하면 false) */
  available: boolean;
  source: string;
  /** 발표 시각 "YYYY-MM-DD HH:mm" */
  issuedAt: string | null;
  /** 매칭에 쓴 해안 기준점 이름 (내륙·먼 바다면 null) */
  region: string | null;
  /** 가까운 해안이 없어 더 먼 해안 기준점을 쓴 경우의 안내 */
  regionNote?: string;
  alerts: WeatherAlert[];
  message?: string;
};

export type PwnStatus = { tmFc: string | null; t6: string; t7: string };

const norm = (s: string) => s.replace(/\s+/g, "").replace(/[.ㆍ]/g, "·");

function levelOf(kind: string): AlertLevel {
  if (kind.includes("예비")) return "예비특보";
  return kind.includes("경보") ? "경보" : "주의보";
}

/** 특보 문구 한 줄("o 풍랑주의보 : 동해중부앞바다, 강원도(강릉시평지)")을 [종류, 지역] 으로 나눈다. */
export function splitLines(text: string): { kind: string; regions: string }[] {
  const out: { kind: string; regions: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(o|ㅇ|\(\d+\)|-)\s*/, "").trim();
    const m = line.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (!m) continue;
    // 예비특보는 "강풍 예비특보 : 10월 29일 새벽 : 강원도(...)" 처럼 시각이 끼어 있을 수 있다
    const parts = m[2].split(/\s:\s/);
    const regions = parts[parts.length - 1];
    out.push({ kind: m[1].replace(/\s+/g, " ").trim(), regions });
  }
  return out;
}

/** 지역 문구에서 이 기준점과 관련된 부분을 찾는다. */
export function matchRegions(regions: string, point: CoastPoint): { match: "exact" | "province"; areas: string } | null {
  const text = norm(regions);
  const sea = point.seas.find((s) => text.includes(norm(s)));
  if (sea) return { match: "exact", areas: sea };

  // "강원도(강릉시평지, 동해시평지)" 또는 괄호 없이 "부산"
  const groups = regions.split(/,(?![^()]*\))/).map((g) => g.trim()).filter(Boolean);
  let province: string | null = null;
  for (const g of groups) {
    const m = g.match(/^([^()]+?)\s*(?:\(([^)]*)\))?$/);
    if (!m) continue;
    const head = norm(m[1]);
    const inner = m[2] ? norm(m[2]) : null;
    const isProvince = point.province.some((p) => head === norm(p) || head.startsWith(norm(p)));
    if (!isProvince) continue;
    if (inner === null) return { match: "exact", areas: g };
    if (point.cities.some((c) => inner.includes(norm(c)))) return { match: "exact", areas: g };
    province = g;
  }
  return province ? { match: "province", areas: province } : null;
}

/** landOnly: 내륙 물가라 바다 구역 특보(풍랑 등 앞바다·먼바다)는 빼고 육상 특보만 본다 */
export function alertsFor(status: PwnStatus, point: CoastPoint, landOnly = false): WeatherAlert[] {
  const out: WeatherAlert[] = [];
  for (const { kind, regions } of [...splitLines(status.t6), ...splitLines(status.t7)]) {
    if (!RELEVANT.some((r) => kind.includes(r))) continue;
    const hit = matchRegions(regions, landOnly ? { ...point, seas: [] } : point);
    if (hit) out.push({ kind, level: levelOf(kind), ...hit });
  }
  // 직접 해당 → 경보 → 주의보 → 예비특보 순
  const rank = (a: WeatherAlert) => (a.match === "exact" ? 0 : 10) + ["경보", "주의보", "예비특보"].indexOf(a.level);
  return out.sort((a, b) => rank(a) - rank(b));
}

export function formatTmFc(tmFc: string | number | null | undefined): string | null {
  const s = tmFc == null ? "" : String(tmFc);
  if (!/^\d{12}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

const SOURCE = "기상청 기상특보 (공공데이터포털)";
const MOCK_STATUS: PwnStatus = {
  tmFc: "202610281000",
  t6: "o 풍랑주의보 : 동해중부앞바다, 남해동부앞바다(부산앞바다, 거제시동부앞바다)\no 강풍주의보 : 강원도(강릉시평지, 속초시평지), 부산\no 건조주의보 : 경상북도(포항)",
  t7: "(1) 강풍 예비특보 : 10월 29일 새벽(00시~06시) : 제주도(제주도북부, 제주도동부)",
};

let cache: { at: number; status: PwnStatus } | null = null;
let lastError: string | null = null;
const CACHE_MS = 10 * 60_000;

/** 기상청 특보 현황(getPwnStatus). 10분 동안 메모리에 둔다. */
export async function fetchPwnStatus(): Promise<PwnStatus> {
  if (process.env.BASUGO_MOCK === "1") return MOCK_STATUS;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.status;
  try {
    const items = await fetchDataGoKr<{ tmFc?: string | number; t6?: string; t7?: string }>(
      "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus",
      { numOfRows: "10", pageNo: "1", dataType: "JSON" },
    );
    const first = items[0] ?? {};
    const status: PwnStatus = { tmFc: first.tmFc == null ? null : String(first.tmFc), t6: first.t6 ?? "", t7: first.t7 ?? "" };
    cache = { at: Date.now(), status };
    lastError = null;
    return status;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

export function warningsLastError(): string | null {
  return lastError;
}

export async function getWarnings(lat: number, lng: number): Promise<WarningsResult> {
  // 해안에서 먼 곳이면 가장 가까운 해안(120km 안)의 특보 구역을 대신 보여 준다
  const exact = nearestCoastPoint(lat, lng);
  const near = exact ?? coastPointsByDistance(lat, lng, 1)[0] ?? null;
  const base = {
    source: SOURCE,
    region: near?.item.name ?? null,
    regionNote:
      near && !exact ? `선택한 곳은 해안에서 멀어서, 가장 가까운 해안인 ‘${near.item.name}’(약 ${Math.round(near.km)}km) 기준 특보예요.` : undefined,
  };
  if (process.env.BASUGO_MOCK !== "1" && !dataGoKrKey()) {
    return { ...base, available: false, issuedAt: null, alerts: [], message: "기상특보 연동이 아직 설정되지 않았어요." };
  }
  try {
    const status = await fetchPwnStatus();
    return {
      ...base,
      available: true,
      issuedAt: formatTmFc(status.tmFc),
      alerts: near ? alertsFor(status, near.item, maybeInland(lat, lng)) : [],
      message: near ? undefined : "해안에서 멀어 특보 구역을 정하지 못했어요.",
    };
  } catch {
    return { ...base, available: false, issuedAt: null, alerts: [], message: "기상특보를 가져오지 못했어요." };
  }
}
