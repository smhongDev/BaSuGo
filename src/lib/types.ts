export type Rating = "good" | "caution" | "bad" | "unknown";

export type Place = { name: string; lat: number; lng: number };

export type TideEvent = {
  type: "high" | "low";
  /** 한국 시각 "YYYY-MM-DDTHH:mm" */
  time: string;
  /** 평균 해수면 기준 m */
  height: number;
};

export type TideFlow = {
  kind: "flood" | "ebb";
  from: string;
  to: string;
};

export type DayInfo = {
  date: string;
  /** 날씨·바다 예보가 있는 날짜인가 (없으면 물때·일출만 표시) */
  forecastAvailable: boolean;
  weatherCode: number | null;
  weatherText: string;
  weatherIcon: string;
  tMax: number | null;
  tMin: number | null;
  windMax: number | null;
  waveMax: number | null;
  seaTemp: number | null;
  precipSum: number | null;
  tides: TideEvent[];
  flows: TideFlow[];
  lunarDay: number;
  mulddae: string;
  sunrise: string;
  sunset: string;
  rating: Rating;
  score: number | null;
  reasons: string[];
};

export type ForecastResponse = {
  place: { lat: number; lng: number };
  days: DayInfo[];
  /** 물때 데이터 출처 안내 */
  notes: string[];
  /** 만조·간조를 어디서 가져왔는지 */
  tideSource?: string;
};

export type GeoCandidate = {
  name: string;
  detail: string;
  lat: number;
  lng: number;
};

export type GeocodeResponse = {
  query: string;
  /** 입력과 정확히 맞는 곳이 없어 가까운 후보를 찾은 경우 */
  approximate: boolean;
  candidates: GeoCandidate[];
};

export type SavedTrip = {
  id: string;
  place: Place;
  date: string;
  savedAt: string;
  rating: Rating;
  weatherText: string;
  weatherIcon: string;
  windMax: number | null;
  tMax: number | null;
};

export type SwimRecord = {
  id: string;
  name: string;
  /** 한국 날짜 "YYYY-MM-DD" (GPX에 시간이 없으면 null) */
  date: string | null;
  distanceKm: number;
  durationMin: number | null;
  points: [number, number][];
  addedAt: string;
};
