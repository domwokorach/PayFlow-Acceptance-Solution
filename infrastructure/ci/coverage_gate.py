#!/usr/bin/env python3
"""Reads real coverage output and applies minimum-line-coverage thresholds.
Exit 0 = thresholds met, 3 = a threshold is not met (the Jenkinsfile maps this to UNSTABLE), 1 = a report is missing (FAILURE).
  coverage_gate.py --jacoco backend/target/site/jacoco/jacoco.csv --jacoco-min 40 --vitest frontend/coverage/coverage-summary.json --vitest-min 50
"""
import argparse, csv, json, os, sys

def jacoco_lines(path):
    covered = missed = 0
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh): covered += int(row["LINE_COVERED"]); missed += int(row["LINE_MISSED"])
    return 100.0 * covered / (covered + missed) if covered + missed else 0.0, covered + missed

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jacoco"); ap.add_argument("--jacoco-min", type=float, default=0)
    ap.add_argument("--vitest"); ap.add_argument("--vitest-min", type=float, default=0)
    a = ap.parse_args(); status = 0
    if a.jacoco:
        if not os.path.exists(a.jacoco): print(f"FAIL: backend coverage report missing: {a.jacoco}"); return 1
        pct, total = jacoco_lines(a.jacoco); ok = pct >= a.jacoco_min
        print(f"Backend line coverage: {pct:.1f}% of {total} lines (minimum {a.jacoco_min:g}%) {'OK' if ok else 'BELOW THRESHOLD'}"); status = status or (0 if ok else 3)
    if a.vitest:
        if not os.path.exists(a.vitest): print(f"FAIL: frontend coverage report missing: {a.vitest}"); return 1
        pct = json.load(open(a.vitest))["total"]["lines"]["pct"]; ok = pct >= a.vitest_min
        print(f"Frontend line coverage: {pct:.1f}% (minimum {a.vitest_min:g}%) {'OK' if ok else 'BELOW THRESHOLD'}"); status = status or (0 if ok else 3)
    return status

sys.exit(main())
