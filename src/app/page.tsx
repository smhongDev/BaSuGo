import { Suspense } from "react";
import { HomeClient } from "@/components/HomeClient";

export default function Page() {
  return (
    <Suspense fallback={<p className="hint">불러오는 중…</p>}>
      <HomeClient />
    </Suspense>
  );
}
