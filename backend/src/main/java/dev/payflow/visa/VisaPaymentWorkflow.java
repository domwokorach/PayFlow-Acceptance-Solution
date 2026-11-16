package dev.payflow.visa;

import dev.payflow.security.MerchantContext;
import dev.payflow.core.AuditLog;
import dev.payflow.core.Idempotency;
import dev.payflow.events.EventPublisher;
import dev.payflow.core.Ledger;
import dev.payflow.core.PaymentPolicy;
import dev.payflow.core.PaymentService;
import dev.payflow.model.PaymentDtos.*;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Persist intent -> call Visa OUTSIDE any DB transaction -> commit outcome.
 * If the outcome is unknown the payment goes to REVIEW_REQUIRED and is never blindly retried.
 */
@Component
public class VisaPaymentWorkflow {
    public static final String PROVIDER = "VISA_SANDBOX";
    private static final Logger log = LoggerFactory.getLogger(VisaPaymentWorkflow.class);

    private record Op(UUID id, UUID paymentId, UUID refundId, String kind, String fingerprint, String state,
                      String providerTxId, long amountMinor) {}
    private record Intent(boolean replay, UUID paymentId, UUID opId, UUID refundId, String providerRef,
                          long amountMinor, String currency) {}

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final VisaSandboxGateway gateway;
    private final VisaProperties props;
    private final PaymentService payments;
    private final Ledger ledger;
    private final EventPublisher events;
    private final AuditLog audit;

    public VisaPaymentWorkflow(JdbcTemplate jdbc, TransactionTemplate tx, VisaSandboxGateway gateway,
                               VisaProperties props, PaymentService payments, Ledger ledger,
                               EventPublisher events, AuditLog audit) {
        this.jdbc = jdbc; this.tx = tx; this.gateway = gateway; this.props = props;
        this.payments = payments; this.ledger = ledger; this.events = events; this.audit = audit;
    }

    public boolean owns(UUID paymentId) {
        return !jdbc.queryForList("SELECT 1 FROM payments WHERE id=? AND provider=?", paymentId, PROVIDER).isEmpty();
    }

    // ---------------------------------------------------------------- authorize
    public PaymentView authorize(CreatePaymentRequest request, String key) {
        requireConfigured(); validateKey(key);
        if (!"GBP".equals(request.currency())) throw bad("Demo currently supports GBP only");
        if (request.simulateDecline()) throw bad("simulateDecline is not supported for the Visa sandbox");
        String fp = Idempotency.fingerprint("VISA_AUTH|" + request.amountMinor() + "|" + request.currency());
        Intent intent = begin(key, () -> tx.execute(s -> {
            Optional<Op> existing = findByKey(key);
            if (existing.isPresent()) return replay(existing.get(), fp);
            UUID paymentId = UUID.randomUUID(), opId = UUID.randomUUID();
            jdbc.update("""
              INSERT INTO payments(id,merchant_id,amount_minor,currency,status,provider)
              VALUES (?,?,?,?,'PENDING_AUTHORIZATION',?)""", paymentId, MerchantContext.current(), request.amountMinor(), request.currency(), PROVIDER);
            insertOp(opId, paymentId, null, "AUTHORIZE", key, fp, request.amountMinor());
            events.paymentChanged(paymentId);
            return new Intent(false, paymentId, opId, null, null, request.amountMinor(), request.currency());
        }), key, fp);
        if (intent.replay()) return payments.get(intent.paymentId());
        callAndSettle(intent, () -> gateway.authorize(intent.paymentId(), intent.amountMinor(), intent.currency()));
        return payments.get(intent.paymentId());
    }

    // ---------------------------------------------------------------- capture
    public PaymentView capture(UUID id, String key) {
        requireConfigured(); validateKey(key);
        String fp = Idempotency.fingerprint("VISA_CAPTURE|" + id);
        Intent intent = begin(key, () -> tx.execute(s -> {
            Optional<Op> existing = findByKey(key);
            if (existing.isPresent()) return replay(existing.get(), fp);
            PaymentRow p = lock(id);
            if (!PaymentPolicy.canCapture(p.status())) throw conflict("Only AUTHORIZED payments can be captured");
            if (p.authId() == null) throw conflict("Payment has no Visa authorization reference");
            UUID opId = UUID.randomUUID();
            jdbc.update("UPDATE payments SET status='CAPTURE_PENDING' WHERE id=?", id);
            insertOp(opId, id, null, "CAPTURE", key, fp, p.amount());
            events.paymentChanged(id);
            return new Intent(false, id, opId, null, p.authId(), p.amount(), p.currency());
        }), key, fp);
        if (intent.replay()) return payments.get(intent.paymentId());
        callAndSettle(intent, () -> gateway.capture(intent.providerRef(), id, intent.amountMinor(), intent.currency()));
        return payments.get(id);
    }

    // ---------------------------------------------------------------- refund
    public RefundView refund(UUID id, RefundRequest request, String key) {
        requireConfigured(); validateKey(key);
        String fp = Idempotency.fingerprint("VISA_REFUND|" + id + "|" + request.amountMinor());
        Intent intent = begin(key, () -> tx.execute(s -> {
            Optional<Op> existing = findByKey(key);
            if (existing.isPresent()) return replay(existing.get(), fp);
            PaymentRow p = lock(id);
            if (!PaymentPolicy.canRefund(p.status())) throw conflict("Payment must be captured before refunding");
            if (p.captureId() == null) throw conflict("Payment has no Visa capture reference");
            PaymentPolicy.statusAfterRefund(p.amount(), p.refunded(), request.amountMinor()); // validates remaining
            UUID refundId = UUID.randomUUID(), opId = UUID.randomUUID();
            jdbc.update("INSERT INTO refunds(id,payment_id,amount_minor,status) VALUES (?,?,?,'PENDING')", refundId, id, request.amountMinor());
            jdbc.update("UPDATE payments SET status='REFUND_PENDING' WHERE id=?", id);
            insertOp(opId, id, refundId, "REFUND", key, fp, request.amountMinor());
            events.paymentChanged(id);
            return new Intent(false, id, opId, refundId, p.captureId(), request.amountMinor(), p.currency());
        }), key, fp);
        if (intent.replay()) return payments.getRefund(intent.refundId());
        callAndSettle(intent, () -> gateway.refund(intent.providerRef(), intent.refundId(), intent.amountMinor(), intent.currency()));
        return payments.getRefund(intent.refundId());
    }

    // ---------------------------------------------------------------- reconcile (read-only lookup)
    public PaymentView reconcile(UUID id, String actor) {
        requireConfigured();
        PaymentView p = payments.get(id);
        if (!PROVIDER.equals(p.provider())) throw conflict("Only Visa sandbox payments can be reconciled");
        if ("REVIEW_REQUIRED".equals(p.status())) throw conflict("Payment requires manual review; automatic reconciliation is disabled");
        if (!Set.of("CAPTURE_PENDING", "REFUND_PENDING").contains(p.status())) throw conflict("Nothing awaiting the provider");
        List<Op> ops = jdbc.query("""
            SELECT * FROM visa_operations WHERE payment_id=? AND state='AWAITING_PROVIDER'
            ORDER BY created_at DESC LIMIT 1""", (rs, n) -> mapOp(rs), id);
        if (ops.isEmpty() || ops.getFirst().providerTxId() == null) throw conflict("No provider operation awaiting confirmation");
        Op op = ops.getFirst();
        ProviderResult result;
        try {
            result = gateway.status(op.providerTxId());
        } catch (VisaProviderException e) {
            log.warn("Visa status lookup failed for operation {}: {}", op.id(), e.getMessage());
            tx.executeWithoutResult(s -> audit.record(actor, "RECONCILE_LOOKUP_FAILED", id, op.id(), e.getMessage()));
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Visa status lookup failed; try again later");
        }
        tx.executeWithoutResult(s -> {
            audit.record(actor, "RECONCILE_LOOKUP", id, op.id(), "provider status " + result.providerStatus());
            settle(op.id(), Set.of("AWAITING_PROVIDER"), result);
        });
        return payments.get(id);
    }

    // ---------------------------------------------------------------- internals
    private void callAndSettle(Intent intent, java.util.function.Supplier<ProviderResult> call) {
        ProviderResult result;
        try {
            result = call.get(); // network I/O: no DB transaction open
        } catch (VisaProviderException e) {
            if (!definitiveRejection(e.httpStatus())) { markUnknownAndAudit(intent, e); return; }
            // A 4xx means Visa refused the request before processing it, so the outcome is known and retry-safe.
            log.warn("Visa operation {} rejected with HTTP {}", intent.opId(), e.httpStatus());
            ProviderResult rejected = new ProviderResult(ProviderState.DECLINED, null, "HTTP_" + e.httpStatus());
            tx.executeWithoutResult(s -> settle(intent.opId(), Set.of("IN_FLIGHT"), rejected));
            return;
        } catch (RuntimeException e) {
            markUnknownAndAudit(intent, e); // never log bodies or secrets, only the sanitized message
            return;
        }
        tx.executeWithoutResult(s -> settle(intent.opId(), Set.of("IN_FLIGHT"), result));
    }

    private void markUnknownAndAudit(Intent intent, RuntimeException e) {
        log.warn("Visa operation {} outcome unknown: {}", intent.opId(), e.getMessage());
        tx.executeWithoutResult(s -> markUnknown(intent.opId(), e.getMessage()));
    }

    /** 408 and 429 say nothing about whether the request was processed, so they stay unknown. */
    private static boolean definitiveRejection(int http) { return http >= 400 && http < 500 && http != 408 && http != 429; }

    private void markUnknown(UUID opId, String reason) {
        Op op = lockOp(opId);
        if (!"IN_FLIGHT".equals(op.state())) return;
        jdbc.update("UPDATE visa_operations SET state='UNKNOWN', provider_status=?, updated_at=now() WHERE id=?",
            truncate(reason, 40), opId);
        jdbc.update("UPDATE payments SET status='REVIEW_REQUIRED' WHERE id=?", op.paymentId());
        audit.record("system", "OUTCOME_UNKNOWN", op.paymentId(), opId, op.kind() + ": " + reason);
        events.paymentChanged(op.paymentId());
    }

    /** Commits a provider outcome. Idempotent: ignored unless the operation is in an expected state. */
    private void settle(UUID opId, Set<String> expected, ProviderResult r) {
        Op op = lockOp(opId);
        if (!expected.contains(op.state())) return;
        PaymentRow p = lock(op.paymentId());
        String txId = r.transactionId() != null ? r.transactionId() : op.providerTxId();
        String ps = truncate(r.providerStatus(), 40);
        switch (op.kind()) {
            case "AUTHORIZE" -> {
                if (r.state() == ProviderState.AUTHORIZED && txId != null) {
                    jdbc.update("UPDATE payments SET status='AUTHORIZED', provider_authorization_id=? WHERE id=?", txId, p.id());
                    finishOp(opId, "SUCCEEDED", txId, ps);
                } else if (r.state() == ProviderState.DECLINED) {
                    jdbc.update("UPDATE payments SET status='DECLINED' WHERE id=?", p.id());
                    finishOp(opId, "DECLINED", txId, ps);
                } else {
                    jdbc.update("UPDATE payments SET status='REVIEW_REQUIRED' WHERE id=?", p.id());
                    finishOp(opId, "UNKNOWN", txId, ps);
                }
            }
            case "CAPTURE" -> {
                if (r.state() == ProviderState.CONFIRMED) {
                    jdbc.update("UPDATE payments SET status='CAPTURED', captured_at=now(), provider_capture_id=? WHERE id=?", txId, p.id());
                    ledger.post(p.id(), "CAPTURE", p.amount(), p.currency());
                    finishOp(opId, "SUCCEEDED", txId, ps);
                } else if (r.state() == ProviderState.DECLINED) {
                    jdbc.update("UPDATE payments SET status='AUTHORIZED' WHERE id=?", p.id());
                    finishOp(opId, "DECLINED", txId, ps);
                } else { // PENDING or unsupported: still awaiting the provider
                    jdbc.update("UPDATE payments SET status='CAPTURE_PENDING', provider_capture_id=? WHERE id=?", txId, p.id());
                    finishOp(opId, "AWAITING_PROVIDER", txId, ps);
                }
            }
            case "REFUND" -> {
                if (r.state() == ProviderState.CONFIRMED) {
                    String next = PaymentPolicy.statusAfterRefund(p.amount(), p.refunded(), op.amountMinor());
                    jdbc.update("UPDATE refunds SET status='COMPLETED' WHERE id=?", op.refundId());
                    jdbc.update("UPDATE payments SET status=?, refunded_amount_minor=refunded_amount_minor+? WHERE id=?",
                        next, op.amountMinor(), p.id());
                    ledger.post(p.id(), "REFUND", op.amountMinor(), p.currency());
                    finishOp(opId, "SUCCEEDED", txId, ps);
                } else if (r.state() == ProviderState.DECLINED) {
                    jdbc.update("UPDATE refunds SET status='FAILED' WHERE id=?", op.refundId());
                    jdbc.update("UPDATE payments SET status=? WHERE id=?", p.refunded() > 0 ? "PARTIALLY_REFUNDED" : "CAPTURED", p.id());
                    finishOp(opId, "DECLINED", txId, ps);
                } else {
                    jdbc.update("UPDATE payments SET status='REFUND_PENDING' WHERE id=?", p.id());
                    finishOp(opId, "AWAITING_PROVIDER", txId, ps);
                }
            }
            default -> throw new IllegalStateException("Unknown operation kind");
        }
        audit.record("system", "PROVIDER_OUTCOME", p.id(), opId, op.kind() + " -> provider status " + ps);
        String after = jdbc.queryForObject("SELECT status FROM payments WHERE id=?", String.class, p.id());
        if (!p.status().equals(after)) events.paymentChanged(p.id()); // still-pending outcomes change nothing a client can see
    }

    private void finishOp(UUID opId, String state, String txId, String providerStatus) {
        jdbc.update("""
          UPDATE visa_operations SET state=?, provider_transaction_id=?, provider_status=?, updated_at=now() WHERE id=?""",
            state, txId, providerStatus, opId);
    }

    private Intent begin(String key, java.util.function.Supplier<Intent> action, String key2, String fp) {
        try {
            return action.get();
        } catch (DuplicateKeyException race) { // concurrent request with the same key won the insert
            return tx.execute(s -> replay(findByKey(key2).orElseThrow(), fp));
        }
    }

    /** Same key + same request returns the current state; it never calls Visa again. */
    private Intent replay(Op op, String fp) {
        if (!op.fingerprint().equals(fp)) throw conflict("Idempotency-Key already used for another request");
        return new Intent(true, op.paymentId(), op.id(), op.refundId(), null, op.amountMinor(), null);
    }

    private record PaymentRow(UUID id, String status, long amount, String currency, long refunded, String authId, String captureId) {}
    private PaymentRow lock(UUID id) {
        List<PaymentRow> rows = jdbc.query("""
            SELECT id,status,amount_minor,currency,refunded_amount_minor,provider_authorization_id,provider_capture_id
            FROM payments WHERE merchant_id=? AND id=? AND provider=? FOR UPDATE""",
            (rs, n) -> new PaymentRow((UUID) rs.getObject(1), rs.getString(2), rs.getLong(3), rs.getString(4).trim(),
                rs.getLong(5), rs.getString(6), rs.getString(7)), MerchantContext.current(), id, PROVIDER);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found");
        return rows.getFirst();
    }

    private Op lockOp(UUID id) {
        return jdbc.query("SELECT * FROM visa_operations WHERE id=? FOR UPDATE", (rs, n) -> mapOp(rs), id).getFirst();
    }
    private Optional<Op> findByKey(String key) {
        return jdbc.query("SELECT * FROM visa_operations WHERE idempotency_key=?", (rs, n) -> mapOp(rs), key).stream().findFirst();
    }
    private static Op mapOp(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Op((UUID) rs.getObject("id"), (UUID) rs.getObject("payment_id"), (UUID) rs.getObject("refund_id"),
            rs.getString("kind"), rs.getString("request_fingerprint"), rs.getString("state"),
            rs.getString("provider_transaction_id"), rs.getLong("amount_minor"));
    }
    private void insertOp(UUID opId, UUID paymentId, UUID refundId, String kind, String key, String fp, long amount) {
        jdbc.update("""
          INSERT INTO visa_operations(id,payment_id,refund_id,kind,idempotency_key,request_fingerprint,amount_minor,state)
          VALUES (?,?,?,?,?,?,?,'IN_FLIGHT')""", opId, paymentId, refundId, kind, key, fp, amount);
    }

    private void requireConfigured() {
        if (!props.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Visa sandbox not configured");
    }
    private static void validateKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{8,128}")) throw bad("Idempotency-Key must be 8-128 letters, digits, - or _");
    }
    private static ResponseStatusException bad(String m) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, m); }
    private static ResponseStatusException conflict(String m) { return new ResponseStatusException(HttpStatus.CONFLICT, m); }
    private static String truncate(String s, int n) { return s == null ? null : s.length() <= n ? s : s.substring(0, n); }
}
