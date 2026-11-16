package dev.payflow.security;

import java.util.function.Supplier;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The merchant every data access is scoped to. It comes from the authenticated API key, or from an explicit
 * runAs() block for background jobs. There is deliberately no default: code running without a merchant fails
 * closed instead of reading or writing another merchant's rows.
 */
public final class MerchantContext {
    private static final ThreadLocal<String> OVERRIDE = new ThreadLocal<>();
    private MerchantContext() {}

    public static String current() {
        String override = OVERRIDE.get();
        if (override != null) return override;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof ApiKeyAuthentication key && key.isAuthenticated()) return key.merchantId();
        throw new IllegalStateException("No merchant in scope");
    }

    public static <T> T callAs(String merchantId, Supplier<T> body) {
        String previous = OVERRIDE.get();
        OVERRIDE.set(merchantId);
        try { return body.get(); }
        finally { if (previous == null) OVERRIDE.remove(); else OVERRIDE.set(previous); }
    }

    public static void runAs(String merchantId, Runnable body) { callAs(merchantId, () -> { body.run(); return null; }); }
}
