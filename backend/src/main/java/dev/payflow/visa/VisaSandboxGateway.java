package dev.payflow.visa;

import java.util.UUID;

public interface VisaSandboxGateway {
    ProviderResult authorize(UUID paymentId, long amountMinor, String currency);
    ProviderResult capture(String authorizationId, UUID paymentId, long amountMinor, String currency);
    /** Refunds reference the CAPTURE transaction id, not the authorization id. */
    ProviderResult refund(String captureId, UUID refundId, long amountMinor, String currency);
    /** Read-only lookup. */
    ProviderResult status(String transactionId);
}
