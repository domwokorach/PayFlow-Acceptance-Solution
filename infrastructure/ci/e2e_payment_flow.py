#!/usr/bin/env python3
"""End-to-end payment flow against an isolated PayFlow stack (simulator provider, throwaway database). Standard library only.

Covers: creation, idempotency, capture, partial and full refund, transaction details, dashboard and ledger consistency,
live events, provider error mapping, merchant update, authentication, concurrency, and the Next.js proxy that feeds the dashboard.
Never contacts Visa. Writes JUnit XML.
"""
import argparse, json, os, sys, threading, time, traceback, uuid
import urllib.error, urllib.request
import xml.etree.ElementTree as ET

API = os.environ.get("E2E_API_BASE", "http://127.0.0.1:8080/api/v1")
WEB = os.environ.get("E2E_WEB_BASE", "http://127.0.0.1:3000")
KEY = os.environ.get("E2E_API_KEY", "e2e-test-key-0000000000")

def call(method, path, body=None, idem=None, key=KEY, base=API, timeout=20):
    """Returns (status, parsed-json-or-text). Never raises on HTTP errors, so tests can assert on them."""
    headers = {"Content-Type": "application/json"}
    if key: headers["X-Api-Key"] = key
    if idem: headers["Idempotency-Key"] = idem
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: raw, status = r.read().decode(), r.status
    except urllib.error.HTTPError as e: raw, status = e.read().decode(), e.code
    try: return status, json.loads(raw)
    except ValueError: return status, raw

def new_payment(amount=12500, decline=False, idem=None):
    s, p = call("POST", "/payments", {"amountMinor": amount, "currency": "GBP", "simulateDecline": decline}, idem or str(uuid.uuid4()))
    assert s == 201, f"create payment returned {s}: {p}"
    return p

def capture(pid, idem=None): return call("POST", f"/payments/{pid}/capture", idem=idem or str(uuid.uuid4()))
def refund(pid, amount, idem=None): return call("POST", f"/payments/{pid}/refunds", {"amountMinor": amount}, idem or str(uuid.uuid4()))

class Stream:
    """Reads the Server-Sent Events stream on a background thread."""
    def __init__(self):
        self.events, self.names, self._stop = [], [], False
        req = urllib.request.Request(API + "/events/stream", headers={"X-Api-Key": KEY, "Accept": "text/event-stream"})
        self.resp = urllib.request.urlopen(req, timeout=30)
        threading.Thread(target=self._read, daemon=True).start()
    def _read(self):
        name = None
        try:
            for raw in self.resp:
                line = raw.decode().rstrip("\n")
                if line.startswith("event:"): name = line[6:].strip(); self.names.append(name)
                elif line.startswith("data:") and name:
                    try: self.events.append((name, json.loads(line[5:].strip())))
                    except ValueError: pass
        except Exception: pass
    def wait_for(self, name, pred=lambda d: True, seconds=15):
        end = time.time() + seconds
        while time.time() < end:
            for n, d in list(self.events):
                if n == name and pred(d): return d
            time.sleep(0.2)
        raise AssertionError(f"no {name} event matched within {seconds}s; saw {[n for n, _ in self.events]}")
    def close(self):
        try: self.resp.close()
        except Exception: pass

TESTS = []
def test(fn): TESTS.append(fn); return fn

@test
def authentication_is_enforced():
    assert call("GET", "/payments", key=None)[0] == 401
    assert call("GET", "/payments", key="not-a-real-key-at-all")[0] == 401
    assert call("PATCH", "/merchants/demo_merchant", {"displayName": "x"}, key=None)[0] == 401

@test
def create_is_idempotent_and_conflicts_on_a_different_body():
    key = str(uuid.uuid4())
    a = new_payment(12500, idem=key); b = new_payment(12500, idem=key)
    assert a["id"] == b["id"] and a["status"] == "AUTHORIZED", (a, b)
    s, body = call("POST", "/payments", {"amountMinor": 99999, "currency": "GBP", "simulateDecline": False}, key)
    assert s == 409, f"reusing a key for a different request must conflict, got {s}: {body}"

@test
def invalid_input_is_rejected():
    for bad in ({"amountMinor": 0, "currency": "GBP"}, {"amountMinor": -5, "currency": "GBP"}, {"amountMinor": 100, "currency": "gbp"}):
        s, _ = call("POST", "/payments", bad, str(uuid.uuid4())); assert s == 400, (bad, s)
    assert call("POST", "/payments", {"amountMinor": 100, "currency": "GBP"}, None)[0] == 400, "Idempotency-Key is required"

@test
def capture_then_partial_and_full_refund():
    p = new_payment(10000)
    s, c = capture(p["id"]); assert s == 200 and c["status"] == "CAPTURED", (s, c)
    assert capture(p["id"])[0] == 409, "a second capture must be refused"
    s, r = refund(p["id"], 2500); assert s == 201 and r["amountMinor"] == 2500, (s, r)
    s, d = call("GET", f"/payments/{p['id']}"); assert d["status"] == "PARTIALLY_REFUNDED" and d["refundedAmountMinor"] == 2500, d
    assert refund(p["id"], 7501)[0] in (400, 409), "refunding more than remains must be refused"
    s, _ = refund(p["id"], 7500); assert s == 201
    s, d = call("GET", f"/payments/{p['id']}"); assert d["status"] == "REFUNDED" and d["refundedAmountMinor"] == 10000, d

@test
def declined_payments_cannot_be_captured_or_refunded():
    p = new_payment(3500, decline=True); assert p["status"] == "DECLINED", p
    assert capture(p["id"])[0] == 409
    assert refund(p["id"], 100)[0] in (400, 409)

@test
def transaction_details_and_list_agree():
    p = new_payment(4200)
    s, d = call("GET", f"/payments/{p['id']}"); assert s == 200 and d["amountMinor"] == 4200 and d["currency"] == "GBP", d
    s, rows = call("GET", "/payments"); assert any(x["id"] == p["id"] for x in rows)
    assert call("GET", f"/payments/{uuid.uuid4()}")[0] == 404

@test
def dashboard_and_ledger_stay_consistent():
    s, before = call("GET", "/dashboard/summary?days=0"); assert s == 200
    p = new_payment(8000); assert capture(p["id"])[0] == 200; assert refund(p["id"], 3000)[0] == 201
    time.sleep(0.5)
    s, after = call("GET", "/dashboard/summary?days=0")
    assert after["totalTransactions"] == before["totalTransactions"] + 1, (before["totalTransactions"], after["totalTransactions"])
    assert after["capturedVolumeMinor"] - before["capturedVolumeMinor"] == 8000, "captured volume must grow by the captured amount"
    assert after["refundedVolumeMinor"] - before["refundedVolumeMinor"] == 3000, "refunded volume must grow by the refunded amount"
    s, rec = call("GET", "/reconciliation")
    assert rec["unbalancedJournals"] == 0 and rec["discrepancies"] == [], rec

@test
def live_events_follow_payment_changes_and_merchant_updates():
    st = Stream()
    try:
        deadline = time.time() + 10
        while "ready" not in st.names and time.time() < deadline: time.sleep(0.2)
        assert "ready" in st.names, "stream never sent its ready event"
        p = new_payment(1500)
        ev = st.wait_for("PAYMENT_STATUS_CHANGED", lambda d: d.get("paymentId") == p["id"]); assert ev["status"] == "AUTHORIZED" and ev["eventId"].startswith("evt_"), ev
        capture(p["id"])
        st.wait_for("PAYMENT_STATUS_CHANGED", lambda d: d.get("paymentId") == p["id"] and d.get("status") == "CAPTURED")
        s, m = call("GET", "/merchants"); name = m[0]["displayName"]
        assert call("PATCH", f"/merchants/{m[0]['id']}", {"displayName": name})[0] == 200
        ev = st.wait_for("MERCHANT_UPDATED"); assert ev["merchantId"] == m[0]["id"] and "displayName" not in json.dumps(ev), ev
    finally: st.close()

@test
def provider_errors_are_mapped_and_the_simulator_keeps_working():
    s, body = call("POST", "/payments", {"amountMinor": 1000, "currency": "GBP", "simulateDecline": False, "provider": "VISA_SANDBOX"}, str(uuid.uuid4()))
    assert s == 503 and "not configured" in json.dumps(body), (s, body)
    assert new_payment(1000)["status"] == "AUTHORIZED"

@test
def merchant_update_validates_persists_and_is_scoped():
    s, m = call("GET", "/merchants"); assert s == 200 and len(m) == 1; mid, original = m[0]["id"], m[0]["displayName"]
    s, bad = call("PATCH", f"/merchants/{mid}", {"contactEmail": "not-an-email"}); assert s == 400 and "contactEmail" in json.dumps(bad), (s, bad)
    s, bad = call("PATCH", f"/merchants/{mid}", {"displayName": "   "}); assert s == 400, s
    assert call("PATCH", "/merchants/someone_else", {"displayName": "x"})[0] == 404, "another merchant's id must not be editable"
    s, ok = call("PATCH", f"/merchants/{mid}", {"displayName": "E2E Retail", "contactEmail": "ops@e2e.example"}); assert s == 200 and ok["displayName"] == "E2E Retail", (s, ok)
    s, m2 = call("GET", "/merchants"); assert m2[0]["displayName"] == "E2E Retail" and m2[0]["contactEmail"] == "ops@e2e.example", "update must persist"
    assert call("PATCH", f"/merchants/{mid}", {"displayName": original, "contactEmail": ""})[0] == 200

@test
def duplicate_requests_in_parallel_create_exactly_one_payment():
    key = str(uuid.uuid4()); ids, errors = [], []
    def go():
        try: ids.append(new_payment(5100, idem=key)["id"])
        except Exception as e: errors.append(str(e))
    threads = [threading.Thread(target=go) for _ in range(8)]; [t.start() for t in threads]; [t.join() for t in threads]
    assert not errors, errors
    assert len(set(ids)) == 1, f"8 concurrent requests with one idempotency key produced {len(set(ids))} payments"

@test
def concurrent_captures_succeed_exactly_once():
    p = new_payment(6000); results = []
    def go(): results.append(capture(p["id"])[0])
    threads = [threading.Thread(target=go) for _ in range(6)]; [t.start() for t in threads]; [t.join() for t in threads]
    assert results.count(200) == 1, f"expected exactly one successful capture, got {sorted(results)}"
    s, rec = call("GET", "/reconciliation"); assert rec["unbalancedJournals"] == 0, rec

@test
def dashboard_frontend_serves_and_proxies_the_same_data():
    s, html = call("GET", "/", base=WEB, key=None); assert s == 200 and "PayFlow" in html, "dashboard page did not render"
    p = new_payment(2300)
    s, rows = call("GET", "/payments", base=WEB + "/api", key=None)   # through the Next.js proxy, which adds the API key server-side
    assert s == 200 and any(x["id"] == p["id"] for x in rows), "dashboard proxy did not return the new payment"
    s, m = call("GET", "/merchants", base=WEB + "/api", key=None); assert s == 200 and m[0]["id"], "merchant list not reachable through the proxy"

def write_junit(path, results, elapsed):
    failures = sum(1 for r in results if r[1] != "pass")
    suite = ET.Element("testsuite", name="PayFlow end-to-end", tests=str(len(results)), failures=str(failures), errors="0", skipped="0", time=f"{elapsed:.2f}")
    for name, status, secs, detail in results:
        case = ET.SubElement(suite, "testcase", classname="e2e", name=name, time=f"{secs:.2f}")
        if status != "pass": ET.SubElement(case, "failure", message=detail.splitlines()[-1] if detail else "failed").text = detail
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    ET.ElementTree(suite).write(path, encoding="utf-8", xml_declaration=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--junit", default="e2e-junit.xml"); a = ap.parse_args()
    results, start = [], time.time()
    for fn in TESTS:
        t0 = time.time()
        try: fn(); results.append((fn.__name__, "pass", time.time() - t0, "")); print(f"  PASS {fn.__name__}")
        except Exception: results.append((fn.__name__, "fail", time.time() - t0, traceback.format_exc())); print(f"  FAIL {fn.__name__}\n{traceback.format_exc()}")
    write_junit(a.junit, results, time.time() - start)
    bad = sum(1 for r in results if r[1] != "pass")
    print(f"End-to-end: {len(results) - bad}/{len(results)} passed"); return 1 if bad else 0

sys.exit(main())
