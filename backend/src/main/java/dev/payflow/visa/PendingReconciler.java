package dev.payflow.visa;

import dev.payflow.security.MerchantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Resolves captures and refunds that Visa accepted but has not yet confirmed, using read-only status lookups.
 * It never resubmits a financial operation, and UNKNOWN outcomes are left for a human. settle() is idempotent
 * under a row lock, so overlapping runs or several instances cannot double-post the ledger.
 */
@Component
@ConditionalOnProperty(name = "payflow.reconciler.enabled", havingValue = "true", matchIfMissing = true)
public class PendingReconciler {
    private static final Logger log = LoggerFactory.getLogger(PendingReconciler.class);
    private final JdbcTemplate jdbc;
    private final VisaPaymentWorkflow workflow;
    private final VisaProperties props;

    public PendingReconciler(JdbcTemplate jdbc, VisaPaymentWorkflow workflow, VisaProperties props) {
        this.jdbc = jdbc; this.workflow = workflow; this.props = props;
    }

    @Scheduled(initialDelayString = "${payflow.reconciler.interval-ms:30000}", fixedDelayString = "${payflow.reconciler.interval-ms:30000}")
    public void run() {
        if (!props.configured()) return;
        List<Map<String, Object>> due = jdbc.queryForList("""
            SELECT DISTINCT o.payment_id, p.merchant_id FROM visa_operations o JOIN payments p ON p.id=o.payment_id
            WHERE o.state='AWAITING_PROVIDER' AND o.provider_transaction_id IS NOT NULL
              AND o.updated_at < now() - interval '20 seconds' LIMIT 25""");
        for (Map<String, Object> row : due) {
            UUID id = (UUID) row.get("payment_id");
            try { MerchantContext.runAs((String) row.get("merchant_id"), () -> workflow.reconcile(id, "scheduler")); }
            catch (Exception e) { log.warn("Scheduled reconcile of {} skipped: {}", id, e.getMessage()); }
        }
    }
}
