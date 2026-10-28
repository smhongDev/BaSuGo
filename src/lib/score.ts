import type { SeaRegion } from "./regions.ts";
import type { Rating } from "./types.ts";

export type Thresholds = {
  windGood: number;
  windCaution: number;
  waveGood: number;
  waveCaution: number;
  precipGood: number;
  precipCaution: number;
  seaTempMin: number;
  /** 사리 때 점수에서 빼는 값 (바다별). 0이면 사리를 판정에서 뺀다 */
  sariWest: number;
  sariSouth: number;
  sariEast: number;
};

/** "바수 가능한 날" 기본 기준 (기획서에 없어 정한 값. 운영 중에는 관리자 화면에서 바꾼 값이 우선한다) */
export const THRESHOLDS: Thresholds = {
  windGood: 5, // m/s
  windCaution: 8,
  waveGood: 0.5, // m
  waveCaution: 1.0,
  precipGood: 1, // mm
  precipCaution: 5,
  seaTempMin: 16, // ℃ 아래는 주의
  // 사리 영향: 조차가 큰 서해가 가장 크고, 남해는 중간, 조차가 작은 동해는 판정에서 뺀다
  sariWest: 20,
  sariSouth: 8,
  sariEast: 0,
};

const SARI_KEY: Record<SeaRegion, "sariWest" | "sariSouth" | "sariEast"> = { west: "sariWest", south: "sariSouth", east: "sariEast" };

export type RateInput = {
  windMax: number | null;
  waveMax: number | null;
  precipSum: number | null;
  seaTemp: number | null;
  sari: boolean;
  /** 어느 바다인가 (사리 무게가 다르다). 모르면 남해 기준 */
  sea?: SeaRegion | null;
};

export function rateDay(
  input: RateInput,
  t: Thresholds = THRESHOLDS,
): { rating: Rating; score: number; reasons: string[]; reasonTags: string[] } {
  let score = 100;
  let worst: Rating = "good";
  // 불가 이유를 먼저, 그다음 주의 이유
  const found: { level: Rating; text: string; tag: string }[] = [];
  let level: Rating = "good";
  const bump = (r: Rating) => {
    level = r;
    if (r === "bad" || (r === "caution" && worst === "good")) worst = r;
  };
  /** 바로 앞의 bump() 수준으로 이유를 남긴다 (긴 문장 + 달력용 짧은 표시) */
  const add = (text: string, tag: string) => found.push({ level, text, tag });

  const { windMax, waveMax, precipSum, seaTemp } = input;
  if (windMax !== null) {
    if (windMax > t.windCaution) {
      bump("bad");
      score -= 50;
      add(`바람이 강해요 (최대 ${windMax.toFixed(1)}m/s)`, `강풍 ${windMax.toFixed(1)}m/s`);
    } else if (windMax > t.windGood) {
      bump("caution");
      score -= 20 + (windMax - t.windGood) * 4;
      add(`바람이 다소 있어요 (최대 ${windMax.toFixed(1)}m/s)`, `바람 ${windMax.toFixed(1)}m/s`);
    } else {
      score -= windMax * 2;
    }
  }
  if (waveMax !== null) {
    if (waveMax > t.waveCaution) {
      bump("bad");
      score -= 50;
      add(`파도가 높아요 (최대 ${waveMax.toFixed(1)}m)`, `높은 파도 ${waveMax.toFixed(1)}m`);
    } else if (waveMax > t.waveGood) {
      bump("caution");
      score -= 20;
      add(`파도가 있어요 (최대 ${waveMax.toFixed(1)}m)`, `파도 ${waveMax.toFixed(1)}m`);
    } else {
      score -= waveMax * 10;
    }
  }
  if (precipSum !== null) {
    if (precipSum >= t.precipCaution) {
      bump("bad");
      score -= 35;
      add(`비가 많이 와요 (${precipSum.toFixed(1)}mm)`, `많은 비 ${precipSum.toFixed(1)}mm`);
    } else if (precipSum >= t.precipGood) {
      bump("caution");
      score -= 15;
      add(`비 소식이 있어요 (${precipSum.toFixed(1)}mm)`, `비 ${precipSum.toFixed(1)}mm`);
    }
  }
  if (seaTemp !== null && seaTemp < t.seaTempMin) {
    bump("caution");
    score -= 15;
    add(`수온이 낮아요 (${seaTemp.toFixed(1)}℃)`, `낮은 수온 ${seaTemp.toFixed(0)}℃`);
  }
  const sariPenalty = t[SARI_KEY[input.sea ?? "south"]];
  if (input.sari && sariPenalty > 0) {
    bump("caution");
    score -= sariPenalty;
    if (input.sea === "west") add("사리 기간이라 물이 많이 들고 빠지고 조류가 빨라요 (서해)", "사리(서해 큰 조차)");
    else add("사리 기간이라 조류가 빨라요", "사리(빠른 조류)");
  }
  found.sort((a, b) => (a.level === b.level ? 0 : a.level === "bad" ? -1 : 1));
  return {
    rating: worst,
    score: Math.max(0, Math.round(score)),
    reasons:
      found.length > 0 ? found.map((f) => f.text) : [waveMax === null ? "바람·비 모두 잔잔해요" : "바람·파도·비 모두 잔잔해요"],
    reasonTags: found.map((f) => f.tag),
  };
}

export const RATING_LABEL: Record<Rating, string> = {
  good: "가능",
  caution: "주의",
  bad: "불가",
  unknown: "예보 없음",
};
