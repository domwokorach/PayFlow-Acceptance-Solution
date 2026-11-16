package dev.payflow.security;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Authenticated caller: a merchant identified by a valid, unrevoked API key. */
public final class ApiKeyAuthentication extends AbstractAuthenticationToken {
    private final String merchantId;
    public ApiKeyAuthentication(String merchantId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_MERCHANT")));
        this.merchantId = merchantId;
        setAuthenticated(true);
    }
    public String merchantId() { return merchantId; }
    @Override public Object getPrincipal() { return merchantId; }
    @Override public Object getCredentials() { return ""; } // the key is never retained
}
