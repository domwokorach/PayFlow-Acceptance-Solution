package dev.payflow.core;

import dev.payflow.security.MerchantContext;
import dev.payflow.security.MerchantContext;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Append-only audit trail. Details must never contain card data, credentials or provider response bodies. */
@Component
public class AuditLog {
    private final JdbcTemplate jdbc;
    public AuditLog(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void record(String actor, String action, UUID paymentId, UUID operationId, String detail) {
        jdbc.update("""
            INSERT INTO audit_log (id,merchant_id,actor,action,payment_id,operation_id,detail)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            UUID.randomUUID(), MerchantContext.current(), actor, action, paymentId, operationId,
            detail == null ? null : detail.substring(0, Math.min(detail.length(), 200)));
    }
}
