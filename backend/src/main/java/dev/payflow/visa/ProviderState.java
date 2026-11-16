package dev.payflow.visa;

public enum ProviderState {
    AUTHORIZED, DECLINED, PENDING, CONFIRMED, UNSUPPORTED;

    /** Only these provider statuses are recognised; everything else is UNSUPPORTED, never assumed settled. */
    public static ProviderState fromVisa(String status) {
        if (status == null) return UNSUPPORTED;
        return switch (status.toUpperCase()) {
            case "AUTHORIZED" -> AUTHORIZED;
            case "DECLINED" -> DECLINED;
            case "PENDING" -> PENDING;
            case "SETTLED", "COMPLETED" -> CONFIRMED;
            default -> UNSUPPORTED;
        };
    }
}
