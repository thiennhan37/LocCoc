import {
  MOCK_KPIS,
  MOCK_TIERS,
  MOCK_USERS,
  MOCK_TRANSACTIONS,
  MOCK_AUDIT_LOGS,
  MOCK_SERVICES,
  MOCK_REVENUE_CHART,
} from "./mock-data";
import {
  UserAccount,
  SubscriptionTier,
  PayOSTransaction,
  AuditLogItem,
  ServiceHealth,
  KpiSummary,
  RevenueMetric,
} from "@/types/admin";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// In-memory state store for interactive mock updates
let localUsers = [...MOCK_USERS];
let localTiers = [...MOCK_TIERS];
let localTransactions = [...MOCK_TRANSACTIONS];
let localAuditLogs = [...MOCK_AUDIT_LOGS];

export const AdminApi = {
  // KPIs & Overview
  async getKpis(useLive = false): Promise<KpiSummary> {
    if (useLive) {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/reports/analytics`, {
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("Falling back to mock KPIs:", err);
      }
    }
    return MOCK_KPIS;
  },

  async getRevenueChart(useLive = false): Promise<RevenueMetric[]> {
    return MOCK_REVENUE_CHART;
  },

  // Users Management
  async getUsers(useLive = false): Promise<UserAccount[]> {
    if (useLive) {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/users`, {
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("Falling back to mock Users:", err);
      }
    }
    return localUsers;
  },

  async updateUserStatus(userId: string, status: UserAccount["status"]): Promise<UserAccount> {
    localUsers = localUsers.map((u) =>
      u.id === userId ? { ...u, status } : u
    );
    const updated = localUsers.find((u) => u.id === userId)!;

    // Record audit log
    localAuditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: "usr-01",
      actorEmail: "ducthinh.admin@loccoc.vn",
      actorRole: "ADMIN",
      service: "admin-service",
      action: status === "BANNED" ? "BAN_USER" : "UPDATE_USER_STATUS",
      targetEntity: "UserAccount",
      targetId: userId,
      ipAddress: "127.0.0.1",
      userAgent: "LocCoc-WebAdmin",
      status: "SUCCESS",
      details: { newStatus: status, username: updated?.username },
      createdAt: new Date().toISOString(),
    });

    return updated;
  },

  // Subscription Tiers
  async getTiers(useLive = false): Promise<SubscriptionTier[]> {
    if (useLive) {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/tiers`, {
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("Falling back to mock Tiers:", err);
      }
    }
    return localTiers;
  },

  async saveTier(tier: Partial<SubscriptionTier> & { name: string; code: string }): Promise<SubscriptionTier> {
    if (tier.id) {
      localTiers = localTiers.map((t) =>
        t.id === tier.id ? ({ ...t, ...tier, updatedAt: new Date().toISOString() } as SubscriptionTier) : t
      );
      const updated = localTiers.find((t) => t.id === tier.id)!;
      return updated;
    } else {
      const newTier: SubscriptionTier = {
        id: `tier-${Date.now()}`,
        name: tier.name,
        code: tier.code.toUpperCase(),
        description: tier.description || "",
        priceMonthly: tier.priceMonthly || 0,
        priceYearly: tier.priceYearly || 0,
        durationDays: tier.durationDays || 30,
        limits: tier.limits || {
          maxFriends: 50,
          maxMomentsPerDay: -1,
          maxVideoSeconds: 15,
          cloudStorageGb: 10,
          historyDays: -1,
        },
        features: tier.features || [],
        isActive: tier.isActive ?? true,
        subscribersCount: 0,
        monthlyRevenue: 0,
        updatedAt: new Date().toISOString(),
      };
      localTiers.push(newTier);
      return newTier;
    }
  },

  // PayOS Transactions
  async getTransactions(useLive = false): Promise<PayOSTransaction[]> {
    if (useLive) {
      try {
        const res = await fetch(`${API_BASE_URL}/payments/history`, {
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("Falling back to mock Transactions:", err);
      }
    }
    return localTransactions;
  },

  // Audit Logs
  async getAuditLogs(useLive = false): Promise<AuditLogItem[]> {
    if (useLive) {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/audit-logs`, {
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("Falling back to mock Audit Logs:", err);
      }
    }
    return localAuditLogs;
  },

  // System Services Health
  async getServicesHealth(useLive = false): Promise<ServiceHealth[]> {
    return MOCK_SERVICES;
  },
};
