import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nemonori Arcade",
  description: "미니게임을 둘러보고 플레이하며 세이브 데이터를 관리하는 Nemonori Arcade입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
