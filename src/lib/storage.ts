import { DEFAULT_WEIGHT_KG } from "./calories.ts";
import type { DayInfo, Place, SavedTrip, SwimRecord } from "./types.ts";

// 로그인 없이 이 기기의 브라우저에만 저장한다 (기본값). 서버 저장이 필요해지면 이 파일만 바꾸면 된다.
const TRIPS_KEY = "basugo.trips.v1";
const RECORDS_KEY = "basugo.records.v1";
const WEIGHT_KEY = "basugo.weight.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 없거나 사생활 보호 모드면 저장하지 못한다
  }
}

export const tripId = (place: Place, date: string) => `${place.lat.toFixed(3)},${place.lng.toFixed(3)}|${date}`;

export function loadTrips(): SavedTrip[] {
  return read<SavedTrip[]>(TRIPS_KEY, []).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 같은 장소·날짜는 하나로 합친다. */
export function saveTrip(place: Place, date: string, day?: DayInfo): void {
  const id = tripId(place, date);
  const trips = read<SavedTrip[]>(TRIPS_KEY, []).filter((t) => t.id !== id);
  const prev = read<SavedTrip[]>(TRIPS_KEY, []).find((t) => t.id === id);
  trips.push({
    id,
    place,
    date,
    savedAt: new Date().toISOString(),
    rating: day?.rating ?? prev?.rating ?? "unknown",
    weatherText: day?.weatherText ?? prev?.weatherText ?? "",
    weatherIcon: day?.weatherIcon ?? prev?.weatherIcon ?? "",
    windMax: day?.windMax ?? prev?.windMax ?? null,
    tMax: day?.tMax ?? prev?.tMax ?? null,
  });
  write(TRIPS_KEY, trips);
}

export function deleteTrips(ids: string[]): void {
  const set = new Set(ids);
  write(
    TRIPS_KEY,
    read<SavedTrip[]>(TRIPS_KEY, []).filter((t) => !set.has(t.id)),
  );
}

export function clearTrips(): void {
  write(TRIPS_KEY, []);
}

export function loadRecords(): SwimRecord[] {
  return read<SwimRecord[]>(RECORDS_KEY, []).sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

export function addRecord(rec: SwimRecord): void {
  write(RECORDS_KEY, [...read<SwimRecord[]>(RECORDS_KEY, []), rec]);
}

export function deleteRecords(ids: string[]): void {
  const set = new Set(ids);
  write(
    RECORDS_KEY,
    read<SwimRecord[]>(RECORDS_KEY, []).filter((r) => !set.has(r.id)),
  );
}

export function loadWeight(): number {
  const w = read<number>(WEIGHT_KEY, DEFAULT_WEIGHT_KG);
  return Number.isFinite(w) && w >= 20 && w <= 300 ? w : DEFAULT_WEIGHT_KG;
}

export function saveWeight(kg: number): void {
  write(WEIGHT_KEY, kg);
}
