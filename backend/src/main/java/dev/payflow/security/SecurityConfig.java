package dev.payflow.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Stateless API-key security. No cookies or sessions exist, so CSRF protection has nothing to protect and is off.
 * Browsers never hold a key: the Next.js server attaches it. Keys are accepted as X-Api-Key, the legacy
 * X-Demo-Api-Key, or "Authorization: Bearer".
 */
@Configuration
public class SecurityConfig {
    private static final AuthenticationEntryPoint UNAUTHORIZED = (req, res, e) -> {
        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        res.setContentType("application/json");
        res.getWriter().write("{\"error\":\"Unauthorized\"}");
    };

    @Bean SecurityFilterChain api(HttpSecurity http, ApiKeyService keys) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .httpBasic(AbstractHttpConfigurer::disable).formLogin(AbstractHttpConfigurer::disable)
            .exceptionHandling(e -> e.authenticationEntryPoint(UNAUTHORIZED))
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info", "/actuator/prometheus").permitAll()
                .requestMatchers("/error").permitAll()
                .requestMatchers("/api/v1/**").authenticated()
                .anyRequest().denyAll())
            .addFilterBefore(new ApiKeyFilter(keys), AuthorizationFilter.class)
            .build();
    }

    static final class ApiKeyFilter extends OncePerRequestFilter {
        private final RequestAttributeSecurityContextRepository repository = new RequestAttributeSecurityContextRepository();
        private final ApiKeyService keys;
        ApiKeyFilter(ApiKeyService keys) { this.keys = keys; }

        @Override protected boolean shouldNotFilter(HttpServletRequest req) { return !req.getRequestURI().startsWith("/api/v1/"); }

        @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            String merchant = keys.merchantFor(extract(req));
            if (merchant != null) {
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(new ApiKeyAuthentication(merchant));
                SecurityContextHolder.setContext(context);
                // Persist for the request so SSE's later async dispatch is still authenticated.
                repository.saveContext(context, req, res);
            }
            chain.doFilter(req, res);
        }

        static String extract(HttpServletRequest req) {
            String h = req.getHeader("X-Api-Key");
            if (h == null) h = req.getHeader("X-Demo-Api-Key");
            String auth = req.getHeader("Authorization");
            if (h == null && auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7)) h = auth.substring(7).trim();
            return h;
        }
    }
}
