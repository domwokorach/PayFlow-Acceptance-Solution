package dev.payflow.visa;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;

class VisaConfigTest {
    private final VisaConfig config = new VisaConfig();

    @Test void disabledStaysOffWithoutCredentials() {
        assertNotNull(config.visaSandboxGateway(new VisaProperties(false, "", "", "")));
    }
    @Test void enabledWithPlaceholderCredentialsFailsStartup() {
        var e = assertThrows(IllegalStateException.class,
            () -> config.visaSandboxGateway(new VisaProperties(true, "your_sandbox_merchant_id", "your_sandbox_key_id", "your_sandbox_shared_secret_base64")));
        org.junit.jupiter.api.Assertions.assertFalse(e.getMessage().contains("your_sandbox"));
    }
    @Test void enabledWithMissingCredentialsFailsStartup() {
        assertThrows(IllegalStateException.class, () -> config.visaSandboxGateway(new VisaProperties(true, "m", "", "c2VjcmV0")));
    }
}
