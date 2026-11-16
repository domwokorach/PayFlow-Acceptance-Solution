package dev.payflow.model;

import static org.junit.jupiter.api.Assertions.*;

import dev.payflow.model.MerchantDtos.UpdateMerchantRequest;
import dev.payflow.model.PaymentDtos.CreatePaymentRequest;
import dev.payflow.model.PaymentDtos.RefundRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Bean Validation rules on the request contracts. Pure unit tests: no Spring context, no database. */
class RequestValidationTest {
    private static ValidatorFactory factory;
    private static Validator validator;
    @BeforeAll static void start() { factory = Validation.buildDefaultValidatorFactory(); validator = factory.getValidator(); }
    @AfterAll static void stop() { factory.close(); }

    private static <T> Set<String> fields(T bean) { return validator.validate(bean).stream().map(v -> v.getPropertyPath().toString()).collect(Collectors.toSet()); }
    private static <T> String message(T bean, String field) { return validator.validate(bean).stream().filter(v -> v.getPropertyPath().toString().equals(field)).map(v -> v.getMessage()).findFirst().orElse(null); }

    // ---- payments
    @Test void validPaymentRequestPasses() {
        assertTrue(fields(new CreatePaymentRequest(12500, "GBP", false, "SIMULATED")).isEmpty());
        assertTrue(fields(new CreatePaymentRequest(1, "GBP", false, "VISA_SANDBOX")).isEmpty());
        assertTrue(fields(new CreatePaymentRequest(100_000_000, "GBP", false)).isEmpty(), "upper limit is inclusive");
    }
    @ParameterizedTest @ValueSource(longs = {0, -1, -12500, 100_000_001}) void paymentAmountMustBePositiveAndBounded(long amount) {
        assertEquals(Set.of("amountMinor"), fields(new CreatePaymentRequest(amount, "GBP", false, "SIMULATED")));
    }
    @ParameterizedTest @ValueSource(strings = {"gbp", "GB", "GBPP", "12A", ""}) void currencyMustBeThreeUpperCaseLetters(String currency) {
        assertEquals(Set.of("currency"), fields(new CreatePaymentRequest(100, currency, false, "SIMULATED")));
    }
    @ParameterizedTest @ValueSource(strings = {"STRIPE", "visa_sandbox", "SIMULATED "}) void providerMustBeKnown(String provider) {
        assertEquals(Set.of("provider"), fields(new CreatePaymentRequest(100, "GBP", false, provider)));
    }
    @Test void refundAmountMustBePositiveAndBounded() {
        assertTrue(fields(new RefundRequest(2500)).isEmpty());
        assertEquals(Set.of("amountMinor"), fields(new RefundRequest(0)));
        assertEquals(Set.of("amountMinor"), fields(new RefundRequest(-5)));
        assertEquals(Set.of("amountMinor"), fields(new RefundRequest(100_000_001)));
    }

    // ---- merchants
    @Test void partialMerchantUpdatesAreValid() {
        assertTrue(fields(new UpdateMerchantRequest("Acme Retail", null, null)).isEmpty());
        assertTrue(fields(new UpdateMerchantRequest(null, "ops@acme.example", null)).isEmpty());
        assertTrue(fields(new UpdateMerchantRequest(null, null, "Acme Retail Ltd")).isEmpty());
    }
    @ParameterizedTest @ValueSource(strings = {"", " ", "   ", "\t"}) void displayNameMustNotBeBlank(String name) {
        assertEquals(Set.of("displayName"), fields(new UpdateMerchantRequest(name, null, null)));
        assertEquals("Display name is required", message(new UpdateMerchantRequest(name, null, null), "displayName"));
    }
    @Test void displayNameLengthIsCapped() {
        assertTrue(fields(new UpdateMerchantRequest("x".repeat(120), null, null)).isEmpty());
        assertEquals(Set.of("displayName"), fields(new UpdateMerchantRequest("x".repeat(121), null, null)));
    }
    @ParameterizedTest @ValueSource(strings = {"not-an-email", "a@b", "a b@c.example", "@c.example", "a@@c.example", "a@c."}) void invalidEmailsAreRejected(String email) {
        assertEquals(Set.of("contactEmail"), fields(new UpdateMerchantRequest(null, email, null)), email);
        assertEquals("Enter a valid email address", message(new UpdateMerchantRequest(null, email, null), "contactEmail"));
    }
    @ParameterizedTest @ValueSource(strings = {"ops@acme.example", "first.last+tag@sub.acme.co.uk", ""}) void validEmailsAndEmptyStringToClearAreAccepted(String email) {
        assertTrue(fields(new UpdateMerchantRequest(null, email, null)).isEmpty(), email);
    }
    @Test void emailAndBusinessNameLengthsAreCapped() {
        assertEquals(Set.of("contactEmail"), fields(new UpdateMerchantRequest(null, "a".repeat(250) + "@b.co", null)));
        assertEquals(Set.of("businessName"), fields(new UpdateMerchantRequest(null, null, "x".repeat(121))));
    }
}
