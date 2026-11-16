package dev.payflow.model;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class MerchantDtos {
    private MerchantDtos() {}

    /**
     * Partial update. A field that is absent or null is left unchanged; an empty string clears an optional field.
     * Identifiers, API keys and provider settings are deliberately not part of this contract, so they cannot be bound.
     */
    public record UpdateMerchantRequest(
        @Size(max = 120, message = "Use 120 characters or fewer")
        @Pattern(regexp = ".*\\S.*", message = "Display name is required")
        String displayName,
        @Size(max = 254, message = "Use 254 characters or fewer")
        @Pattern(regexp = "^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "Enter a valid email address")
        String contactEmail,
        @Size(max = 120, message = "Use 120 characters or fewer")
        String businessName) {}

    public record MerchantView(String id, String displayName, String contactEmail, String businessName,
                               Instant createdAt, Instant updatedAt) {}
}
