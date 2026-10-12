"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Check,
  Plus,
  Edit2,
  Users,
  Video,
  HardDrive,
  Clock,
  Crown,
  X,
  Shield,
} from "lucide-react";
import { SubscriptionTier, TierLimits } from "@/types/admin";
import { formatVND, formatNumber, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";

interface TiersTabProps {
  tiers: SubscriptionTier[];
  onSaveTier: (tier: Partial<SubscriptionTier> & { name: string; code: string }) => Promise<any>;
}

export function TiersTab({ tiers, onSaveTier }: TiersTabProps) {
  const [editingTier, setEditingTier] = useState<SubscriptionTier | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [priceMonthly, setPriceMonthly] = useState(0);
  const [priceYearly, setPriceYearly] = useState(0);
  const [maxFriends, setMaxFriends] = useState(10);
  const [maxMomentsPerDay, setMaxMomentsPerDay] = useState(20);
  const [maxVideoSeconds, setMaxVideoSeconds] = useState(5);
  const [cloudStorageGb, setCloudStorageGb] = useState(1);
  const [featuresText, setFeaturesText] = useState("");

  const handleOpenEdit = (tier: SubscriptionTier) => {
    setEditingTier(tier);
    setName(tier.name);
    setCode(tier.code);
    setDescription(tier.description);
    setPriceMonthly(tier.priceMonthly);
    setPriceYearly(tier.priceYearly);
    setMaxFriends(tier.limits?.maxFriends ?? 10);
    setMaxMomentsPerDay(tier.limits?.maxMomentsPerDay ?? 20);
    setMaxVideoSeconds(tier.limits?.maxVideoSeconds ?? 5);
    setCloudStorageGb(tier.limits?.cloudStorageGb ?? 1);
    setFeaturesText(tier.features.join("\n"));
    setIsCreateOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingTier(null);
    setName("");
    setCode("");
    setDescription("");
    setPriceMonthly(0);
    setPriceYearly(0);
    setMaxFriends(50);
    setMaxMomentsPerDay(-1);
    setMaxVideoSeconds(15);
    setCloudStorageGb(10);
    setFeaturesText("Gửi khoảnh khắc không giới hạn\nVideo 15 giây\nLưu trữ Cloud 10GB");
    setIsCreateOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      toast.error("Vui lòng nhập tên gói và mã code");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveTier({
        id: editingTier?.id,
        name,
        code,
        description,
        priceMonthly: Number(priceMonthly),
        priceYearly: Number(priceYearly),
        durationDays: 30,
        limits: {
          maxFriends: Number(maxFriends),
          maxMomentsPerDay: Number(maxMomentsPerDay),
          maxVideoSeconds: Number(maxVideoSeconds),
          cloudStorageGb: Number(cloudStorageGb),
          historyDays: -1,
        },
        features: featuresText.split("\n").filter((f) => f.trim().length > 0),
        isActive: true,
      });

      toast.success(editingTier ? "Đã cập nhật gói cước thành công" : "Đã tạo gói cước mới thành công");
      setIsCreateOpen(false);
    } catch (err) {
      toast.error("Lỗi khi lưu cấu hình gói cước");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Cấu Hình Gói Hội Viên (LocCoc Subscription Tiers)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Thiết lập quyền lợi đặc quyền: số lượng bạn bè, thời lượng video, Cloud Storage và Widget màn hình khóa
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo Gói Mới</span>
        </button>
      </div>

      {/* Tier Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const isGold = tier.code === "GOLD";
          const isPlus = tier.code === "PLUS";

          return (
            <div
              key={tier.id}
              className={cn(
                "glass-panel rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-200 hover:border-amber-500/40",
                isGold && "border-amber-500/40 shadow-lg shadow-amber-500/10",
                isPlus && "border-purple-500/40 shadow-lg shadow-purple-500/10"
              )}
            >
              {tier.isPopular && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-400 to-amber-600 px-3 py-1 rounded-bl-xl text-[10px] font-bold text-slate-950 uppercase tracking-wider flex items-center gap-1">
                  <Crown className="h-3 w-3" />
                  Hot Nhất
                </div>
              )}

              <div>
                {/* Header */}
                <div className="flex items-center justify-between pr-8">
                  <span
                    className={cn(
                      "rounded-lg px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                      isPlus
                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        : isGold
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    )}
                  >
                    {tier.code}
                  </span>
                  <button
                    onClick={() => handleOpenEdit(tier)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                    title="Chỉnh sửa gói"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>

                <h3 className="text-base font-bold text-white mt-3">{tier.name}</h3>
                <p className="text-xs text-slate-400 mt-1 min-h-[32px]">{tier.description}</p>

                {/* Price */}
                <div className="mt-4 pb-4 border-b border-slate-800 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">
                    {tier.priceMonthly === 0 ? "Miễn Phí" : formatVND(tier.priceMonthly)}
                  </span>
                  {tier.priceMonthly > 0 && (
                    <span className="text-xs text-slate-400">/ tháng</span>
                  )}
                </div>

                {/* Limits & Quotas */}
                <div className="grid grid-cols-2 gap-2 my-4">
                  <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Users className="h-3 w-3 text-slate-400" />
                      Bạn Bè Ghim
                    </span>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {tier.limits?.maxFriends === -1 ? "Không giới hạn" : `Tối đa ${tier.limits?.maxFriends} bạn`}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Video className="h-3 w-3 text-slate-400" />
                      Độ Dài Video
                    </span>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {tier.limits?.maxVideoSeconds} giây
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <HardDrive className="h-3 w-3 text-slate-400" />
                      Cloud Storage
                    </span>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {tier.limits?.cloudStorageGb} GB
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-2.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      Lưu Lịch Sử
                    </span>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {tier.limits?.historyDays === -1 ? "Vĩnh viễn" : `${tier.limits?.historyDays} ngày`}
                    </div>
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-2 mt-4">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Đặc quyền gói cước:
                  </span>
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Revenue & Users */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Users className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    <strong className="text-white">{formatNumber(tier.subscribersCount)}</strong> hội viên
                  </span>
                </div>
                <span className="font-semibold text-amber-400">
                  {formatVND(tier.monthlyRevenue)} / tháng
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Create Tier Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in-0">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                {editingTier ? `Chỉnh sửa gói: ${editingTier.name}` : "Tạo Gói Hội Viên Mới"}
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tên Gói Hội Viên</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: LocCoc VIP Supporter"
                    required
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Mã Code (Uppercase)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="VD: VIP_CREATOR"
                    required
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Mô Tả Gói Cước</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả đặc quyền chính..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Giá Theo Tháng (VNĐ)</label>
                  <input
                    type="number"
                    value={priceMonthly}
                    onChange={(e) => setPriceMonthly(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Giá Theo Năm (VNĐ)</label>
                  <input
                    type="number"
                    value={priceYearly}
                    onChange={(e) => setPriceYearly(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tối Đa Bạn Bè (-1 = vô hạn)</label>
                  <input
                    type="number"
                    value={maxFriends}
                    onChange={(e) => setMaxFriends(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Thời Lượng Video (Giây)</label>
                  <input
                    type="number"
                    value={maxVideoSeconds}
                    onChange={(e) => setMaxVideoSeconds(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Cloud Storage (GB)</label>
                  <input
                    type="number"
                    value={cloudStorageGb}
                    onChange={(e) => setCloudStorageGb(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Khoảnh Khắc/Ngày (-1 = vô hạn)</label>
                  <input
                    type="number"
                    value={maxMomentsPerDay}
                    onChange={(e) => setMaxMomentsPerDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Danh Sách Đặc Quyền (Mỗi dòng 1 đặc quyền)</label>
                <textarea
                  rows={4}
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl px-4 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-amber-500 px-5 py-2 font-bold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 transition"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu Cấu Hình Gói"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
