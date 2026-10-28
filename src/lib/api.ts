import type { ForecastResponse, GeocodeResponse } from "./types.ts";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "요청에 실패했어요.");
  return body as T;
}

export const fetchForecast = (lat: number, lng: number, start: string, days: number) =>
  getJson<ForecastResponse>(`/api/forecast?lat=${lat}&lng=${lng}&start=${start}&days=${days}`);

export const searchPlaces = (q: string) => getJson<GeocodeResponse>(`/api/geocode?q=${encodeURIComponent(q)}`);

export const nameForPoint = (lat: number, lng: number) =>
  getJson<{ name: string }>(`/api/geocode?lat=${lat}&lng=${lng}`);
