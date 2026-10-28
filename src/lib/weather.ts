/** WMO 날씨 코드(Open-Meteo)를 한글 설명과 아이콘으로 바꾼다. */
export function describeWeather(code: number | null): { text: string; icon: string } {
  if (code === null) return { text: "정보 없음", icon: "–" };
  if (code === 0) return { text: "맑음", icon: "☀️" };
  if (code <= 2) return { text: "구름 조금", icon: "🌤️" };
  if (code === 3) return { text: "흐림", icon: "☁️" };
  if (code === 45 || code === 48) return { text: "안개", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { text: "이슬비", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { text: "비", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { text: "눈", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { text: "소나기", icon: "🌦️" };
  if (code === 85 || code === 86) return { text: "눈 소나기", icon: "🌨️" };
  if (code >= 95) return { text: "뇌우", icon: "⛈️" };
  return { text: "흐림", icon: "☁️" };
}
