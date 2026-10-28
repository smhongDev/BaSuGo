import type { Metadata } from "next";
import { MyClient } from "@/components/MyClient";

export const metadata: Metadata = { title: "나의 바수" };

export default function Page() {
  return <MyClient />;
}
