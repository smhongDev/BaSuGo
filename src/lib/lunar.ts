import * as SunCalc from "suncalc";

const SYNODIC_DAYS = 29.530588;

function kstNoon(date: string): Date {
  return new Date(`${date}T12:00:00+09:00`);
}

/** 음력 날짜(1~30) 근사값: 달의 위상에서 계산한다. */
export function lunarDay(date: string): number {
  const phase = SunCalc.getMoonIllumination(kstNoon(date)).phase;
  return Math.min(30, Math.floor(phase * SYNODIC_DAYS) + 1);
}

/** 사리(조류 강함)·조금(약함)·중물, 그리고 물때 번호(1~15) */
export function mulddae(lunarDay: number): { label: string; number: number; sari: boolean } {
  const d = ((lunarDay - 1) % 15) + 1;
  const number = ((d + 6) % 15) + 1;
  const sari = [14, 15, 1, 2, 3].includes(d);
  const jogeum = [7, 8, 9].includes(d);
  const kind = sari ? "사리" : jogeum ? "조금" : "중물";
  return { label: `${number}물때 · ${kind}`, number, sari };
}

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function sunTimes(date: string, lat: number, lng: number): { sunrise: string; sunset: string } {
  const t = SunCalc.getTimes(kstNoon(date), lat, lng);
  const fmt = (d: Date | null) => (d === null || Number.isNaN(d.getTime()) ? "--:--" : timeFmt.format(d));
  return { sunrise: fmt(t.sunrise), sunset: fmt(t.sunset) };
}
