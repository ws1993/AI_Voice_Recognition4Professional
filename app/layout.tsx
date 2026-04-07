import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "安监语音识别整改系统",
  description: "移动端语音识别与整改通知单生成"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
