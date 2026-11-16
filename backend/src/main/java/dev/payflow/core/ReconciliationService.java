package dev.payflow.core;

import dev.payflow.security.MerchantContext;
import dev.payflow.model.PaymentDtos.*;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only integrity report over persisted payments, provider operations and the ledger. */
@Service
public class ReconciliationService {
    private final JdbcTemplate jdbc;
    public ReconciliationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public ReconciliationReport report() {
        long checked = count("SELECT count(*) FROM payments WHERE merchant_id=?", MerchantContext.current());
        long journals = count("SELECT count(DISTINCT l.journal_id) FROM ledger_entries l JOIN payments p ON p.id=l.payment_id WHERE p.merchant_id=?", MerchantContext.current());
        long unbalanced = count("""
            SELECT count(*) FROM (SELECT l.journal_id FROM ledger_entries l JOIN payments p ON p.id=l.payment_id
              WHERE p.merchant_id=? GROUP BY l.journal_id
              HAVING sum(CASE WHEN l.direction='DEBIT' THEN l.amount_minor ELSE -l.amount_minor END) <> 0) x""", MerchantContext.current());

        List<ReconciliationItem> awaiting = jdbc.query("""
            SELECT p.id,p.status,p.provider,p.amount_minor,p.currency,o.kind,o.state,o.provider_status,
                   coalesce(o.updated_at,p.created_at)
            FROM payments p
            LEFT JOIN LATERAL (SELECT * FROM visa_operations v WHERE v.payment_id=p.id ORDER BY v.created_at DESC LIMIT 1) o ON true
            WHERE p.merchant_id=? AND p.status IN ('PENDING_AUTHORIZATION','CAPTURE_PENDING','REFUND_PENDING','REVIEW_REQUIRED')
            ORDER BY coalesce(o.updated_at,p.created_at) DESC LIMIT 200""",
            (rs, n) -> new ReconciliationItem((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getLong(4),
                rs.getString(5).trim(), rs.getString(6), rs.getString(7), rs.getString(8), rs.getTimestamp(9).toInstant(),
                action(rs.getString(2), rs.getString(7))), MerchantContext.current());

        List<Discrepancy> issues = new ArrayList<>();
        add(issues, "Captured payment has no ledger entries", """
            SELECT p.id FROM payments p WHERE p.merchant_id=? AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')
              AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.payment_id=p.id AND l.operation='CAPTURE')""");
        add(issues, "Uncaptured payment has ledger entries", """
            SELECT p.id FROM payments p WHERE p.merchant_id=? AND p.status IN ('AUTHORIZED','DECLINED','PENDING_AUTHORIZATION','CAPTURE_PENDING')
              AND EXISTS (SELECT 1 FROM ledger_entries l WHERE l.payment_id=p.id)""");
        add(issues, "Refunded amount differs from completed refunds", """
            SELECT p.id FROM payments p WHERE p.merchant_id=?
              AND p.refunded_amount_minor <> coalesce((SELECT sum(r.amount_minor) FROM refunds r WHERE r.payment_id=p.id AND r.status='COMPLETED'),0)""");
        add(issues, "Refunded amount differs from ledger refund entries", """
            SELECT p.id FROM payments p WHERE p.merchant_id=?
              AND p.refunded_amount_minor <> coalesce((SELECT sum(l.amount_minor) FROM ledger_entries l
                    WHERE l.payment_id=p.id AND l.operation='REFUND' AND l.direction='DEBIT'),0)""");
        add(issues, "Refunded amount does not match status", """
            SELECT p.id FROM payments p WHERE p.merchant_id=? AND (
              p.refunded_amount_minor > p.amount_minor
              OR (p.status='REFUNDED' AND p.refunded_amount_minor <> p.amount_minor)
              OR (p.status='PARTIALLY_REFUNDED' AND (p.refunded_amount_minor <= 0 OR p.refunded_amount_minor >= p.amount_minor)))""");
        return new ReconciliationReport(java.time.Instant.now(), checked, journals, unbalanced, awaiting, issues);
    }

    private static String action(String status, String opState) {
        return switch (status) {
            case "REVIEW_REQUIRED" -> "Outcome unknown. Verify in the Visa sandbox business center; do not resubmit.";
            case "CAPTURE_PENDING", "REFUND_PENDING" -> "AWAITING_PROVIDER".equals(opState)
                ? "Provider status is checked automatically; you can also check now." : "Request in flight.";
            default -> "Authorization in flight.";
        };
    }
    private void add(List<Discrepancy> out, String issue, String sql) {
        jdbc.query(sql, (org.springframework.jdbc.core.RowCallbackHandler) rs -> out.add(new Discrepancy((UUID) rs.getObject(1), issue)), MerchantContext.current());
    }
    private long count(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }
}
