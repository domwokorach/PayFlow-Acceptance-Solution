"""Optional LIVE Visa sandbox smoke test: one authorization + one capture, then waits for confirmation.
Run only against a local stack started with your own sandbox credentials (PAYFLOW_VISA_ENABLED=true).
Never used by CI. Makes 2 sandbox calls (plus status lookups). Not a load test.
    python3 scripts_visa_live_smoke.py
"""
import json, os, time, uuid, urllib.request

# Defaults target a local stack; Jenkins' optional smoke stage overrides them for its isolated stack.
BASE = os.environ.get("PAYFLOW_API_BASE", "http://127.0.0.1:8080/api/v1")
H = {"X-Demo-Api-Key": os.environ.get("PAYFLOW_DEMO_API_KEY", "local-only-change-me"), "Content-Type": "application/json"}

def call(method, path, body=None, key=None):
    h = dict(H)
    if key: h["Idempotency-Key"] = key
    req = urllib.request.Request(BASE + path, json.dumps(body).encode() if body is not None else None, h, method=method)
    with urllib.request.urlopen(req, timeout=40) as r: return json.load(r)

p = call("POST", "/payments", {"amountMinor": 1000, "currency": "GBP", "simulateDecline": False, "provider": "VISA_SANDBOX"}, str(uuid.uuid4()))
print("authorize ->", p["status"])
assert p["status"] == "AUTHORIZED", "authorization did not succeed; check sandbox credentials"
p = call("POST", f"/payments/{p['id']}/capture", key=str(uuid.uuid4()))
print("capture ->", p["status"])
for _ in range(10):  # the backend reconciler also does this every 30s
    if p["status"] != "CAPTURE_PENDING": break
    time.sleep(5)
    try: p = call("POST", f"/payments/{p['id']}/reconcile")
    except Exception as e: print("reconcile:", e)
print("final ->", p["status"])
