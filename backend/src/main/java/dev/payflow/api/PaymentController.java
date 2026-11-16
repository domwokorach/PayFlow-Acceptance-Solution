package dev.payflow.api;

import dev.payflow.core.DashboardService;
import dev.payflow.core.PaymentService;
import dev.payflow.core.ReconciliationService;
import dev.payflow.visa.VisaPaymentWorkflow;
import dev.payflow.model.PaymentDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class PaymentController {
    private final PaymentService payments;
    private final VisaPaymentWorkflow visa;
    private final DashboardService dashboard;
    private final ReconciliationService reconciliation;
    public PaymentController(PaymentService payments, VisaPaymentWorkflow visa, DashboardService dashboard, ReconciliationService reconciliation) {
        this.payments = payments; this.visa = visa; this.dashboard = dashboard; this.reconciliation = reconciliation;
    }

    @GetMapping("/payments")
    public List<PaymentView> list(@RequestParam(defaultValue="") String q,
                                  @RequestParam(defaultValue="") String status) {
        return payments.list(q,status);
    }
    @GetMapping("/payments/{id}")
    public PaymentView get(@PathVariable UUID id) { return payments.get(id); }
    @PostMapping("/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentView create(@Valid @RequestBody CreatePaymentRequest request,
                              @RequestHeader("Idempotency-Key") String key) {
        if (VisaPaymentWorkflow.PROVIDER.equals(request.provider())) return visa.authorize(request,key);
        return payments.create(request,key);
    }
    @PostMapping("/payments/{id}/capture")
    public PaymentView capture(@PathVariable UUID id, @RequestHeader("Idempotency-Key") String key) {
        if (visa.owns(id)) return visa.capture(id,key);
        return payments.capture(id,key);
    }
    @PostMapping("/payments/{id}/refunds")
    @ResponseStatus(HttpStatus.CREATED)
    public RefundView refund(@PathVariable UUID id, @Valid @RequestBody RefundRequest request,
                             @RequestHeader("Idempotency-Key") String key) {
        if (visa.owns(id)) return visa.refund(id,request,key);
        return payments.refund(id,request,key);
    }
    @PostMapping("/payments/{id}/reconcile")
    public PaymentView reconcile(@PathVariable UUID id) { return visa.reconcile(id, "operator"); }
    @GetMapping("/dashboard/summary")
    public DashboardSummary summary(@RequestParam(defaultValue="30") int days) { return dashboard.summary(days); }
    @GetMapping("/reconciliation")
    public ReconciliationReport reconciliation() { return reconciliation.report(); }
}
