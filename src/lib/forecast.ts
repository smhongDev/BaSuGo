import { addDays, dateRange, kstToday } from "./dates.ts";
import { describeWeather } from "./weather.ts";
import { extractTides, flowsForDay, tidesForDay } from "./tides.ts";
import { lunarDay, mulddae, sunTimes } from "./lunar.ts";
import { rateDay, THRESHOLDS, type Thresholds } from "./score.ts";
import { fetchKhoaTides } from "./khoa.ts";
import { getSettings } from "./server/settings.ts";
import type { DayInfo, ForecastResponse, TideEvent } from "./types.ts";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
/** Open-Meteo 일별 예보는 오늘 포함 최대 16일 */
const FORECAST_SPAN_DAYS = 16;

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

export type RawSources = {
  weather: DailyWeather | null;
  marine: HourlyMarine | null;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchSources(lat: number, lng: number, dates: string[]): Promise<RawSources> {
  const today = kstToday();
  const last = addDays(today, FORECAST_SPAN_DAYS - 1);
  const inRange = dates.filter((d) => d >= today && d <= last);
  if (inRange.length === 0) return { weather: null, marine: null };
  const start = inRange[0];
  const end = inRange[inRange.length - 1];
  const common = `latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&timezone=Asia%2FSeoul`;

  const weatherUrl =
    `${WEATHER_URL}?${common}&wind_speed_unit=ms&start_date=${start}&end_date=${end}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum`;
  // 물때 계산을 위해 앞뒤로 하루씩 더 받는다
  const mStart = start > today ? addDays(start, -1) : start;
  const mEnd = end < last ? addDays(end, 1) : end;
  const marineUrl =
    `${MARINE_URL}?${common}&start_date=${mStart}&end_date=${mEnd}` +
    `&hourly=sea_level_height_msl,sea_surface_temperature,wave_height`;

  const [weather, marine] = await Promise.all([
    getJson<{ daily: DailyWeather }>(weatherUrl).then((j) => j.daily),
    // 바다 정보는 없어도 날씨는 보여 준다
    getJson<{ hourly: HourlyMarine }>(marineUrl)
      .then((j) => j.hourly)
      .catch(() => null),
  ]);
  return { weather, marine };
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

export async function getForecast(lat: number, lng: number, start: string, days: number): Promise<ForecastResponse> {
  const dates = dateRange(start, days);
  const mock = process.env.BASUGO_MOCK === "1";
  const [src, settings, khoa] = await Promise.all([
    mock ? (await import("./mock.ts")).mockSources(lat, lng, dates) : fetchSources(lat, lng, dates),
    getSettings(),
    mock ? null : khoaOrNull(lat, lng, dates),
  ]);
  const notes = khoa ? [KHOA_NOTE(khoa.station.name), ...FORECAST_NOTES.slice(1)] : FORECAST_NOTES;
  return {
    place: { lat, lng },
    days: buildDays(lat, lng, dates, src, { thresholds: settings.thresholds, tides: khoa?.events }),
    notes,
    tideSource: khoa ? `국립해양조사원 ${khoa.station.name}` : "Open-Meteo 해수면 계산",
  };
}
