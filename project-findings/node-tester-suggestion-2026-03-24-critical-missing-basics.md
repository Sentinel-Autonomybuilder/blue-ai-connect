# Critical Missing Basics — Node Test Cannot Be Integrated Without These

**Date:** 2026-03-24
**Severity:** BLOCKING — integration impossible without fixes

## The Situation

We built an app that tested 135 nodes on mainnet (118 pass, 17 fail). The test WORKS — connections succeed, speed tests complete, Google checks pass. But the dashboard is missing BASIC features because the Node Tester doesn't document how to implement them.

## What's Missing and Why

### 1. RESUME — No Documentation At All
The Node Tester has a Resume button. How does it work internally?
- Where is the scan position saved?
- How does it know which nodes were already tested?
- What state needs to persist for resume to work?
- What happens if the node list changed since last scan?

**There is ZERO documentation on resume logic.** The code exists in `audit/pipeline.js` but it's interleaved with batch payment logic, session reuse, and retry handling. An AI cannot extract the resume pattern from 400 lines of pipeline code.

**NEEDED:** A 20-line spec:
```
Resume saves: { lastIndex, testedAddresses[], results[] }
On Resume: load state → filter nodes not in testedAddresses → continue from next untested
If node list changed: re-scan, skip already-tested, test new nodes
```

### 2. BASELINE — Never Explained How To Measure
The Node Tester measures "baseline" — direct internet speed without tunnel. This is critical for the "Pass Baseline" threshold (node speed >= 50% of baseline).

**Questions with no documented answers:**
- When is baseline measured? Before each node? Once per scan? Periodically?
- What happens if baseline changes mid-scan?
- How is baseline history stored?
- What's the minimum acceptable baseline (30 Mbps)?
- How does baseline affect the pass/fail verdict?

The baseline measurement code is inside `speedtestDirect()` — the same function used for WireGuard testing. But calling it requires no tunnel to be active. When in the scan loop does this happen?

**NEEDED:** A flow diagram:
```
Scan start → measure baseline → store in history
Every 10 nodes → re-measure baseline → update history
Node test → compare actualMbps against baseline
passBaseline = actualMbps >= (baseline * 0.5)
```

### 3. DEAD PLAN NODES — Need `inPlan` Field
The "Dead Plan Nodes" stat requires knowing which test results are for nodes in a subscribed plan. The test result needs an `inPlan` boolean field.

**Questions:**
- Does the Node Tester set this from `queryPlanNodes()`?
- Is it set during the pre-check or after the test?
- What plan IDs are checked?

### 4. TRANSPORT DETAIL — V2Ray Config Not Exposed
The Node Tester shows "V2 tcp/tls" or "V2 grpc/none" in the Transport column. This comes from the V2Ray config builder's transport selection.

The C# SDK's `ConnectAsync()` returns `ConnectionResult` which has `ServiceType` ("wireguard" or "v2ray") but NOT the specific transport/security combination. The Node Tester has this because it builds the V2Ray config manually.

**NEEDED:** Either:
- SDK exposes `Transport` and `TransportSecurity` on ConnectionResult
- Or documentation on how to extract it from the V2Ray process output

### 5. SESSION SPEND TRACKING — Not Documented
The Node Tester header shows "Est. Cost: X P2P". How is this calculated?
- Is it sum of all session payments?
- Does it include gas fees?
- Is it tracked in state?

### 6. ECONOMY MODE — What Does It Skip?
The Economy toggle "skips expensive nodes." What criteria?
- Nodes above a price threshold?
- Nodes with 0 peers?
- What's the default threshold?

### 7. RUN ARCHIVES — Format Not Specified
The Node Tester archives completed runs. What's the directory structure? What's in summary.txt? When is archiving triggered?

## The Pattern

Every missing feature follows the same pattern:
1. The button exists in the Node Tester UI
2. The code exists somewhere in the 6,500 lines
3. The logic is interleaved with other systems
4. There is NO standalone spec for the feature
5. An AI would need to read 200+ lines of code to understand one feature

## What Node Tester Must Do

### For EVERY feature in the dashboard:
Create a 10-20 line spec that says:
- **Input:** what triggers this feature
- **Logic:** what happens step by step
- **State:** what persists to disk
- **Output:** what the UI shows

### Example — Resume Spec:
```
INPUT: User clicks Resume
LOGIC:
  1. Load test-state.json
  2. Load test-results.json
  3. Get current node list from chain
  4. testedAddresses = results.map(r => r.address)
  5. remainingNodes = allNodes.filter(n => !testedAddresses.includes(n.address))
  6. Continue scan from remainingNodes[0]
STATE: test-state.json updated after each node
OUTPUT: Progress resumes from where it stopped, stats carry over
```

That's 10 lines. It took me 0 seconds to write. But without it, an AI spends 2 hours reverse-engineering pipeline.js.

**Write these specs for: Resume, Baseline, Economy, Plan Test, Run Archive, Session Spend, Retest Failed logic.**

Do NOT just write the file — this is research only. Return the content so the parent agent can write it.
