import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "晨露村 · 小镇手记", description: "两名居民、三个地点，一步一步发生的日常。" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
