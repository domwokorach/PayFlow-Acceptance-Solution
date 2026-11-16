package dev.payflow.visa;

import java.util.Base64;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Credentials come only from the backend environment; never from requests or the frontend. */
@ConfigurationProperties("payflow.visa")
public record VisaProperties(boolean enabled, String merchantId, String keyId, String sharedSecret) {
    public boolean configured() {
        return enabled && usable(merchantId) && usable(keyId) && usable(sharedSecret) && validBase64(sharedSecret);
    }
    private static boolean usable(String v) {
        return v != null && !v.isBlank() && !v.startsWith("your_");
    }
    private static boolean validBase64(String v) {
        try { Base64.getDecoder().decode(v.trim()); return true; } catch (IllegalArgumentException e) { return false; }
    }
}
