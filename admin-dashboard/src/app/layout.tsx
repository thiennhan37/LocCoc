import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/lib/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LocCoc Admin & IAM Subscription Platform",
  description: "Trang Quản Trị Hệ Thống Quản Lý Nhà Trọ LocCoc & Cổng Thanh Toán PayOS VietQR",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#090d16] text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-200">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
