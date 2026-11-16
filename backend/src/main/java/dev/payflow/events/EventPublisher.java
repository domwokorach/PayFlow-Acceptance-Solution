package dev.payflow.events;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Records a payment's current status in the outbox inside the caller's transaction, and pushes it to live
 * subscribers only after that transaction commits. A rollback therefore emits nothing.
 */
@Component
public class EventPublisher {
    private record Scoped(String merchant, DomainEvent event) {}
    private final JdbcTemplate jdbc;
    private final EventStream stream;

    public EventPublisher(JdbcTemplate jdbc, EventStream stream) { this.jdbc = jdbc; this.stream = stream; }

    /** Reads the status from the row so the event always matches what was just written. */
    public void paymentChanged(UUID paymentId) {
        List<Scoped> rows = jdbc.query("""
            INSERT INTO domain_events (merchant_id,type,payment_id,status)
            SELECT merchant_id, ?, id, status FROM payments WHERE id=?
            RETURNING seq,type,payment_id,status,occurred_at,merchant_id""",
            (rs, n) -> new Scoped(rs.getString(6), DomainEvent.of(rs.getLong(1), rs.getString(2), (UUID) rs.getObject(3),
                rs.getString(4), rs.getTimestamp(5).toInstant())),
            DomainEvent.PAYMENT_STATUS_CHANGED, paymentId);
        if (rows.isEmpty()) return;
        String merchant = rows.getFirst().merchant();
        DomainEvent event = rows.getFirst().event();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { stream.broadcast(merchant, event); }
            });
        } else {
            stream.broadcast(merchant, event);
        }
    }

    /** Outbox row for a profile change; delivered to the merchant's subscribers only after the surrounding transaction commits. */
    public void merchantUpdated(String merchantId) {
        DomainEvent event = jdbc.queryForObject("""
            INSERT INTO domain_events (merchant_id,type) VALUES (?, ?) RETURNING seq,occurred_at""",
            (rs, n) -> DomainEvent.merchant(rs.getLong(1), merchantId, rs.getTimestamp(2).toInstant()),
            merchantId, DomainEvent.MERCHANT_UPDATED);
        if (event == null) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { stream.broadcast(merchantId, event); }
            });
        } else {
            stream.broadcast(merchantId, event);
        }
    }

    public List<DomainEvent> after(String merchant, long afterSeq, int limit) {
        return jdbc.query("""
            SELECT seq,type,payment_id,status,occurred_at FROM domain_events
            WHERE merchant_id=? AND seq>? ORDER BY seq LIMIT ?""",
            (rs, n) -> DomainEvent.MERCHANT_UPDATED.equals(rs.getString(2))
                ? DomainEvent.merchant(rs.getLong(1), merchant, rs.getTimestamp(5).toInstant())
                : DomainEvent.of(rs.getLong(1), rs.getString(2), (UUID) rs.getObject(3), rs.getString(4),
                    rs.getTimestamp(5).toInstant()), merchant, afterSeq, limit);
    }

    public long latestSeq(String merchant) {
        Long v = jdbc.queryForObject("SELECT coalesce(max(seq),0) FROM domain_events WHERE merchant_id=?", Long.class, merchant);
        return v == null ? 0 : v;
    }
}
