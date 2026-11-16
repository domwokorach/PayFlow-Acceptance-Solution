package dev.payflow.core;

import dev.payflow.security.MerchantContext;
import dev.payflow.events.EventPublisher;
import dev.payflow.model.PaymentDtos.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PaymentService {
    private final JdbcTemplate jdbc;
    private final Ledger ledger;
    private final Idempotency idem;
    private final EventPublisher events;

    public PaymentService(JdbcTemplate jdbc, Ledger ledger, Idempotency idem, EventPublisher events) {
        this.jdbc = jdbc; this.ledger = ledger; this.idem = idem; this.events = events;
    }

    /** Payments plus the latest provider status code (for example HTTP_401), so clients can tell a card decline from a provider or credential problem. Null for simulated payments. */
    private static final String PAYMENT_SELECT = """
        SELECT p.*, (SELECT o.provider_status FROM visa_operations o WHERE o.payment_id = p.id ORDER BY o.created_at DESC LIMIT 1) AS provider_status
        FROM payments p""";

    private PaymentView mapPayment(ResultSet rs, int n) throws SQLException {
        return new PaymentView((UUID) rs.getObject("id"), rs.getString("merchant_id"),
            rs.getLong("amount_minor"), rs.getString("currency"), rs.getString("status"),
            rs.getLong("refunded_amount_minor"), rs.getString("provider"), rs.getTimestamp("created_at").toInstant(),
            rs.getString("provider_status"));
    }
    private RefundView mapRefund(ResultSet rs, int n) throws SQLException {
        return new RefundView((UUID) rs.getObject("id"), (UUID)rs.getObject("payment_id"),
            rs.getLong("amount_minor"), rs.getTimestamp("created_at").toInstant(), rs.getString("status"));
    }

    public PaymentView get(UUID id) {
        List<PaymentView> found = jdbc.query(PAYMENT_SELECT + " WHERE merchant_id=? AND id=?",
            this::mapPayment, MerchantContext.current(), id);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found");
        return found.getFirst();
    }
    public RefundView getRefund(UUID refundId) {
        List<RefundView> found = jdbc.query("""
            SELECT r.* FROM refunds r JOIN payments p ON p.id=r.payment_id
            WHERE r.id=? AND p.merchant_id=?
            """, this::mapRefund, refundId, MerchantContext.current());
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Refund not found");
        return found.getFirst();
    }

    public List<PaymentView> list(String query, String status) {
        String q = query == null ? "" : query.trim();
        String s = status == null ? "" : status.trim();
        if (q.length() > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search query too long");
        return jdbc.query(PAYMENT_SELECT + """
            WHERE merchant_id=?
           AND (?='' OR CAST(id AS TEXT) ILIKE ? OR currency ILIKE ?)
           AND (?='' OR status=?)
           ORDER BY created_at DESC,id DESC LIMIT 100
           """, this::mapPayment, MerchantContext.current(), q, "%"+q+"%", "%"+q+"%", s, s);
    }

    @Transactional
    public PaymentView create(CreatePaymentRequest request, String key) {
        if (!"GBP".equals(request.currency())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Demo currently supports GBP only");
        String requestHash = "CREATE|"+request.amountMinor()+"|"+request.currency()+"|"+request.simulateDecline();
        return idem.execute(key, requestHash, this::get, () -> {
            UUID id = UUID.randomUUID();
            String status = request.simulateDecline() ? "DECLINED" : "AUTHORIZED";
            jdbc.update("""
              INSERT INTO payments(id,merchant_id,amount_minor,currency,status)
              VALUES (?,?,?,?,?)
              """, id, MerchantContext.current(), request.amountMinor(), request.currency(), status);
            events.paymentChanged(id);
            return new Idempotency.Outcome<>(id, get(id));
        });
    }

    @Transactional
    public PaymentView capture(UUID id, String key) {
        return idem.execute(key, "CAPTURE|"+id, this::get, () -> {
            PaymentView payment = lock(id);
            if (!PaymentPolicy.canCapture(payment.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Only AUTHORIZED payments can be captured");
            }
            jdbc.update("UPDATE payments SET status='CAPTURED', captured_at=now() WHERE id=?", id);
            ledger.post(id,"CAPTURE",payment.amountMinor(),payment.currency());
            events.paymentChanged(id);
            return new Idempotency.Outcome<>(id,get(id));
        });
    }

    @Transactional
    public RefundView refund(UUID id, RefundRequest request, String key) {
        if (request.amountMinor() <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Refund must be positive");
        return idem.execute(key, "REFUND|"+id+"|"+request.amountMinor(), this::getRefund, () -> {
            PaymentView payment = lock(id);
            if (!PaymentPolicy.canRefund(payment.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Payment must be captured before refunding");
            }
            String next = PaymentPolicy.statusAfterRefund(payment.amountMinor(), payment.refundedAmountMinor(), request.amountMinor());
            UUID refundId = UUID.randomUUID();
            jdbc.update("INSERT INTO refunds(id,payment_id,amount_minor) VALUES (?,?,?)", refundId, id, request.amountMinor());
            jdbc.update("UPDATE payments SET status=?,refunded_amount_minor=refunded_amount_minor+? WHERE id=?",
                next, request.amountMinor(), id);
            ledger.post(id,"REFUND",request.amountMinor(),payment.currency());
            events.paymentChanged(id);
            return new Idempotency.Outcome<>(refundId,getRefund(refundId));
        });
    }

    private PaymentView lock(UUID id) {
        List<PaymentView> found = jdbc.query(PAYMENT_SELECT + " WHERE merchant_id=? AND id=? FOR UPDATE OF p",
            this::mapPayment,MerchantContext.current(),id);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found");
        return found.getFirst();
    }
}
