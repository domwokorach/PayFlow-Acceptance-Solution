package dev.payflow.events;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

/**
 * Wire contract for SSE. eventId is stable (evt_ + sequence); the SSE id field carries the bare sequence.
 * Fields that do not apply to an event type are omitted from the JSON: payment events carry paymentId and status,
 * MERCHANT_UPDATED carries only merchantId. No merchant details ever travel on the stream.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DomainEvent(String eventId, String type, UUID paymentId, String status, Instant occurredAt, long seq, String merchantId) {
    public static final String PAYMENT_STATUS_CHANGED = "PAYMENT_STATUS_CHANGED";
    public static final String MERCHANT_UPDATED = "MERCHANT_UPDATED";
    public static DomainEvent of(long seq, String type, UUID paymentId, String status, Instant at) {
        return new DomainEvent("evt_" + seq, type, paymentId, status, at, seq, null);
    }
    public static DomainEvent merchant(long seq, String merchantId, Instant at) {
        return new DomainEvent("evt_" + seq, MERCHANT_UPDATED, null, null, at, seq, merchantId);
    }
}
