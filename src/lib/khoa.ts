import { addDays } from "./dates.ts";
import { dataGoKrKey, fetchDataGoKr } from "./datagokr.ts";
import { nearestTideStation, type TideStation } from "./regions.ts";
import type { TideEvent } from "./types.ts";

/** 국립해양조사원 조석예보(고·저조) — 공공데이터포털 */
const ENDPOINT = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

type RawItem = Record<string, string | number | null | undefined>;

const pick = (it: RawItem, keys: string[]) => {
  for (const k of keys) if (it[k] != null && it[k] !== "") return it[k];
  return undefined;
};

/**
 * 응답 항목을 만조·간조 목록으로 바꾼다. 필드 이름이 바뀌어도 버티도록 여러 이름을 본다.
 * 고조/저조 구분 값이 없으면 앞뒤 높이와 비교해서 정한다.
 */
export function parseKhoaItems(items: RawItem[]): TideEvent[] {
  const rows = items
    .map((it) => {
      const t = String(pick(it, ["predcDt", "predcDtm", "tph_time", "predcTm"]) ?? "");
      const m = t.match(/(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2}):?(\d{2})/);
      const h = Number(pick(it, ["predcTdlvVl", "tph_level", "tdlvVl"]));
      if (!m || !Number.isFinite(h)) return null;
      const label = String(pick(it, ["hl_code", "extrSeNm", "tdlvSeNm"]) ?? "");
      return {
        time: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`,
        height: Math.round(h) / 100, // cm → m
        hint: label.includes("고") ? "high" : label.includes("저") ? "low" : null,
      };
    })
    .filter((r): r is { time: string; height: number; hint: "high" | "low" | null } => r !== null)
    .sort((a, b) => (a.time < b.time ? -1 : 1));

  return rows
    .filter((r, i) => i === 0 || r.time !== rows[i - 1].time)
    .map((r, i, arr) => {
      let type = r.hint;
      if (!type) {
        const nb = [arr[i - 1], arr[i + 1]].filter(Boolean).map((x) => x!.height);
        const avg = nb.reduce((a, b) => a + b, 0) / (nb.length || 1);
        type = r.height >= avg ? "high" : "low";
      }
      return { type, time: r.time, height: r.height };
    });
}

const memo = new Map<string, { at: number; events: TideEvent[] }>();
const MEMO_MS = 6 * 3600_000;

async function fetchDay(station: TideStation, date: string): Promise<TideEvent[]> {
  const key = `${station.code}|${date}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.events;
  const items = await fetchDataGoKr<RawItem>(
    ENDPOINT,
    { obsCode: station.code, reqDate: date.replaceAll("-", ""), type: "json", numOfRows: "20", pageNo: "1" },
    6 * 3600,
  );
  const events = parseKhoaItems(items).filter((e) => e.time.startsWith(date));
  memo.set(key, { at: Date.now(), events });
  if (memo.size > 5000) memo.clear();
  return events;
}

export type KhoaTides = { station: TideStation; events: TideEvent[] };

/** 해안 가까운 위치면 가장 가까운 관측소의 조석예보를 받는다. 키가 없거나 멀면 null. */
export async function fetchKhoaTides(lat: number, lng: number, dates: string[]): Promise<KhoaTides | null> {
  if (!dataGoKrKey() || dates.length === 0) return null;
  const near = nearestTideStation(lat, lng);
  if (!near) return null;
  // 밀물·썰물 구간을 위해 앞뒤 하루씩 더 받는다
  const all = [addDays(dates[0], -1), ...dates, addDays(dates[dates.length - 1], 1)];
  const perDay = await Promise.all(all.map((d) => fetchDay(near.item, d)));
  const events = perDay.flat();
  if (events.length === 0) return null;
  return { station: near.item, events };
}
