export const DEFAULT_WEIGHT_KG = 70;
/** 시간 정보가 없는 GPX에 가정하는 평균 수영 속도 */
export const ASSUMED_SPEED_KMH = 2;

/** 수영 속도(km/h)에 따른 MET (Compendium of Physical Activities 근사값) */
export function metForSpeed(kmh: number): number {
  if (kmh < 1.5) return 6;
  if (kmh < 2.5) return 8;
  return 10;
}

/** 칼로리(kcal) = MET × 체중(kg) × 시간(h) */
export function swimCalories(weightKg: number, distanceKm: number, durationMin: number | null): number {
  const hours = durationMin !== null && durationMin > 0 ? durationMin / 60 : distanceKm / ASSUMED_SPEED_KMH;
  if (hours <= 0) return 0;
  const speed = distanceKm / hours;
  return metForSpeed(speed) * weightKg * hours;
}
