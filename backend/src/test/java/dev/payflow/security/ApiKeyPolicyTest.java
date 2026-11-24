package dev.payflow.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ApiKeyPolicyTest {
    @Test void localModeKeepsTheConvenientDefault() {
        assertDoesNotThrow(() -> ApiKeyBootstrap.checkKey("local-only-change-me", false));
    }
    @Test void anyModeRejectsShortKeys() {
        assertThrows(IllegalArgumentException.class, () -> ApiKeyBootstrap.checkKey("short", false));
    }
    @Test void strictModeRejectsTheWellKnownKeyWithoutEchoingIt() {
        var e = assertThrows(IllegalArgumentException.class, () -> ApiKeyBootstrap.checkKey("local-only-change-me", true));
        org.junit.jupiter.api.Assertions.assertFalse(e.getMessage().contains("local-only-change-me"));
    }
    @Test void strictModeRequiresThirtyTwoCharacters() {
        assertThrows(IllegalArgumentException.class, () -> ApiKeyBootstrap.checkKey("a".repeat(31), true));
        assertDoesNotThrow(() -> ApiKeyBootstrap.checkKey("a".repeat(32), true));
    }
}
