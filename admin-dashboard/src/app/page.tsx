"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar, TabKey } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandMenu } from "@/components/layout/command-menu";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { UsersTab } from "@/components/dashboard/users-tab";
import { TiersTab } from "@/components/dashboard/tiers-tab";
import { PaymentsTab } from "@/components/dashboard/payments-tab";
import { AuditTab } from "@/components/dashboard/audit-tab";
import { SystemTab } from "@/components/dashboard/system-tab";
import { AdminApi } from "@/lib/api-client";
import { UserStatus, SubscriptionTier } from "@/types/admin";
import { toast } from "sonner";

export default function AdminDashboardPage() {
  const [currentTab, setCurrentTab] = useState<TabKey>("overview");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [useLiveApi, setUseLiveApi] = useState(false);

  const queryClient = useQueryClient();

  // Queries using TanStack Query
  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useQuery({
    queryKey: ["kpis", useLiveApi],
    queryFn: () => AdminApi.getKpis(useLiveApi),
  });

  const { data: revenueChart } = useQuery({
    queryKey: ["revenueChart", useLiveApi],
    queryFn: () => AdminApi.getRevenueChart(useLiveApi),
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["users", useLiveApi],
    queryFn: () => AdminApi.getUsers(useLiveApi),
  });

  const { data: tiers = [], refetch: refetchTiers } = useQuery({
    queryKey: ["tiers", useLiveApi],
    queryFn: () => AdminApi.getTiers(useLiveApi),
  });

  const { data: transactions = [], refetch: refetchTransactions } = useQuery({
    queryKey: ["transactions", useLiveApi],
    queryFn: () => AdminApi.getTransactions(useLiveApi),
  });

  const { data: auditLogs = [], refetch: refetchAuditLogs } = useQuery({
    queryKey: ["auditLogs", useLiveApi],
    queryFn: () => AdminApi.getAuditLogs(useLiveApi),
  });

  const { data: services = [], refetch: refetchServices } = useQuery({
    queryKey: ["services", useLiveApi],
    queryFn: () => AdminApi.getServicesHealth(useLiveApi),
  });

  // Mutations
  const updateUserMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      AdminApi.updateUserStatus(userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
    },
  });

  const saveTierMutation = useMutation({
    mutationFn: (tier: Partial<SubscriptionTier> & { name: string; code: string }) =>
      AdminApi.saveTier(tier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tiers"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
    },
  });

  const handleRefreshAll = async () => {
    await Promise.all([
      refetchKpis(),
      refetchUsers(),
      refetchTiers(),
      refetchTransactions(),
      refetchAuditLogs(),
      refetchServices(),
    ]);
    toast.success("Dữ liệu đã được cập nhật mới nhất");
  };

  const handleToggleLiveApi = () => {
    setUseLiveApi((prev) => {
      const next = !prev;
      if (next) {
        toast.info("Đã chuyển sang chế độ Live Gateway (http://localhost:3000)", {
          description: "Nếu Gateway chưa chạy, hệ thống sẽ tự động fallback sang Mock Data an toàn.",
        });
      } else {
        toast.success("Đã kích hoạt chế độ Interactive Mock Data");
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-[#090d16] text-slate-100">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <Header
          currentTab={currentTab}
          useLiveApi={useLiveApi}
          onToggleLiveApi={handleToggleLiveApi}
          onOpenCommand={() => setIsCommandOpen(true)}
          onRefreshData={handleRefreshAll}
          isRefreshing={kpisLoading}
        />

        <main className="flex-1 p-6 md:p-8 max-w-[1600px] w-full mx-auto">
          {currentTab === "overview" && (
            <OverviewTab
              kpis={kpis}
              tiers={tiers}
              transactions={transactions}
              revenueChart={revenueChart}
              onNavigateTab={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === "users" && (
            <UsersTab
              users={users}
              onUpdateStatus={async (userId, status) => {
                await updateUserMutation.mutateAsync({ userId, status });
              }}
            />
          )}

          {currentTab === "tiers" && (
            <TiersTab
              tiers={tiers}
              onSaveTier={async (tier) => {
                await saveTierMutation.mutateAsync(tier);
              }}
            />
          )}

          {currentTab === "payments" && (
            <PaymentsTab transactions={transactions} />
          )}

          {currentTab === "audit" && (
            <AuditTab logs={auditLogs} />
          )}

          {currentTab === "system" && (
            <SystemTab
              services={services}
              onRefresh={refetchServices}
            />
          )}
        </main>
      </div>

      {/* Command Palette */}
      <CommandMenu
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenCreateTier={() => {
          setCurrentTab("tiers");
        }}
      />
    </div>
  );
}
