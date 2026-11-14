"use client";

import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Layers,
  CreditCard,
  ShieldAlert,
  Server,
  PlusCircle,
  QrCode,
  UserCheck,
  Search,
  X,
} from "lucide-react";
import { TabKey } from "./sidebar";

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: TabKey) => void;
  onOpenCreateTier: () => void;
}

export function CommandMenu({
  isOpen,
  onClose,
  onSelectTab,
  onOpenCreateTier,
}: CommandMenuProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        isOpen ? onClose() : null;
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      title: "Chuyển đến: Tổng quan & KPI",
      icon: LayoutDashboard,
      category: "Điều hướng",
      handler: () => {
        onSelectTab("overview");
        onClose();
      },
    },
    {
      title: "Chuyển đến: Quản lý Người dùng",
      icon: Users,
      category: "Điều hướng",
      handler: () => {
        onSelectTab("users");
        onClose();
      },
    },
    {
      title: "Chuyển đến: Quản lý Gói Dịch vụ (Tiers)",
      icon: Layers,
      category: "Điều hướng",
      handler: () => {
        onSelectTab("tiers");
        onClose();
      },
    },
    {
      title: "Chuyển đến: Giao dịch PayOS (VietQR)",
      icon: CreditCard,
      category: "Điều hướng",
      handler: () => {
        onSelectTab("payments");
        onClose();
      },
    },
    {
      title: "Chuyển đến: Nhật ký Audit Log",
      icon: ShieldAlert,
      category: "Điều hướng",
      handler: () => {
        onSelectTab("audit");
        onClose();
      },
    },
    {
      title: "Chuyển đến: Hạ tầng Microservices",
      icon: Server,
      category: "Điều hướng",
      handler: () => {
        onSelectTab("system");
        onClose();
      },
    },
    {
      title: "Tạo Gói Subscription Tier mới",
      icon: PlusCircle,
      category: "Thao tác nhanh",
      handler: () => {
        onSelectTab("tiers");
        onOpenCreateTier();
        onClose();
      },
    },
  ];

  const filtered = actions.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl p-2">
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Tìm tác vụ, trang hoặc thao tác nhanh..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Không tìm thấy lệnh phù hợp
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={item.handler}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-emerald-400"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-slate-400" />
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 rounded bg-slate-800/80 px-1.5 py-0.5">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
          <span>Dùng phím ↑ ↓ để duyệt</span>
          <span>Nhấn ESC để đóng</span>
        </div>
      </div>
    </div>
  );
}
