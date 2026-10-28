import type { Rating } from "./types.ts";

export type Thresholds = {
  windGood: number;
  windCaution: number;
  waveGood: number;
  waveCaution: number;
  precipGood: number;
  precipCaution: number;
  seaTempMin: number;
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
};

export type RateInput = {
  windMax: number | null;
  waveMax: number | null;
  precipSum: number | null;
  seaTemp: number | null;
  sari: boolean;
};

export function rateDay(
  input: RateInput,
  t: Thresholds = THRESHOLDS,
): { rating: Rating; score: number; reasons: string[] } {
  let score = 100;
  let worst: Rating = "good";
  const reasons: string[] = [];
  const bump = (r: Rating) => {
    if (r === "bad" || (r === "caution" && worst === "good")) worst = r;
  };

  const { windMax, waveMax, precipSum, seaTemp } = input;
  if (windMax !== null) {
    if (windMax > t.windCaution) {
      bump("bad");
      score -= 50;
      reasons.push(`바람이 강해요 (최대 ${windMax.toFixed(1)}m/s)`);
    } else if (windMax > t.windGood) {
      bump("caution");
      score -= 20 + (windMax - t.windGood) * 4;
      reasons.push(`바람이 다소 있어요 (최대 ${windMax.toFixed(1)}m/s)`);
    } else {
      score -= windMax * 2;
    }
  }
  if (waveMax !== null) {
    if (waveMax > t.waveCaution) {
      bump("bad");
      score -= 50;
      reasons.push(`파도가 높아요 (최대 ${waveMax.toFixed(1)}m)`);
    } else if (waveMax > t.waveGood) {
      bump("caution");
      score -= 20;
      reasons.push(`파도가 있어요 (최대 ${waveMax.toFixed(1)}m)`);
    } else {
      score -= waveMax * 10;
    }
  }
  if (precipSum !== null) {
    if (precipSum >= t.precipCaution) {
      bump("bad");
      score -= 35;
      reasons.push(`비가 많이 와요 (${precipSum.toFixed(1)}mm)`);
    } else if (precipSum >= t.precipGood) {
      bump("caution");
      score -= 15;
      reasons.push(`비 소식이 있어요 (${precipSum.toFixed(1)}mm)`);
    }
  }
  if (seaTemp !== null && seaTemp < t.seaTempMin) {
    bump("caution");
    score -= 15;
    reasons.push(`수온이 낮아요 (${seaTemp.toFixed(1)}℃)`);
  }
  if (input.sari) {
    bump("caution");
    score -= 8;
    reasons.push("사리 기간이라 조류가 빨라요");
  }
  if (reasons.length === 0) reasons.push("바람·파도·비 모두 잔잔해요");
  return { rating: worst, score: Math.max(0, Math.round(score)), reasons };
}

export const RATING_LABEL: Record<Rating, string> = {
  good: "가능",
  caution: "주의",
  bad: "불가",
  unknown: "예보 없음",
};
