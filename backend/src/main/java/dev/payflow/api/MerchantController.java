package dev.payflow.api;

import dev.payflow.core.MerchantService;
import dev.payflow.model.MerchantDtos.MerchantView;
import dev.payflow.model.MerchantDtos.UpdateMerchantRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/merchants")
public class MerchantController {
    private final MerchantService merchants;
    public MerchantController(MerchantService merchants) { this.merchants = merchants; }

    @GetMapping
    public List<MerchantView> list() { return merchants.list(); }

    @PatchMapping("/{merchantId}")
    public MerchantView update(@PathVariable String merchantId, @Valid @RequestBody UpdateMerchantRequest request) {
        return merchants.update(merchantId, request);
    }
}
