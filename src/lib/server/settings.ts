import { THRESHOLDS, type Thresholds } from "../score.ts";
import { readJson, updateJson } from "./state.ts";

export type Banner = { enabled: boolean; text: string; level: "info" | "warning"; updatedAt: string | null };

export type Settings = { banner: Banner; thresholds: Thresholds };

const FILE = "settings.json";
const DEFAULTS: Settings = {
  banner: { enabled: false, text: "", level: "info", updatedAt: null },
  thresholds: THRESHOLDS,
};

/** 관리자 화면에서 넣을 수 있는 범위 */
export const THRESHOLD_LIMITS: Record<keyof Thresholds, [number, number]> = {
  windGood: [0, 30],
  windCaution: [0, 40],
  waveGood: [0, 5],
  waveCaution: [0, 10],
  precipGood: [0, 100],
  precipCaution: [0, 300],
  seaTempMin: [0, 35],
};

let cache: { at: number; value: Settings } | null = null;
const CACHE_MS = 15_000;

function merge(raw: Partial<Settings>): Settings {
  return {
    banner: { ...DEFAULTS.banner, ...(raw.banner ?? {}) },
    thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds ?? {}) },
  };
}

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = merge(await readJson<Partial<Settings>>(FILE, {}));
  cache = { at: Date.now(), value };
  return value;
}

/** 값이 범위 밖이거나 '좋음'이 '주의'보다 크면 오류 문장을 돌려준다. */
export function validateThresholds(input: unknown): { ok: true; value: Thresholds } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "기준값이 없습니다." };
  const src = input as Record<string, unknown>;
  const out = {} as Thresholds;
  for (const k of Object.keys(THRESHOLD_LIMITS) as (keyof Thresholds)[]) {
    const v = Number(src[k]);
    const [min, max] = THRESHOLD_LIMITS[k];
    if (!Number.isFinite(v) || v < min || v > max) return { ok: false, error: `${k} 값은 ${min}~${max} 사이여야 합니다.` };
    out[k] = Math.round(v * 10) / 10;
  }
  if (out.windGood > out.windCaution) return { ok: false, error: "풍속: '가능' 기준이 '주의' 기준보다 클 수 없습니다." };
  if (out.waveGood > out.waveCaution) return { ok: false, error: "파고: '가능' 기준이 '주의' 기준보다 클 수 없습니다." };
  if (out.precipGood > out.precipCaution) return { ok: false, error: "강수: '가능' 기준이 '주의' 기준보다 클 수 없습니다." };
  return { ok: true, value: out };
}

export async function saveSettings(patch: { banner?: Partial<Banner>; thresholds?: Thresholds }): Promise<Settings> {
  const saved = await updateJson<Partial<Settings>>(FILE, {}, (cur) => {
    const m = merge(cur);
    if (patch.banner) {
      const text = String(patch.banner.text ?? m.banner.text).slice(0, 300);
      m.banner = {
        enabled: Boolean(patch.banner.enabled ?? m.banner.enabled) && text.trim().length > 0,
        text,
        level: patch.banner.level === "warning" ? "warning" : "info",
        updatedAt: new Date().toISOString(),
      };
    }
    if (patch.thresholds) m.thresholds = patch.thresholds;
    return m;
  });
  cache = null;
  return merge(saved);
}
