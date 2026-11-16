package dev.payflow.visa;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(VisaProperties.class)
public class VisaConfig {
    @Bean VisaSandboxGateway visaSandboxGateway(VisaProperties p) {
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
