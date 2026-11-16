package dev.payflow.core;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PaymentPolicyTest {
    @Test void captureOnlyAuthorized() {
        assertTrue(PaymentPolicy.canCapture("AUTHORIZED"));
        assertFalse(PaymentPolicy.canCapture("DECLINED"));
        assertFalse(PaymentPolicy.canCapture("CAPTURED"));
    }
    @Test void refundOnlyCaptured() {
        assertTrue(PaymentPolicy.canRefund("CAPTURED"));
        assertTrue(PaymentPolicy.canRefund("PARTIALLY_REFUNDED"));
        assertFalse(PaymentPolicy.canRefund("AUTHORIZED"));
    }
    @Test void refundRespectsRemainingAmount() {
        assertEquals("PARTIALLY_REFUNDED", PaymentPolicy.statusAfterRefund(10000,0,2500));
        assertEquals("REFUNDED", PaymentPolicy.statusAfterRefund(10000,2500,7500));
        assertThrows(ResponseStatusException.class, () -> PaymentPolicy.statusAfterRefund(10000,2500,7501));
        assertThrows(ResponseStatusException.class, () -> PaymentPolicy.statusAfterRefund(10000,0,0));
    }
    @Test void fingerprintsAreStableAndDifferentPerRequest() {
        assertEquals(Idempotency.fingerprint("CREATE|100|GBP|false"),Idempotency.fingerprint("CREATE|100|GBP|false"));
        assertNotEquals(Idempotency.fingerprint("CREATE|100|GBP|false"),Idempotency.fingerprint("CREATE|200|GBP|false"));
    }
}
