"""Run against a locally started backend: python3 scripts_smoke_test.py"""
import json
import uuid
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8080/api/v1"
HEADER = {"X-Demo-Api-Key": "local-only-change-me", "Content-Type": "application/json"}

def call(method, path, body=None, key=None):
    headers = dict(HEADER)
    if key:
        headers["Idempotency-Key"] = key
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)

key = str(uuid.uuid4())
p = call("POST", "/payments", {"amountMinor": 12500, "currency": "GBP", "simulateDecline": False}, key)
assert p["status"] == "AUTHORIZED"
p_again = call("POST", "/payments", {"amountMinor": 12500, "currency": "GBP", "simulateDecline": False}, key)
assert p["id"] == p_again["id"]
p = call("POST", f"/payments/{p['id']}/capture", key=str(uuid.uuid4()))
assert p["status"] == "CAPTURED"
r = call("POST", f"/payments/{p['id']}/refunds", {"amountMinor": 2500}, str(uuid.uuid4()))
assert r["amountMinor"] == 2500
p = call("GET", f"/payments/{p['id']}")
assert p["status"] == "PARTIALLY_REFUNDED" and p["refundedAmountMinor"] == 2500
print("PASS: create, retry, capture, partial refund, read")
