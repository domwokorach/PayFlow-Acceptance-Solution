#!/usr/bin/env python3
"""Fails the build unless tests really ran. A green exit code from a test runner is not enough: a filter typo, a missing
Docker daemon or an empty include pattern can all execute zero tests and still exit 0.

  verify_reports.py --label "Backend unit" --dir backend/target/surefire-reports --require ClassA,ClassB [--min-tests N] [--max-skipped 0]
Exit 0 = ok, 1 = problem. Reads JUnit XML (Surefire TEST-*.xml or any <testsuite> file) and prints a summary table.
"""
import argparse, glob, sys, xml.etree.ElementTree as ET

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True); ap.add_argument("--dir", required=True)
    ap.add_argument("--require", default="", help="comma-separated test class simple names that must have executed")
    ap.add_argument("--min-tests", type=int, default=1); ap.add_argument("--max-skipped", type=int, default=0)
    a = ap.parse_args()

    files = sorted(glob.glob(f"{a.dir}/**/*.xml", recursive=True))
    suites = []
    for f in files:
        try: root = ET.parse(f).getroot()
        except ET.ParseError as e: print(f"FAIL: {f} is not valid XML ({e})"); return 1
        suites += [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    if not suites: print(f"FAIL [{a.label}]: no JUnit XML found under {a.dir}: tests did not run"); return 1

    t = f = e = s = 0; seen = set(); rows = []
    for su in suites:
        n, fl, er, sk = (int(su.get(k, 0)) for k in ("tests", "failures", "errors", "skipped"))
        t += n; f += fl; e += er; s += sk
        name = su.get("name", "?")
        # Matchable by Java class name (dev.x.FooTest -> FooTest) or by test file (tests/foo.test.ts -> foo.test.ts, foo)
        base = name.rsplit("/", 1)[-1]; seen.update({name, base, base.split(".")[0], name.rsplit(".", 1)[-1]})
        rows.append((name, n, fl + er, sk, su.get("time", "0")))
    print(f"[{a.label}] {len(suites)} suites, {t} tests, {f} failures, {e} errors, {s} skipped")
    for name, n, bad, sk, tm in rows: print(f"  {'FAIL' if bad else 'ok  '} {name}: {n} tests, {sk} skipped, {float(tm):.1f}s")

    problems = []
    if t < a.min_tests: problems.append(f"only {t} tests executed (minimum {a.min_tests})")
    if f or e: problems.append(f"{f + e} failing tests")
    if s > a.max_skipped: problems.append(f"{s} skipped tests (allowed {a.max_skipped}): skipped tests are not evidence")
    missing = [c for c in filter(None, (x.strip() for x in a.require.split(","))) if c not in seen]
    if missing: problems.append("required test classes did not run: " + ", ".join(missing))
    for p in problems: print(f"FAIL [{a.label}]: {p}")
    return 1 if problems else 0

sys.exit(main())
