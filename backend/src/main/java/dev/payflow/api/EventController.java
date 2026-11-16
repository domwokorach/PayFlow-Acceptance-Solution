package dev.payflow.api;

import dev.payflow.security.MerchantContext;
import dev.payflow.events.EventStream;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {
    private final EventStream stream;
    public EventController(EventStream stream) { this.stream = stream; }

    /** Authenticated by the same filter as the rest of /api/v1. Cursor: Last-Event-ID header or ?lastEventId= for clients that recreate the connection. */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestHeader(value = "Last-Event-ID", required = false) String header,
                             @RequestParam(value = "lastEventId", required = false) String param) {
        return stream.subscribe(MerchantContext.current(), parseCursor(header != null ? header : param));
    }

    static Long parseCursor(String raw) {
        if (raw == null || !raw.matches("\\d{1,18}")) return null;
        return Long.parseLong(raw);
    }
}
