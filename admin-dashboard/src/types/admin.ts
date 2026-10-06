export type UserRole = "ADMIN" | "USER" | "CREATOR" | "MODERATOR";
export type UserStatus = "ACTIVE" | "INACTIVE" | "BANNED" | "PENDING_VERIFICATION";

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  username: string; // e.g. @nhan.loccoc
  phoneNumber?: string;
  role: UserRole;
  status: UserStatus;
  currentTierCode: "FREE" | "GOLD" | "PLUS" | "VIP";
  currentTierName: string;
  friendsCount: number;
  momentsCount: number;
  widgetsCount: number;
  totalSpent: number;
  createdAt: string;
  lastActiveAt?: string;
  avatarUrl?: string;
}

export interface TierLimits {
  maxFriends: number; // -1 for unlimited
  maxMomentsPerDay: number; // -1 for unlimited
  maxVideoSeconds: number;
  cloudStorageGb: number;
  historyDays: number; // -1 for lifetime
}

export interface SubscriptionTier {
  id: string;
  name: string;
  code: string; // e.g. "FREE", "GOLD", "PLUS"
  description: string;
  priceMonthly: number;
  priceYearly: number;
  durationDays: number;
  limits: TierLimits;
  features: string[];
  isActive: boolean;
  isPopular?: boolean;
  subscribersCount: number;
  monthlyRevenue: number;
  updatedAt: string;
}

export type PaymentStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED" | "REFUNDED";

export interface PayOSTransaction {
  id: string;
  orderCode: number;
  userId: string;
  userName: string;
  userEmail: string;
  tierId: string;
  tierName: string;
  amount: number;
  status: PaymentStatus;
  description: string;
  paymentLinkId?: string;
  qrCodeUrl?: string;
  payOsTransactionId?: string;
  createdAt: string;
  paidAt?: string;
  webhookVerified: boolean;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: UserRole;
  service: "admin-service" | "payment-service" | "auth-service" | "user-service" | "api-gateway";
  action: string;
  targetEntity: string;
  targetId: string;
  ipAddress: string;
  userAgent: string;
  status: "SUCCESS" | "FAILED" | "UNAUTHORIZED";
  details?: Record<string, any>;
  createdAt: string;
}

export interface ServiceHealth {
  name: string;
  port: number;
  status: "UP" | "DOWN" | "DEGRADED";
  latencyMs: number;
  uptime: string;
  version: string;
  dbPoolActive: number;
  dbPoolMax: number;
  lastChecked: string;
}

export interface KpiSummary {
  mrr: number;
  mrrGrowth: number;
  totalUsers: number;
  usersGrowth: number;
  activeSubscriptions: number;
  subGrowth: number;
  todayMomentsShared: number;
  todayActiveWidgets: number;
  paymentSuccessRate: number;
  todayTransactions: number;
  todayRevenue: number;
  servicesUpCount: number;
  servicesTotal: number;
}

export interface RevenueMetric {
  date: string;
  revenue: number;
  transactions: number;
  newSubscriptions: number;
}
