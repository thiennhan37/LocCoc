"use client";

import React from "react";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  CreditCard,
  ShieldAlert,
  Server,
  Camera,
  HeartHandshake,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TabKey = "overview" | "users" | "tiers" | "payments" | "audit" | "system";

interface SidebarProps {
  currentTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_ITEMS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string }[] = [
  { key: "overview", label: "Tổng quan & Chỉ số", icon: LayoutDashboard },
  { key: "users", label: "Người dùng & Bạn bè", icon: Users, badge: "24.5k" },
  { key: "tiers", label: "Gói Cước (Gold/VIP)", icon: Sparkles, badge: "3 Gói" },
  { key: "payments", label: "Giao dịch PayOS", icon: CreditCard, badge: "VietQR" },
  { key: "audit", label: "Nhật ký Audit Log", icon: ShieldAlert },
  { key: "system", label: "Hạ tầng & Dịch vụ", icon: Server, badge: "5 UP" },
];

export function Sidebar({ currentTab, onTabChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-slate-800/80 bg-slate-950/90 backdrop-blur-xl transition-all duration-300 z-30",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center px-4 border-b border-slate-800/80 gap-3">
        <img
          src="/loccoc-logo.jpg"
          alt="LocCoc Logo"
          className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-lg shadow-orange-500/25 border border-orange-500/30"
        />
        {!isCollapsed && (
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-white text-base">LocCoc</span>
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                Admin
              </span>
            </div>
            <span className="text-xs text-slate-400 truncate">Live Widget & Moments</span>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        <div className={cn("px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500", isCollapsed && "sr-only")}>
          Quản trị nền tảng
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 relative",
                isActive
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-sm shadow-amber-950"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-amber-500" />
              )}
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive ? "text-amber-400" : "text-slate-400 group-hover:text-slate-200"
                )}
              />
              {!isCollapsed && (
                <div className="flex flex-1 items-center justify-between overflow-hidden">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        isActive
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-800 text-slate-400 group-hover:bg-slate-700"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Gateway Status Footer */}
      <div className="p-3 border-t border-slate-800/80">
        <div className={cn("rounded-xl p-3 bg-slate-900/60 border border-slate-800 flex items-center gap-3", isCollapsed && "justify-center p-2")}>
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col text-xs">
              <span className="font-medium text-slate-200">Gateway :3000</span>
              <span className="text-[11px] text-emerald-400">All Microservices Online</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
