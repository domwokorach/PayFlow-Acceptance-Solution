package dev.payflow.events;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * In-process fan-out of committed events. PostgreSQL stays the source of truth: a client that reconnects
 * replays from domain_events using Last-Event-ID, or is told to resynchronize when it is too far behind.
 * With several backend instances this would need LISTEN/NOTIFY or a broker; see docs/architecture.md.
 */
@Component
public class EventStream {
    static final int REPLAY_LIMIT = 500;
    private static final Logger log = LoggerFactory.getLogger(EventStream.class);
    private record Sub(String merchant, SseEmitter emitter) {}

    private final List<Sub> subs = new CopyOnWriteArrayList<>();
    private final AtomicInteger open = new AtomicInteger();
    private final Counter sent;
    private final EventPublisher publisher;

    public EventStream(MeterRegistry meters, @Lazy EventPublisher publisher) {
        this.publisher = publisher;
        meters.gauge("payflow.sse.subscribers", open);
        this.sent = meters.counter("payflow.sse.events.sent");
    }

    public SseEmitter subscribe(String merchant, Long lastEventId) {
        SseEmitter emitter = new SseEmitter(30 * 60_000L); // clients reconnect and resume
        Sub sub = new Sub(merchant, emitter);
        Runnable remove = () -> { if (subs.remove(sub)) open.decrementAndGet(); };
        emitter.onCompletion(remove); emitter.onTimeout(remove); emitter.onError(e -> remove.run());
        subs.add(sub); open.incrementAndGet(); // register first so nothing committed during replay is lost
        try {
            long latest = publisher.latestSeq(merchant);
            send(emitter, SseEmitter.event().name("ready").data("{\"latestEventId\":" + latest + "}"));
            if (lastEventId != null) replay(merchant, emitter, lastEventId, latest);
        } catch (RuntimeException e) {
            log.warn("SSE subscribe failed: {}", e.getClass().getSimpleName());
            emitter.completeWithError(e);
        }
        return emitter;
    }

    private void replay(String merchant, SseEmitter emitter, long lastEventId, long latest) {
        if (lastEventId > latest) { resync(emitter, "unknown-cursor"); return; }
        List<DomainEvent> missed = publisher.after(merchant, lastEventId, REPLAY_LIMIT + 1);
        if (missed.size() > REPLAY_LIMIT) { resync(emitter, "gap"); return; }
        missed.forEach(e -> send(emitter, eventBuilder(e)));
    }

    private void resync(SseEmitter emitter, String reason) {
        send(emitter, SseEmitter.event().name("resync").data("{\"reason\":\"" + reason + "\"}"));
    }

    private static SseEmitter.SseEventBuilder eventBuilder(DomainEvent e) {
        return SseEmitter.event().id(Long.toString(e.seq())).name(e.type()).data(e);
    }

    public void broadcast(String merchant, DomainEvent event) {
        for (Sub s : subs) if (s.merchant().equals(merchant)) { if (send(s.emitter(), eventBuilder(event))) sent.increment(); }
    }

    @Scheduled(fixedDelay = 15_000)
    void heartbeat() {
        for (Sub s : subs) send(s.emitter(), SseEmitter.event().name("heartbeat").data("{}"));
    }

    private boolean send(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            synchronized (emitter) { emitter.send(event); }
            return true;
        } catch (IOException | IllegalStateException e) { // client went away; completion callbacks clean up
            emitter.completeWithError(e);
            return false;
        }
    }
}
