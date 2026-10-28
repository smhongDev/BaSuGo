import type { TideEvent, TideFlow } from "./types.ts";

/** "YYYY-MM-DDTHH:mm"(한국 벽시계 시각)에 분을 더한다. */
function addMinutes(local: string, minutes: number): string {
  const ms = Date.parse(`${local}:00Z`) + Math.round(minutes) * 60_000;
  return new Date(ms).toISOString().slice(0, 16);
}

/**
 * 1시간 간격 해수면 높이에서 만조·간조를 찾는다.
 * 극값 주변 세 점에 포물선을 맞춰 시각을 분 단위로 보정한다.
 */
export function extractTides(times: string[], heights: (number | null)[]): TideEvent[] {
  const out: TideEvent[] = [];
  for (let i = 1; i < heights.length - 1; i++) {
    const a = heights[i - 1];
    const b = heights[i];
    const c = heights[i + 1];
    if (a == null || b == null || c == null) continue;
    const high = b > a && b >= c;
    const low = b < a && b <= c;
    if (!high && !low) continue;
    const denom = a - 2 * b + c;
    const offsetHours = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    const height = denom === 0 ? b : b - (a - c) ** 2 / (8 * denom);
    out.push({
      type: high ? "high" : "low",
      time: addMinutes(times[i], offsetHours * 60),
      height: Math.round(height * 100) / 100,
    });
  }
  return out;
}

export function tidesForDay(events: TideEvent[], date: string): TideEvent[] {
  return events.filter((e) => e.time.startsWith(date));
}

/** 하루와 겹치는 밀물(간조→만조)·썰물(만조→간조) 구간 */
export function flowsForDay(events: TideEvent[], date: string): TideFlow[] {
  const flows: TideFlow[] = [];
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (a.type === b.type) continue;
    if (!a.time.startsWith(date) && !b.time.startsWith(date)) continue;
    flows.push({ kind: a.type === "low" ? "flood" : "ebb", from: a.time, to: b.time });
  }
  return flows;
}

export function hhmm(local: string): string {
  return local.slice(11, 16);
}
