package dev.payflow.visa;

public record ProviderResult(ProviderState state, String transactionId, String providerStatus) {}
