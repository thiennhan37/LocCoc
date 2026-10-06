"use client";

import React from "react";
import {
  Search,
  Sparkles,
  Zap,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { TabKey } from "./sidebar";
import { cn } from "@/lib/utils";

interface HeaderProps {
  currentTab: TabKey;
  useLiveApi: boolean;
  onToggleLiveApi: () => void;
  onOpenCommand: () => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
}

const TAB_TITLES: Record<TabKey, { title: string; subtitle: string }> = {
  overview: {
    title: "Tổng quan Nền tảng Khoảnh khắc LocCoc",
    subtitle: "Giám sát số lượng khoảnh khắc (Moments), Widget tương tác, doanh thu Gold/VIP và giao dịch PayOS",
  },
  users: {
    title: "Quản lý Người dùng & Vòng Bạn Bè (IAM)",
    subtitle: "Danh sách tài khoản, username, số lượng bạn bè, số khoảnh khắc đã đăng và trạng thái",
  },
  tiers: {
    title: "Quản lý Gói Nâng Cấp (LocCoc Gold / Plus / VIP)",
    subtitle: "Cấu hình số lượng bạn bè tối đa, độ dài video khoảnh khắc, Cloud Storage và quyền lợi VIP",
  },
  payments: {
    title: "Lịch sử Giao dịch PayOS (VietQR)",
    subtitle: "Theo dõi trạng thái thanh toán nâng cấp gói cước tự động, Webhook HMAC SHA256",
  },
  audit: {
    title: "Nhật ký Hoạt động (Audit Logs)",
    subtitle: "Lưu vết toàn bộ thao tác bảo mật, gỡ nội dung vi phạm và thay đổi cấu hình",
  },
  system: {
    title: "Trạng thái Hạ tầng Microservices",
    subtitle: "Giám sát Gateway (3000), Auth (3001), User (3002), Admin (8086), Payment (8085)",
  },
};

export function Header({
  currentTab,
  useLiveApi,
  onToggleLiveApi,
  onOpenCommand,
  onRefreshData,
  isRefreshing,
}: HeaderProps) {
  const currentInfo = TAB_TITLES[currentTab];

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-6 backdrop-blur-xl">
      {/* Title & Breadcrumb */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>LocCoc Admin</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          <span className="font-medium text-amber-400 capitalize">{currentTab}</span>
        </div>
        <h1 className="text-base font-bold text-slate-100 tracking-tight">
          {currentInfo.title}
        </h1>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Command Menu Search Trigger */}
        <button
          onClick={onOpenCommand}
          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Tìm kiếm tác vụ...</span>
          <kbd className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
            ⌘K
          </kbd>
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefreshData}
          disabled={isRefreshing}
          title="Làm mới dữ liệu"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-amber-400")} />
        </button>

        {/* Live API / Mock Toggle */}
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/90 p-0.5 text-xs">
          <button
            onClick={() => onToggleLiveApi()}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition",
              !useLiveApi
                ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Demo Data</span>
          </button>
          <button
            onClick={() => onToggleLiveApi()}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition",
              useLiveApi
                ? "bg-teal-500 text-slate-950 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Live Gateway</span>
          </button>
        </div>

        {/* Admin Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-rose-600 font-bold text-slate-950 text-xs shadow-md">
            ĐT
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-200 leading-tight">Đức Thịnh</span>
            <span className="text-[10px] text-amber-400 font-medium">Super Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
