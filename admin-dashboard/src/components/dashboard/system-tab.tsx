"use client";

import React from "react";
import {
  Server,
  Activity,
  Database,
  Layers,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Zap,
} from "lucide-react";
import { ServiceHealth } from "@/types/admin";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SystemTabProps {
  services: ServiceHealth[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function SystemTab({ services, onRefresh, isRefreshing }: SystemTabProps) {
  const handlePingAll = () => {
    onRefresh();
    toast.success("Đang kiểm tra kết nối toàn bộ Microservices...");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Overview Status Banner */}
      <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                LocCoc Microservices Cluster
              </h2>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                100% Khả dụng
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Kiến trúc Microservices: NestJS Gateway & Identity + Spring Boot 3 Admin & PayOS VietQR
            </p>
          </div>
        </div>

        <button
          onClick={handlePingAll}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-slate-200 transition border border-slate-700"
        >
          <RefreshCw className={cn("h-4 w-4 text-emerald-400", isRefreshing && "animate-spin")} />
          <span>Healthcheck Tất Cả Dịch Vụ</span>
        </button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((svc) => (
          <div
            key={svc.name}
            className="glass-panel rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition duration-200"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500" />
                  <span className="font-bold text-sm text-slate-100">{svc.name}</span>
                </div>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                  :{svc.port}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 my-4">
                <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800/80">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Độ trễ API</span>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    {svc.latencyMs} ms
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800/80">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Uptime</span>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">
                    {svc.uptime}
                  </div>
                </div>
              </div>

              {/* Database pool if applicable */}
              {svc.dbPoolMax > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Database className="h-3 w-3 text-slate-500" />
                      HikariCP Pool:
                    </span>
                    <span className="font-mono text-slate-200">
                      {svc.dbPoolActive} / {svc.dbPoolMax} active
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${(svc.dbPoolActive / svc.dbPoolMax) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Phiên bản v{svc.version}</span>
              <span>Cập nhật: {svc.lastChecked}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Infrastructure Nodes (PostgreSQL, MySQL, Redis, Kafka) */}
      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-purple-400" />
          Hạ Tầng Dữ Liệu & Hàng Đợi (Infrastructure Topology)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">PostgreSQL 17</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">IAM (Auth & User Database)</p>
            <div className="mt-2 text-xs font-mono text-slate-400">Port: 5432</div>
          </div>

          <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">MySQL 8.0</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Admin & Payment Databases</p>
            <div className="mt-2 text-xs font-mono text-slate-400">Port: 3306</div>
          </div>

          <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">Redis 7</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Token Blacklist & Rate Limiter</p>
            <div className="mt-2 text-xs font-mono text-slate-400">Port: 6379</div>
          </div>

          <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-200">Apache Kafka 4.3</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">PayOS Domain Events & Webhook</p>
            <div className="mt-2 text-xs font-mono text-slate-400">Port: 9092</div>
          </div>
        </div>
      </div>
    </div>
  );
}
