export type Status = "PENDING_AUTHORIZATION" | "AUTHORIZED" | "DECLINED" | "CAPTURE_PENDING" | "CAPTURED" | "REFUND_PENDING" | "PARTIALLY_REFUNDED" | "REFUNDED" | "REVIEW_REQUIRED";
export type Payment = {
  id: string;
  merchantId: string;
  amountMinor: number;
  currency: string;
  status: Status;
  refundedAmountMinor: number;
  provider: string;
  createdAt: string;
  /** Latest provider status code for Visa payments (for example HTTP_401); null for simulated payments. */
  providerStatus?: string | null;
};
export type DailyVolume = { date: string; amountMinor: number };
export type Totals = {
  total: number; successful: number; declined: number; authorized: number; capturedCount: number;
  capturedVolumeMinor: number; refundedVolumeMinor: number;
  pendingAuthorizations: number; pendingCaptures: number; pendingRefunds: number; reviewRequired: number;
};
export type DayStat = { date: string; capturedMinor: number; refundedMinor: number; successful: number; declined: number };
export type ProviderHealthState = "HEALTHY" | "DEGRADED" | "IDLE" | "NOT_CONFIGURED";
export type ProviderStat = { name: string; total: number; successful: number; declined: number; lastUsed: string | null; health: ProviderHealthState; healthDetail: string };
export type Summary = {
  // original contract: all-time totals
  totalTransactions: number; authorized: number; declined: number; successfulPayments: number;
  capturedVolumeMinor: number; refundedVolumeMinor: number; dailyVolume: DailyVolume[];
  // range-aware figures, aggregated by the backend from PostgreSQL
  generatedAt: string; days: number; totals: Totals; previous: Totals | null; daily: DayStat[];
  statusCounts: Record<string, number>; providers: ProviderStat[];
};
export type Merchant = { id: string; displayName: string; contactEmail: string | null; businessName: string | null; createdAt: string; updatedAt: string };
/** Partial update: omitted fields are unchanged, an empty string clears an optional field. */
export type UpdateMerchantRequest = { displayName?: string; contactEmail?: string; businessName?: string };
export type Refund = { id: string; paymentId: string; amountMinor: number; createdAt: string; status?: string };
export type ReconciliationItem = {
  paymentId: string; status: Status; provider: string; amountMinor: number; currency: string;
  operationKind: string | null; operationState: string | null; providerStatus: string | null; since: string; action: string;
};
export type ReconciliationReport = {
  generatedAt: string; paymentsChecked: number; journals: number; unbalancedJournals: number;
  awaiting: ReconciliationItem[]; discrepancies: { paymentId: string; issue: string }[];
};
