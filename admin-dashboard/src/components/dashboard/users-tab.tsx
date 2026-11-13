"use client";

import React, { useState } from "react";
import {
  Users,
  Search,
  Filter,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  Camera,
  Heart,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Sparkles,
} from "lucide-react";
import { UserAccount, UserRole, UserStatus } from "@/types/admin";
import { formatVND, formatDate, formatNumber, cn } from "@/lib/utils";
import { toast } from "sonner";

interface UsersTabProps {
  users: UserAccount[];
  onUpdateStatus: (userId: string, newStatus: UserStatus) => Promise<any>;
}

export function UsersTab({ users, onUpdateStatus }: UsersTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedTier, setSelectedTier] = useState<string>("ALL");
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = selectedRole === "ALL" || u.role === selectedRole;
    const matchesStatus = selectedStatus === "ALL" || u.status === selectedStatus;
    const matchesTier = selectedTier === "ALL" || u.currentTierCode === selectedTier;

    return matchesSearch && matchesRole && matchesStatus && matchesTier;
  });

  const handleToggleBan = async (user: UserAccount) => {
    const newStatus: UserStatus = user.status === "BANNED" ? "ACTIVE" : "BANNED";
    setLoadingUserId(user.id);
    try {
      await onUpdateStatus(user.id, newStatus);
      if (newStatus === "BANNED") {
        toast.error(`Đã khóa tài khoản: ${user.fullName} (${user.username})`, {
          description: "Tài khoản bị ngắt kết nối khỏi Widget và không thể chia sẻ khoảnh khắc",
        });
      } else {
        toast.success(`Đã mở khóa tài khoản: ${user.fullName}`, {
          description: "Tài khoản đã được kích hoạt lại bình thường",
        });
      }
    } catch (err) {
      toast.error("Không thể cập nhật trạng thái người dùng");
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Filter Controls */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, username (@username) hoặc email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            <span className="px-2 font-medium text-slate-400">Gói Cước:</span>
            {["ALL", "FREE", "GOLD", "PLUS"].map((tier) => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition",
                  selectedTier === tier
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {tier === "ALL" ? "Tất cả" : tier}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            <span className="px-2 font-medium text-slate-400">Vai trò:</span>
            {["ALL", "USER", "CREATOR", "ADMIN"].map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition",
                  selectedRole === role
                    ? "bg-slate-800 text-slate-200 border border-slate-700 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {role === "ALL" ? "Tất cả" : role}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Data Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/60 uppercase tracking-wider text-[11px] text-slate-400 font-semibold">
              <tr>
                <th className="py-3.5 px-4">Tài Khoản LocCoc</th>
                <th className="py-3.5 px-4">Gói Hội Viên</th>
                <th className="py-3.5 px-4">Vòng Bạn Bè</th>
                <th className="py-3.5 px-4">Khoảnh Khắc Đã Gửi</th>
                <th className="py-3.5 px-4">Live Widgets</th>
                <th className="py-3.5 px-4">Trạng Thái</th>
                <th className="py-3.5 px-4 text-right">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Không tìm thấy người dùng phù hợp
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-900/40 transition duration-150"
                  >
                    {/* User Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                          alt={user.fullName}
                          className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200">{user.fullName}</span>
                            {user.currentTierCode === "PLUS" && (
                              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                            )}
                            {user.currentTierCode === "GOLD" && (
                              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono text-amber-400/90">{user.username}</span>
                            <span>•</span>
                            <span className="text-slate-500">{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Tier Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                          user.currentTierCode === "PLUS"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            : user.currentTierCode === "GOLD"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        )}
                      >
                        {user.currentTierName}
                      </span>
                    </td>

                    {/* Friends Count */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-200">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>{user.friendsCount} bạn thân</span>
                      </div>
                    </td>

                    {/* Moments Shared */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-200">
                        <Camera className="h-3.5 w-3.5 text-rose-400" />
                        <span>{formatNumber(user.momentsCount)} khoảnh khắc</span>
                      </div>
                    </td>

                    {/* Widgets Count */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Smartphone className="h-3.5 w-3.5 text-teal-400" />
                        <span>{user.widgetsCount} widget active</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          user.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}
                      >
                        {user.status === "ACTIVE" ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Hoạt động
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3 w-3" /> Bị khóa
                          </>
                        )}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleToggleBan(user)}
                        disabled={loadingUserId === user.id || user.role === "ADMIN"}
                        className={cn(
                          "rounded-lg px-3 py-1.5 font-medium transition text-xs",
                          user.status === "BANNED"
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
                          user.role === "ADMIN" && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {user.status === "BANNED" ? "Mở Khóa" : "Khóa Tài Khoản"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
