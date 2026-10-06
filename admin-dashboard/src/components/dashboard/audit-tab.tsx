"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Terminal,
  X,
  Clock,
  Globe,
  User,
} from "lucide-react";
import { AuditLogItem } from "@/types/admin";
import { formatDate, cn } from "@/lib/utils";

interface AuditTabProps {
  logs: AuditLogItem[];
}

export function AuditTab({ logs }: AuditTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedService, setSelectedService] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [inspectingLog, setInspectingLog] = useState<AuditLogItem | null>(null);

  const filtered = logs.filter((log) => {
    const matchesSearch =
      log.actorEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetEntity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ipAddress.includes(searchTerm);

    const matchesService = selectedService === "ALL" || log.service === selectedService;
    const matchesStatus = selectedStatus === "ALL" || log.status === selectedStatus;

    return matchesSearch && matchesService && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Search & Filters */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo email, hành động (ACTION), IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            <span className="px-2 font-medium text-slate-400">Microservice:</span>
            {["ALL", "admin-service", "payment-service", "auth-service", "api-gateway"].map((svc) => (
              <button
                key={svc}
                onClick={() => setSelectedService(svc)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition",
                  selectedService === svc
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {svc === "ALL" ? "Tất cả" : svc.replace("-service", "")}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            <span className="px-2 font-medium text-slate-400">Kết quả:</span>
            {["ALL", "SUCCESS", "UNAUTHORIZED"].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition",
                  selectedStatus === st
                    ? "bg-slate-800 text-slate-200 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {st === "ALL" ? "Tất cả" : st === "SUCCESS" ? "Thành công" : "Từ chối / Lỗi"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
              <tr>
                <th className="py-3.5 px-4">Thời Gian</th>
                <th className="py-3.5 px-4">Người Thực Hiện (Actor)</th>
                <th className="py-3.5 px-4">Dịch Vụ (Service)</th>
                <th className="py-3.5 px-4">Hành Động (Action)</th>
                <th className="py-3.5 px-4">Đối Tượng (Target)</th>
                <th className="py-3.5 px-4">IP & Thiết Bị</th>
                <th className="py-3.5 px-4">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right">Chi Tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Không tìm thấy nhật ký audit log phù hợp
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40 transition duration-150">
                    {/* Timestamp */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-400">
                      {formatDate(log.createdAt)}
                    </td>

                    {/* Actor */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{log.actorEmail}</div>
                      <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400">
                        {log.actorRole}
                      </span>
                    </td>

                    {/* Service */}
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-emerald-400 text-[11px]">
                        {log.service}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-slate-200">
                        {log.action}
                      </span>
                    </td>

                    {/* Target */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-300">{log.targetEntity}</div>
                      <div className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">
                        {log.targetId}
                      </div>
                    </td>

                    {/* IP */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Globe className="h-3 w-3 text-slate-500" />
                        <span>{log.ipAddress}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          log.status === "SUCCESS"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}
                      >
                        {log.status === "SUCCESS" ? "Thành công" : "Từ chối"}
                      </span>
                    </td>

                    {/* Inspect Payload */}
                    <td className="py-3.5 px-4 text-right">
                      {log.details ? (
                        <button
                          onClick={() => setInspectingLog(log)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-200 transition"
                        >
                          <Code2 className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Payload</span>
                        </button>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payload JSON Inspector Modal */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in-0">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                Audit Log Details: {inspectingLog.action}
              </h3>
              <button
                onClick={() => setInspectingLog(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-4 rounded-xl bg-slate-950 p-4 border border-slate-800 overflow-x-auto font-mono text-xs text-emerald-400">
              <pre>{JSON.stringify(inspectingLog.details, null, 2)}</pre>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setInspectingLog(null)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
