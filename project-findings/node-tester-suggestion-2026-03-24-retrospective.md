# Node Tester Retrospective — What Actually Happened

**Date:** 2026-03-24
**Duration:** ~48 hours across 2026-03-22 to 2026-03-24
**What was built:** C# SDK integration, 17 bug fixes, V2Ray port discovery, DNS config, complete docs
**Nodes tested:** 1002 (JS) + 1002 (C#) + ~200 retests = ~2200 node tests
**P2P spent:** ~40,000+ tokens
**Bugs found:** 17 protocol + 7 during retesting = 24 total

---

## Time Breakdown: Where 48 Hours Went

| Activity | Hours | Productive? | Should Have Been |
|----------|-------|-------------|-----------------|
| Finding + fixing 17 bugs | 12 | ✅ YES | 12 (correct) |
| C# bridge integration | 4 | ✅ YES | 4 (correct) |
| Blind retesting without fixes | 8 | ❌ WASTED | 0 (should fix first) |
| Writing docs that describe fiction | 6 | ❌ WASTED | 2 (write after code works) |
| Rewriting docs after feedback | 4 | ❌ WASTED | 0 (get it right first time) |
| Building NodeTester class in SDK | 1 | ✅ YES | Should have been day 1 |
| UI fixes (flags, alignment, badges) | 3 | ✅ YES | 3 (correct) |
| Port discovery + alterId research | 4 | ✅ YES | 4 (correct) |
| Creating CONTEXT.md/ARCH.md structure | 2 | ✅ YES | Should have existed already |
| Waiting for tests to run | 4 | NEUTRAL | Unavoidable |

**Productive: 30 hours. Wasted: 18 hours (37.5%).**

---

## Every Mistake Made

### Mistake 1: Dismissed 8 Failures as "Node-Side"
**What:** Initially categorized clock drift, address mismatch, inactive, ETIMEDOUT as node problems.
**Cost:** 2 hours investigating later + trust erosion.
**Lesson:** Iron Rule exists for a reason. ALL 8 were code bugs.
**Prevention:** Never say "node-side" if peers > 0. Period.

### Mistake 2: Retested 5+ Times Without New Fixes
**What:** Ran the same 24 nodes through the same code 5 times expecting different results.
**Cost:** 8 hours + hundreds of P2P tokens.
**Lesson:** Same code + same node = same result. Change a variable first.
**Prevention:** Before ANY retest, answer: "What is DIFFERENT this time?" Write it down.

### Mistake 3: C# Bridge Was Cosmetic for Months
**What:** The SDK toggle showed "C#" but all code ran through JS. Nobody noticed.
**Cost:** All previous "C# test" runs were invalid.
**Lesson:** Verify the code path, not the label. Grep for actual bridge calls.
**Prevention:** Log `[C# SDK]` on every status/handshake call. If you don't see it, the bridge isn't wired.

### Mistake 4: Wrote 11 Doc Files Describing Non-Existent Code
**What:** `NodeTester` class, `IVpnTestAdapter`, `NodeTestService` — all in docs, none in code.
**Cost:** Another AI spent 10+ hours trying to use these classes.
**Lesson:** Never document what doesn't exist without GIANT WARNING labels.
**Prevention:** Grep codebase for every class/function mentioned in docs. If not found, label as SPEC.

### Mistake 5: Stopped Running Audit to Apply Code Fixes
**What:** Killed mid-audit server to restart with fixes. Lost 130 C# results.
**Cost:** 130 test results permanently lost. Had to rerun entire C# audit.
**Lesson:** Code fixes can wait for the next natural restart.
**Prevention:** Auto-save results before ANY server restart. Never wipe without saving.

### Mistake 6: transport_security Offset Not Caught for Hours
**What:** C# SDK returns 0-indexed (0=none, 1=tls). JS expects 1-indexed (1=none, 2=tls). All C# V2Ray tests failed with wrong TLS setting.
**Cost:** 3 hours debugging + multiple retests.
**Lesson:** When bridging between languages, ALWAYS check numeric enum mappings.
**Prevention:** Bridge wrapper should have comparison tests: same node, JS vs C#, compare generated configs byte-by-byte.

### Mistake 7: Missing 10s UUID Wait for C# Path
**What:** JS path had `sleep(10_000)` after V2Ray handshake. C# path didn't.
**Cost:** ALL C# V2Ray nodes failed. 3 hours to find.
**Lesson:** When adding a new code path, copy ALL behavior from the reference path, not just the obvious parts.
**Prevention:** Diff the JS path and C# path line by line. Every sleep, every save, every log.

### Mistake 8: Session Lookup Scanning 500+ Sessions
**What:** `waitForSessionActive` scanned ALL wallet sessions (500+) instead of querying by ID directly.
**Cost:** 5-minute timeouts on every node during retests.
**Lesson:** Use the most specific query possible. If you have the session ID, query it directly.
**Prevention:** Always pass the session ID to wait functions. Never scan the whole list if you can query by ID.

### Mistake 9: V2Ray Port Pre-Check Had `useCached` Before Initialization
**What:** Added port pre-check that referenced a variable defined later in the function.
**Cost:** Server crash. All 24 retests failed with `Cannot access 'useCached' before initialization`.
**Lesson:** When inserting code into the MIDDLE of a function, check variable scope.
**Prevention:** Run the code once locally before deploying. Check for ReferenceError.

### Mistake 10: Aggressive Port Scanning Crashed Server
**What:** Port scan tried 1000-65535 in step 100. Too many concurrent connections.
**Cost:** Server crash.
**Lesson:** Port scanning must be batched and limited.
**Prevention:** Probe 10-15 known common ports first. Only widen if needed.

---

## What Went Right

### 1. Iron Rule Found Real Bugs
Every time a node with peers was investigated deeply, we found a real code bug. The rule works.

### 2. JS vs C# Comparison Exposed Integration Issues
Testing the same nodes with both SDKs found: transport_security offset, UUID wait, missing credential save. These would never be found by testing one SDK alone.

### 3. Transport Cache Dramatically Speeds Up Retests
First C# audit: 68s/node (no cache). Second: 30s/node (cache from JS run). The cache is worth keeping.

### 4. Auto-Retest at End of Audit
Automatically retesting failures with peers finds intermittent issues without manual intervention.

### 5. Port Pre-Check Saves Tokens
Probing V2Ray ports before paying for sessions saves ~40 P2P per dead node × 10 dead kfmg nodes = 400 P2P saved per audit.

---

## The Proven Build Order (Node Tester Specific)

1. **Fix bugs in code** — implement the actual solution
2. **Verify the fix changes output** — check generated config, check code path reached
3. **Retest ONLY the affected nodes** — not the whole network
4. **If pass → resume audit** — don't restart from scratch
5. **If fail → go deeper** — don't retest again with same code
6. **Document findings** — write to `suggestions/` with timestamp
7. **Update SDK** — bugs found here feed into SDK fixes

**NEVER:** Retest without a fix. Write docs before code exists. Stop a running audit for non-critical changes. Dismiss failures if peers > 0.

---

## Numbers That Matter

| Metric | Before (2026-03-22) | After (2026-03-24) |
|--------|---------------------|---------------------|
| JS pass rate | 97.3% (990/1017) | 97.3% (same nodes) |
| C# pass rate | 0% (toggle was fake) | 97.6% (978/1002, real C# SDK) |
| Bugs found | 0 (never deep inspected) | 24 (17 protocol + 7 integration) |
| transport_security | Wrong for all C# V2Ray | Fixed (+1 remap) |
| UUID wait | Missing for C# | Fixed (10s sleep) |
| Stale credentials | Reused across restarts | Cleared at audit start |
| Batch session mapping | Index-based (broken) | Chain query (correct) |
| Per-node timeout | None (hung forever) | 5 min hard limit |
| Stop response time | 5 minutes | 500ms |
| V2Ray port pre-check | None (wasted tokens on dead ports) | Probes before payment |
| alterId for clock drift | 0 (AEAD, fails >120s) | 64 (legacy, no clock check) |
| Doc quality | Fiction presented as fact | Working code + clear SPEC labels |

---

## For the Next AI Session

1. Read `CONTEXT.md` and `ARCH.md` first
2. Check `HANDOFF.md` for current state
3. 24 nodes still failing — investigate each with peers > 0 BEFORE retesting
4. V2Ray 5.44.1 is active
5. C# bridge is wired and working
6. Transport cache has 500+ learned entries
7. DNS toggle is implemented (HNS, Google, Cloudflare)
8. NodeTester class EXISTS in Sentinel.SDK.Core (compiled, tested)
9. All docs synced between node-tester/docs/ and Sentinel SDK/docs/
