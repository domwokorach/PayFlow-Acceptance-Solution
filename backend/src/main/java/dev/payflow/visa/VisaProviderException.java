package dev.payflow.visa;

/** Provider call failed without a definitive business outcome. httpStatus is 0 for network errors. */
public class VisaProviderException extends RuntimeException {
    private final int httpStatus;
    public VisaProviderException(String message, int httpStatus) { super(message); this.httpStatus = httpStatus; }
    public int httpStatus() { return httpStatus; }
}
