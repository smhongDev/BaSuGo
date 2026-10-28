import { addDays, dateRange, kstToday } from "./dates.ts";
import { describeWeather } from "./weather.ts";
import { extractTides, flowsForDay, tidesForDay } from "./tides.ts";
import { lunarDay, mulddae, sunTimes } from "./lunar.ts";
import { rateDay, THRESHOLDS, type Thresholds } from "./score.ts";
import { fetchKhoaTides, type KhoaTides } from "./khoa.ts";
import { coastPointsByDistance } from "./regions.ts";
import { haversineKm } from "./gpx.ts";
import { getSettings } from "./server/settings.ts";
import type { DayInfo, ForecastResponse, ForecastSources, TideEvent } from "./types.ts";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
/** Open-Meteo 일별 예보는 오늘 포함 최대 16일 */
const FORECAST_SPAN_DAYS = 16;
/** 바다 예보 격자가 이보다 멀면 ‘가까운 바다’ 정보라고 알린다 */
const SEA_NEAR_KM = 25;

type DailyWeather = {
  time: string[];
  weather_code: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  wind_speed_10m_max: (number | null)[];
  precipitation_sum: (number | null)[];
};

type HourlyMarine = {
  time: string[];
  sea_level_height_msl?: (number | null)[];
  sea_surface_temperature?: (number | null)[];
  wave_height?: (number | null)[];
};

/** 선택한 곳 정보가 없어 대신 쓴 가까운 지역 */
export type FallbackRegion = { name: string; km: number };

export type RawSources = {
  weather: DailyWeather | null;
  marine: HourlyMarine | null;
  /** 날씨를 선택한 곳이 아닌 가까운 해안에서 가져온 경우 */
  weatherFrom?: FallbackRegion;
  /** 파도·수온·해수면을 가까운 해안에서 가져온 경우 */
  marineFrom?: FallbackRegion;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

const hasValues = (arr?: (number | null)[]) => !!arr && arr.some((v) => v !== null);
const weatherOk = (w: DailyWeather | null) => !!w && hasValues(w.weather_code);
// 파고가 없으면 바다가 아닌 격자(강·호수·내륙)로 보고 가까운 해안 정보를 쓴다
const marineOk = (m: HourlyMarine | null) => !!m && hasValues(m.wave_height);

export async function fetchSources(lat: number, lng: number, dates: string[]): Promise<RawSources> {
  const today = kstToday();
  const last = addDays(today, FORECAST_SPAN_DAYS - 1);
  const inRange = dates.filter((d) => d >= today && d <= last);
  if (inRange.length === 0) return { weather: null, marine: null };
  const start = inRange[0];
  const end = inRange[inRange.length - 1];
  // 물때 계산을 위해 바다 정보는 앞뒤로 하루씩 더 받는다
  const mStart = start > today ? addDays(start, -1) : start;
  const mEnd = end < last ? addDays(end, 1) : end;

  const common = (la: number, ln: number) => `latitude=${la.toFixed(4)}&longitude=${ln.toFixed(4)}&timezone=Asia%2FSeoul`;
  const weatherAt = (la: number, ln: number) =>
    getJson<{ daily: DailyWeather }>(
      `${WEATHER_URL}?${common(la, ln)}&wind_speed_unit=ms&start_date=${start}&end_date=${end}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum`,
    ).then((j) => j.daily);
  // Open-Meteo 는 가장 가까운 바다 격자를 골라 주고 그 위치(latitude·longitude)를 함께 돌려준다
  const marineAt = (la: number, ln: number) =>
    getJson<{ hourly: HourlyMarine; latitude: number; longitude: number }>(
      `${MARINE_URL}?${common(la, ln)}&start_date=${mStart}&end_date=${mEnd}` +
        `&hourly=sea_level_height_msl,sea_surface_temperature,wave_height`,
    ).then((j) => {
      const km = haversineKm({ lat, lng }, { lat: j.latitude, lng: j.longitude });
      if (Number.isFinite(km) && km > SEA_NEAR_KM) farSea = { lat: j.latitude, lng: j.longitude, km };
      return j.hourly;
    });
  // 선택한 곳에서 꽤 떨어진 바다 격자를 쓴 경우 (안내 문구용)
  let farSea: { lat: number; lng: number; km: number } | null = null;
  const orNull = <T>(p: Promise<T>) => p.catch(() => null);

  let [weather, marine] = await Promise.all([orNull(weatherAt(lat, lng)), orNull(marineAt(lat, lng))]);
  const out: RawSources = { weather, marine };

  // 선택한 곳 정보를 못 받으면 가까운 해안 기준점(120km 안)에서 차례로 받아 본다
  if (!weatherOk(weather) || !marineOk(marine)) {
    for (const { item, km } of coastPointsByDistance(lat, lng, 3)) {
      const needWeather = !weatherOk(out.weather);
      const needMarine = !marineOk(out.marine);
      if (!needWeather && !needMarine) break;
      [weather, marine] = await Promise.all([
        needWeather ? orNull(weatherAt(item.lat, item.lng)) : null,
        needMarine ? orNull(marineAt(item.lat, item.lng)) : null,
      ]);
      const from = { name: item.name, km: Math.round(km) };
      if (needWeather && weatherOk(weather)) Object.assign(out, { weather, weatherFrom: from });
      if (needMarine && marineOk(marine)) Object.assign(out, { marine, marineFrom: from });
    }
  }
  if (!out.marineFrom && marineOk(out.marine) && farSea) {
    const sea: { lat: number; lng: number; km: number } = farSea;
    const name = coastPointsByDistance(sea.lat, sea.lng, 1)[0]?.item.name;
    out.marineFrom = { name: name ? `${name} 부근 바다` : "가장 가까운 바다", km: Math.round(sea.km) };
  }
  // 날씨를 끝내 못 받으면 오류로 알린다 (바다 정보는 없어도 날씨는 보여 준다)
  if (!out.weather) throw new Error("날씨 예보를 받지 못했어요");
  return out;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export type BuildOptions = {
  thresholds?: Thresholds;
  /** 국립해양조사원 조석예보처럼 바깥에서 받은 만조·간조 (있으면 해수면 계산 대신 쓴다) */
  tides?: TideEvent[];
};

export function buildDays(lat: number, lng: number, dates: string[], src: RawSources, opts: BuildOptions = {}): DayInfo[] {
  const marine = src.marine;
  const allTides: TideEvent[] = opts.tides
    ? opts.tides
    : marine?.sea_level_height_msl && marine.sea_level_height_msl.some((h) => h !== null)
      ? extractTides(marine.time, marine.sea_level_height_msl)
      : [];

  return dates.map((date) => {
    const wi = src.weather ? src.weather.time.indexOf(date) : -1;
    const available = wi >= 0;
    const code = available ? src.weather!.weather_code[wi] : null;
    const { text, icon } = describeWeather(code);

    const idx: number[] = [];
    if (marine) marine.time.forEach((t, i) => t.startsWith(date) && idx.push(i));
    const pick = (arr?: (number | null)[], from = 0, to = 24) =>
      (arr ? idx.filter((_, k) => k >= from && k < to).map((i) => arr[i]) : []).filter(
        (v): v is number => v != null,
      );
    const waves = pick(marine?.wave_height);
    const waveMax = waves.length ? Math.max(...waves) : null;
    const seaTemp = mean(pick(marine?.sea_surface_temperature, 9, 17));

    const ld = lunarDay(date);
    const md = mulddae(ld);
    const windMax = available ? src.weather!.wind_speed_10m_max[wi] : null;
    const precipSum = available ? src.weather!.precipitation_sum[wi] : null;
    const verdict = available
      ? rateDay({ windMax, waveMax, precipSum, seaTemp, sari: md.sari }, opts.thresholds ?? THRESHOLDS)
      : null;
    const sun = sunTimes(date, lat, lng);

    return {
      date,
      forecastAvailable: available,
      weatherCode: code,
      weatherText: available ? text : "예보 없음",
      weatherIcon: available ? icon : "–",
      tMax: available ? src.weather!.temperature_2m_max[wi] : null,
      tMin: available ? src.weather!.temperature_2m_min[wi] : null,
      windMax,
      waveMax,
      seaTemp,
      precipSum,
      tides: tidesForDay(allTides, date),
      flows: flowsForDay(allTides, date),
      lunarDay: ld,
      mulddae: md.label,
      sunrise: sun.sunrise,
      sunset: sun.sunset,
      rating: verdict ? verdict.rating : "unknown",
      score: verdict ? verdict.score : null,
      reasons: verdict ? verdict.reasons : ["예보 기간(오늘부터 약 16일)이 아니라서 물때·일출·일몰만 보여요"],
    } satisfies DayInfo;
  });
}

export const FORECAST_NOTES = [
  "날씨·파도·수온·해수면은 Open-Meteo 예보이고, 물때(만조·간조)는 해수면 높이를 1시간 간격으로 받아 계산한 값이라 실제와 수십 분 차이날 수 있어요.",
  "바수 가능 여부는 풍속 5m/s, 파고 0.5m, 비 1mm 등 기본 기준으로 계산한 참고용이며, 입수 전에 현지 기상특보와 안전 정보를 꼭 확인해 주세요.",
];

const KHOA_NOTE = (station: string) =>
  `만조·간조는 국립해양조사원 조석예보(${station} 관측소)이고, 높이는 그 관측소의 기본수준면 기준이에요. 날씨·파도·수온은 Open-Meteo 예보예요.`;

/** 조석예보를 못 받으면 해수면 계산으로 돌아간다 (사이트가 멈추지 않게). */
async function khoaOrNull(lat: number, lng: number, dates: string[]) {
  try {
    return await fetchKhoaTides(lat, lng, dates);
  } catch (e) {
    console.error("khoa tides failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 어느 지역 정보인지 화면에 보여 줄 문구 */
function describeSources(src: RawSources, khoa: KhoaTides | null, hasTides: boolean): { sources: ForecastSources; fallbacks: string[] } {
  const fallbacks: string[] = [];
  const weather = src.weatherFrom ? `${src.weatherFrom.name} 부근 (약 ${src.weatherFrom.km}km)` : "선택한 위치";
  if (src.weatherFrom) fallbacks.push(`선택한 곳의 날씨 예보가 없어서 가까운 ‘${src.weatherFrom.name}’(약 ${src.weatherFrom.km}km) 날씨를 보여 드려요.`);
  const seaName = (n: string) => (n.endsWith("바다") ? n : `${n} 앞바다`);
  const sea = src.marineFrom ? `${seaName(src.marineFrom.name)} (약 ${src.marineFrom.km}km)` : "선택한 위치 앞바다";
  if (src.marineFrom) fallbacks.push(`선택한 곳의 바다 예보(파도·수온·해수면)가 없어서 가까운 ‘${seaName(src.marineFrom.name)}’(약 ${src.marineFrom.km}km) 정보를 보여 드려요.`);
  let tide: string;
  if (khoa) {
    const km = Math.round(khoa.km);
    tide = `국립해양조사원 ${khoa.station.name} 관측소 (약 ${km}km)`;
    if (khoa.fallback) fallbacks.push(`가까운 조위관측소 정보가 없어서 ‘${khoa.station.name}’ 관측소(약 ${km}km)의 만조·간조를 보여 드려요.`);
  } else if (hasTides) {
    tide = src.marineFrom ? `${seaName(src.marineFrom.name)} 해수면 계산` : "선택한 위치 해수면 계산";
  } else {
    tide = "정보 없음";
  }
  return { sources: { weather, sea, tide }, fallbacks };
}

export async function getForecast(lat: number, lng: number, start: string, days: number): Promise<ForecastResponse> {
  const dates = dateRange(start, days);
  const mock = process.env.BASUGO_MOCK === "1";
  const [src, settings, khoa] = await Promise.all([
    mock ? (await import("./mock.ts")).mockSources(lat, lng, dates) : fetchSources(lat, lng, dates),
    getSettings(),
    mock ? null : khoaOrNull(lat, lng, dates),
  ]);
  const notes = khoa ? [KHOA_NOTE(khoa.station.name), ...FORECAST_NOTES.slice(1)] : FORECAST_NOTES;
  const built = buildDays(lat, lng, dates, src, { thresholds: settings.thresholds, tides: khoa?.events });
  const { sources, fallbacks } = describeSources(src, khoa, built.some((d) => d.tides.length > 0));
  return {
    place: { lat, lng },
    days: built,
    notes,
    tideSource: khoa ? `국립해양조사원 ${khoa.station.name}` : "Open-Meteo 해수면 계산",
    sources,
    fallbacks,
  };
}
