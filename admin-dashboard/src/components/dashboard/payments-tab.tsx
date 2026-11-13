"use client";

import React, { useState } from "react";
import {
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import { PayOSTransaction, PaymentStatus } from "@/types/admin";
import { formatVND, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";

interface PaymentsTabProps {
  transactions: PayOSTransaction[];
}

export function PaymentsTab({ transactions }: PaymentsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewQrTx, setViewQrTx] = useState<PayOSTransaction | null>(null);

  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      tx.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.orderCode.toString().includes(searchTerm) ||
      (tx.payOsTransactionId && tx.payOsTransactionId.includes(searchTerm));

    const matchesStatus = selectedStatus === "ALL" || tx.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Đã sao chép: ${text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Filters */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn hàng, tên chủ nhà hoặc email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-xs">
          <span className="px-2 font-medium text-slate-400">Trạng thái:</span>
          {["ALL", "PAID", "PENDING", "EXPIRED"].map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={cn(
                "rounded-lg px-2.5 py-1 font-medium transition",
                selectedStatus === st
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {st === "ALL" ? "Tất cả" : st === "PAID" ? "Đã thanh toán" : st === "PENDING" ? "Chờ quét mã" : "Hết hạn"}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
              <tr>
                <th className="py-3.5 px-4">Mã Đơn PayOS</th>
                <th className="py-3.5 px-4">Chủ Nhà / Khách Hàng</th>
                <th className="py-3.5 px-4">Gói Đăng Ký</th>
                <th className="py-3.5 px-4">Số Tiền (VNĐ)</th>
                <th className="py-3.5 px-4">Trạng Thái</th>
                <th className="py-3.5 px-4">HMAC Webhook</th>
                <th className="py-3.5 px-4">Thời Gian</th>
                <th className="py-3.5 px-4 text-right">Chi Tiết / QR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Không có giao dịch PayOS nào phù hợp
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-900/40 transition duration-150">
                    {/* Order Code */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-200">#{tx.orderCode}</span>
                        <button
                          onClick={() => handleCopy(tx.orderCode.toString(), tx.id)}
                          className="text-slate-500 hover:text-slate-300"
                          title="Sao chép mã đơn"
                        >
                          {copiedId === tx.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {tx.payOsTransactionId && (
                        <div className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">
                          {tx.payOsTransactionId}
                        </div>
                      )}
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{tx.userName}</div>
                      <div className="text-[11px] text-slate-400">{tx.userEmail}</div>
                    </td>

                    {/* Tier */}
                    <td className="py-3.5 px-4">
                      <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-300">
                        {tx.tierName}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-emerald-400 text-sm">
                        {formatVND(tx.amount)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          tx.status === "PAID"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : tx.status === "PENDING"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}
                      >
                        {tx.status === "PAID" ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Thành công
                          </>
                        ) : tx.status === "PENDING" ? (
                          <>
                            <Clock className="h-3 w-3 animate-spin" /> Chờ quét VietQR
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" /> Hết hạn
                          </>
                        )}
                      </span>
                    </td>

                    {/* Webhook Signature */}
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-medium",
                          tx.webhookVerified ? "text-teal-400" : "text-slate-500"
                        )}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {tx.webhookVerified ? "Verified (SHA256)" : "Chưa nhận"}
                      </span>
                    </td>

                    {/* Time */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-300">{formatDate(tx.createdAt)}</div>
                      {tx.paidAt && (
                        <div className="text-[10px] text-emerald-400">
                          Khớp lúc: {formatDate(tx.paidAt)}
                        </div>
                      )}
                    </td>

                    {/* Actions / QR */}
                    <td className="py-3.5 px-4 text-right">
                      {tx.qrCodeUrl ? (
                        <button
                          onClick={() => setViewQrTx(tx)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-200 transition"
                        >
                          <QrCode className="h-3.5 w-3.5 text-emerald-400" />
                          <span>VietQR</span>
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

      {/* QR Code Modal */}
      {viewQrTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in-0">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
            <h3 className="text-sm font-bold text-white">Mã Thanh Toán VietQR PayOS</h3>
            <p className="text-xs text-slate-400 mt-1">Đơn hàng #{viewQrTx.orderCode}</p>

            <div className="my-5 flex items-center justify-center rounded-2xl bg-white p-4 shadow-inner">
              <div className="flex flex-col items-center">
                <div className="font-bold text-slate-900 text-xs mb-2">VietQR · PayOS</div>
                <div className="h-44 w-44 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
                  <QrCode className="h-32 w-32 text-slate-800" />
                </div>
                <div className="font-semibold text-emerald-600 text-sm mt-2">
                  {formatVND(viewQrTx.amount)}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-400 mb-4">
              Nội dung CK: <strong className="text-white font-mono">LOCCOC {viewQrTx.orderCode}</strong>
            </div>

            <button
              onClick={() => setViewQrTx(null)}
              className="w-full rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
