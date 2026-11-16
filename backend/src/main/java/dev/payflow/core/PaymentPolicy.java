package dev.payflow.core;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class PaymentPolicy {
    private PaymentPolicy() {}

    public static boolean canCapture(String status) { return "AUTHORIZED".equals(status); }
    public static boolean canRefund(String status) {
        return "CAPTURED".equals(status) || "PARTIALLY_REFUNDED".equals(status);
    }
    public static String statusAfterRefund(long total, long alreadyRefunded, long newRefund) {
        if (newRefund <= 0 || alreadyRefunded + newRefund > total) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Refund exceeds remaining captured amount");
        }
        return alreadyRefunded + newRefund == total ? "REFUNDED" : "PARTIALLY_REFUNDED";
    }
}
