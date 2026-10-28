import { Suspense } from "react";
import type { Metadata } from "next";
import { DayClient } from "@/components/DayClient";

export const metadata: Metadata = { title: "바수 상세" };

export default function Page() {
  return (
    <Suspense fallback={<p className="hint">불러오는 중…</p>}>
      <DayClient />
    </Suspense>
  );
}
