package dev.payflow.visa;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(VisaProperties.class)
public class VisaConfig {
    @Bean VisaSandboxGateway visaSandboxGateway(VisaProperties p) {
        // Enabled but unusable credentials are a deployment error: fail at startup instead of failing every payment later.
        if (p.enabled() && !p.configured())
            throw new IllegalStateException("PAYFLOW_VISA_ENABLED=true but the Visa sandbox credentials are missing, placeholders or invalid; set PAYFLOW_VISA_MERCHANT_ID, PAYFLOW_VISA_KEY_ID and a base64 PAYFLOW_VISA_SHARED_SECRET, or set PAYFLOW_VISA_ENABLED=false");
        if (!p.configured()) {
            return new VisaSandboxGateway() {
                private VisaProviderException off() { return new VisaProviderException("Visa sandbox not configured", 0); }
                public ProviderResult authorize(java.util.UUID a, long b, String c) { throw off(); }
                public ProviderResult capture(String a, java.util.UUID b, long c, String d) { throw off(); }
                public ProviderResult refund(String a, java.util.UUID b, long c, String d) { throw off(); }
                public ProviderResult status(String a) { throw off(); }
            };
        }
        return new VisaAcceptanceGateway(VisaAcceptanceGateway.SANDBOX, p.merchantId().trim(), p.keyId().trim(), p.sharedSecret());
    }
}
