/** Server-Sent Events connection with controlled reconnect, de-duplication and resume. No React, so it is unit-testable. */
export type LiveStatus = "connecting" | "live" | "reconnecting" | "closed";
/** Payment events carry paymentId and status; MERCHANT_UPDATED carries only merchantId. No merchant details travel on the stream. */
export interface LiveEvent { eventId: string; type: string; paymentId?: string; status?: string; merchantId?: string; occurredAt: string }

export interface LiveOptions {
  url: string;
  onStatus: (s: LiveStatus) => void;
  onEvent: (e: LiveEvent) => void;
  /** Called when the stream is established. `reconnected` is true for every connection after the first. */
  onReady: (info: { reconnected: boolean }) => void;
  /** Server could not replay what was missed: refetch everything. */
  onResync: () => void;
  EventSourceImpl?: typeof EventSource;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** No frame for this long means a half-open connection (heartbeats arrive every 15s). */
  silenceMs?: number;
  random?: () => number;
}

export const PAYMENT_EVENT = "PAYMENT_STATUS_CHANGED";
export const MERCHANT_EVENT = "MERCHANT_UPDATED";

/** Returns a function that closes the connection permanently. */
export function connectLive(o: LiveOptions): () => void {
  const ES = o.EventSourceImpl ?? EventSource;
  const base = o.baseDelayMs ?? 1000, max = o.maxDelayMs ?? 30_000, silence = o.silenceMs ?? 45_000, rnd = o.random ?? Math.random;
  let es: EventSource | null = null, retry: ReturnType<typeof setTimeout> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0, lastSeq: number | null = null, everReady = false, stopped = false;
  const seen = new Set<string>();

  const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => fail(), silence); };
  const fail = () => {
    if (stopped) return;
    es?.close(); es = null; clearTimeout(watchdog);
    o.onStatus("reconnecting");
    // Exponential backoff with jitter so a restarted backend is not hit by every tab at once.
    const delay = Math.min(max, base * 2 ** attempts) * (0.5 + rnd() / 2);
    attempts++;
    retry = setTimeout(open, delay);
  };
  const json = (e: Event) => { try { return JSON.parse((e as MessageEvent).data); } catch { return null; } };

  function open() {
    if (stopped) return;
    o.onStatus(everReady || attempts > 0 ? "reconnecting" : "connecting");
    es = new ES(lastSeq === null ? o.url : `${o.url}${o.url.includes("?") ? "&" : "?"}lastEventId=${lastSeq}`);
    arm();
    es.addEventListener("ready", (e) => {
      arm();
      const latest = Number(json(e)?.latestEventId ?? 0);
      if (lastSeq === null || lastSeq > latest) { // first connect, or the server's history was reset
        if (lastSeq !== null) o.onResync();
        lastSeq = latest;
      }
      const reconnected = everReady; everReady = true; attempts = 0;
      o.onStatus("live");
      o.onReady({ reconnected });
    });
    es.addEventListener("heartbeat", arm);
    es.addEventListener("resync", () => { arm(); o.onResync(); });
    // Payment and merchant events share one cursor, de-duplication and ordering path.
    for (const name of [PAYMENT_EVENT, MERCHANT_EVENT]) es.addEventListener(name, (e) => {
      arm();
      const ev = json(e) as LiveEvent | null;
      const seq = Number((e as MessageEvent).lastEventId);
      if (!ev || !ev.eventId || seen.has(ev.eventId)) return; // duplicate delivery
      if (Number.isFinite(seq) && lastSeq !== null && seq <= lastSeq) return; // stale / out of order: the refetch already reflects it
      seen.add(ev.eventId); if (seen.size > 500) seen.delete(seen.values().next().value as string);
      if (Number.isFinite(seq)) lastSeq = seq;
      o.onEvent(ev);
    });
    es.onerror = () => fail();
  }

  open();
  return () => { stopped = true; clearTimeout(retry); clearTimeout(watchdog); es?.close(); es = null; o.onStatus("closed"); };
}
