"use client";

import React from "react";
import {
  TrendingUp,
  Users,
  CreditCard,
  ShieldCheck,
  ArrowUpRight,
  Zap,
  DollarSign,
  Activity,
  Camera,
  Layers,
  Heart,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { KpiSummary, SubscriptionTier, PayOSTransaction, RevenueMetric } from "@/types/admin";
import { formatVND, formatNumber, formatDate, cn } from "@/lib/utils";

interface OverviewTabProps {
  kpis?: KpiSummary;
  tiers?: SubscriptionTier[];
  transactions?: PayOSTransaction[];
  revenueChart?: RevenueMetric[];
  onNavigateTab: (tab: any) => void;
}

const TIER_COLORS = ["#64748b", "#f59e0b", "#a855f7", "#3b82f6"];

export function OverviewTab({
  kpis,
  tiers = [],
  transactions = [],
  revenueChart = [],
  onNavigateTab,
}: OverviewTabProps) {
  if (!kpis) return null;

  const tierPieData = tiers.map((t) => ({
    name: t.name,
    value: t.subscribersCount,
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* MRR Card */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Doanh Thu Gói Cước (MRR)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {formatVND(kpis.mrr)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="flex items-center font-medium text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />+{kpis.mrrGrowth}%
            </span>
            <span className="text-slate-500">tăng trưởng tháng</span>
          </div>
        </div>

        {/* Total Users */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tổng Người Dùng LocCoc</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {formatNumber(kpis.totalUsers)}
            </span>
            <span className="text-xs text-slate-400">thành viên</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="flex items-center font-medium text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />+{kpis.usersGrowth}%
            </span>
            <span className="text-slate-500">active hàng ngày</span>
          </div>
        </div>

        {/* Moments Shared Today */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Khoảnh Khắc Đã Chia Sẻ (Hôm nay)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Camera className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {formatNumber(kpis.todayMomentsShared)}
            </span>
            <span className="text-xs text-slate-400">ảnh & video</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="flex items-center font-medium text-rose-400">
              <Heart className="h-3.5 w-3.5 mr-0.5 fill-rose-400" />
              {formatNumber(kpis.todayActiveWidgets)}
            </span>
            <span className="text-slate-500">Live Widgets đang nhận ảnh</span>
          </div>
        </div>

        {/* Gold & VIP Subscribers */}
        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Hội Viên Gold / Plus VIP</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-400">
              {formatNumber(kpis.activeSubscriptions)}
            </span>
            <span className="text-xs text-slate-400">người đăng ký</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="text-slate-300 font-medium">PayOS: {kpis.paymentSuccessRate}%</span>
            <span className="text-slate-500">({kpis.todayTransactions} đơn hôm nay)</span>
          </div>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Revenue Analytics Area Chart (2 cols) */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                Doanh Thu Nâng Cấp Gói LocCoc Gold / VIP (PayOS VietQR)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Dữ liệu đồng bộ trực tiếp từ payment-service & PayOS Webhook
              </p>
            </div>
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
              Tổng 7 ngày: 132.4M VNĐ
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChart}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(val) => `${val / 1000000}M`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [formatVND(val), "Doanh thu"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#revenueGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subscription Tier Distribution (1 col) */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-400" />
              Phân Bổ Gói Hội Viên
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Tỷ lệ người dùng nâng cấp Gold / Plus</p>
          </div>

          <div className="h-44 w-full my-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tierPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {tierPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={TIER_COLORS[index % TIER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [`${formatNumber(val)} tài khoản`, "Số lượng"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            {tiers.map((t, idx) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: TIER_COLORS[idx % TIER_COLORS.length] }}
                  />
                  <span className="text-slate-300 truncate max-w-[130px]">{t.name}</span>
                </div>
                <span className="font-semibold text-slate-100">{formatNumber(t.subscribersCount)} ({Math.round((t.subscribersCount / (kpis.totalUsers || 1)) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent PayOS VietQR Transactions & Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Transactions List (2 cols) */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-amber-400" />
                Giao Dịch Nâng Cấp PayOS VietQR Mới Nhất
              </h3>
              <p className="text-xs text-slate-400">Đơn hàng mua gói LocCoc Gold / Plus theo thời gian thực</p>
            </div>
            <button
              onClick={() => onNavigateTab("payments")}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
            >
              Xem tất cả →
            </button>
          </div>

          <div className="divide-y divide-slate-800/80">
            {transactions.slice(0, 4).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                      tx.status === "PAID"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : tx.status === "PENDING"
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}
                  >
                    #{tx.orderCode.toString().slice(-4)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">{tx.userName}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {tx.tierName}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">{formatDate(tx.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-white">{formatVND(tx.amount)}</div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-medium",
                      tx.status === "PAID"
                        ? "text-emerald-400"
                        : tx.status === "PENDING"
                        ? "text-blue-400"
                        : "text-red-400"
                    )}
                  >
                    {tx.status === "PAID" ? "Đã kích hoạt Gold" : tx.status === "PENDING" ? "Chờ quét VietQR" : "Hết hạn"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Microservices Quick Health Banner */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                Cụm Microservices LocCoc
              </h3>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                5/5 Online
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Gateway, Auth, User, Admin và Payment (PayOS VietQR) đang hoạt động ổn định.
            </p>
          </div>

          <div className="space-y-2.5 my-4">
            <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-300">API Gateway :3000</span>
              <span className="text-emerald-400 font-medium">8ms latency</span>
            </div>
            <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-300">Admin Service :8086</span>
              <span className="text-emerald-400 font-medium">16ms latency</span>
            </div>
            <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-300">Payment Service :8085</span>
              <span className="text-emerald-400 font-medium">18ms latency</span>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab("system")}
            className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 text-xs font-semibold transition text-center"
          >
            Xem Chi Tiết Hạ Tầng & Logs →
          </button>
        </div>
      </div>
    </div>
  );
}
