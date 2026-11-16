package dev.payflow.model;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PaymentDtos {
    private PaymentDtos() {}
    public record CreatePaymentRequest(@Positive @Max(100000000) long amountMinor,
                                       @Pattern(regexp = "[A-Z]{3}") String currency,
                                       boolean simulateDecline,
                                       @Pattern(regexp = "SIMULATED|VISA_SANDBOX") String provider) {
        public CreatePaymentRequest(long amountMinor, String currency, boolean simulateDecline) { this(amountMinor, currency, simulateDecline, null); }
    }
    public record RefundRequest(@Positive @Max(100000000) long amountMinor) {}
    public record PaymentView(UUID id, String merchantId, long amountMinor,
                              String currency, String status, long refundedAmountMinor,
                              String provider, Instant createdAt, String providerStatus) {}
    public record RefundView(UUID id, UUID paymentId, long amountMinor, Instant createdAt, String status) {}
    public record DailyVolume(String date, long amountMinor) {}
    /** Counts and volumes for one time window. successful = not declined, not still authorizing, not under review. */
    public record Totals(long total, long successful, long declined, long authorized, long capturedCount,
                         long capturedVolumeMinor, long refundedVolumeMinor, long pendingAuthorizations,
                         long pendingCaptures, long pendingRefunds, long reviewRequired) {}
    public record DayStat(String date, long capturedMinor, long refundedMinor, long successful, long declined) {}
    /** health: HEALTHY | DEGRADED | IDLE | NOT_CONFIGURED, derived from persisted provider operations. */
    public record ProviderStat(String name, long total, long successful, long declined, Instant lastUsed,
                               String health, String healthDetail) {}
    /** The first seven fields keep the original contract (all-time totals, 30-day volume). */
    public record DashboardSummary(long totalTransactions, long authorized, long declined,
                                   long capturedVolumeMinor, long refundedVolumeMinor,
                                   long successfulPayments, List<DailyVolume> dailyVolume,
                                   Instant generatedAt, int days, Totals totals, Totals previous,
                                   List<DayStat> daily, java.util.Map<String, Long> statusCounts,
                                   List<ProviderStat> providers) {}
    public record ReconciliationItem(UUID paymentId, String status, String provider, long amountMinor, String currency,
                                     String operationKind, String operationState, String providerStatus,
                                     Instant since, String action) {}
    public record Discrepancy(UUID paymentId, String issue) {}
    public record ReconciliationReport(Instant generatedAt, long paymentsChecked, long journals,
                                       long unbalancedJournals, List<ReconciliationItem> awaiting,
                                       List<Discrepancy> discrepancies) {}
}
