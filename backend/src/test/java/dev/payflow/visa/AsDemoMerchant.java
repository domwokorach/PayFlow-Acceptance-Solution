package dev.payflow.visa;

import dev.payflow.security.ApiKeyAuthentication;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.security.core.context.SecurityContextHolder;

/** Direct service calls need a merchant in scope, exactly as an authenticated request would provide. */
public class AsDemoMerchant implements BeforeEachCallback, AfterEachCallback {
    @Override public void beforeEach(ExtensionContext c) { SecurityContextHolder.getContext().setAuthentication(new ApiKeyAuthentication("demo_merchant")); }
    @Override public void afterEach(ExtensionContext c) { SecurityContextHolder.clearContext(); }
}
