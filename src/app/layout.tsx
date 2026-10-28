import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { NoticeBanner, PushSync } from "@/components/AlertParts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "바수고 BaSuGo", template: "%s · 바수고" },
  description: "바다수영 갈 날을 물때·날씨·풍속으로 골라 주는 바수고",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0078d7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="logo-link" aria-label="바수고 처음으로">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/basugo-logo.png" alt="BaSuGo 바수고" width={150} height={32} className="logo" />
            </Link>
            <nav aria-label="주 메뉴">
              <Link href="/">바수 찾기</Link>
              <Link href="/my">나의 바수</Link>
            </nav>
          </div>
        </header>
        <main className="container">
          <NoticeBanner />
          {children}
        </main>
        <PushSync />
        <footer className="container site-footer">
          <p>
            바수고는 참고용 정보를 제공합니다. 입수 전 해양경찰·기상청의 특보와 현장 안전 안내를 꼭 확인하고, 혼자 먼 바다로
            나가지 마세요.
          </p>
          <p>
            <Link href="/admin" className="footer-link">
              관리자
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
