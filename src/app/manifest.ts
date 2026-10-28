import type { MetadataRoute } from "next";

/** 홈 화면에 추가할 때 쓰는 정보 (아이폰은 홈 화면에 추가해야 푸시 알림을 받을 수 있다) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "바수고 BaSuGo",
    short_name: "바수고",
    description: "바다수영 갈 날을 물때·날씨·풍속으로 골라 주는 바수고",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f9fd",
    theme_color: "#0078d7",
    lang: "ko",
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
      { src: "/apple-icon.png", sizes: "any", type: "image/png" },
    ],
  };
}
