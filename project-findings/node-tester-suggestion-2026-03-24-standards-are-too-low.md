# The Standards Are Too Low — Strict Feedback on What's Being Left Out

**Date:** 2026-03-24
**Source:** Building Handshake dVPN test dashboard — basic features missing after 12+ hours

---

## The State of Things

We built a test dashboard that connected to 135 mainnet nodes. Speed tests work. Failures are detected. Results are saved. Then the user asks: "can I see my previous test results?" And the answer is no. Because nobody thought about it.

This is not an edge case. This is THE MOST BASIC FEATURE of any testing tool. You run a test. You close the app. You open it again. You want to see what happened. If that doesn't work, nothing else matters.

---

## Every Basic Feature That's Being Left Out

### 1. Load Previous Test Results
**User expectation:** Open app → click Test tab → see results from last time
**Reality:** Results exist on disk but the dashboard shows "No results yet" because the in-memory array is empty on startup

**This is a 3-line fix:**
```csharp
// On app startup or Test tab first render:
var cached = DiskCache.Load<List<NodeTestResult>>("test-results", TimeSpan.FromDays(30));
if (cached?.data != null) _testResults = cached.Value.data;
```

The fact that this was left out means nobody tested the flow: start app → run test → close app → start app → check results. That's the FIRST thing a user does.

### 2. Export Results
**User expectation:** "I tested 135 nodes, I want to share the data"
**Reality:** No export button. Results exist in a JSON file buried in %LocalAppData% that users don't know about.

**Needed:**
- "Export" button → save results.json to user-chosen location
- "Copy" button → copy results summary to clipboard
- CSV export for spreadsheet analysis

### 3. Clear Specific Results
**User expectation:** "This node failed because my internet was down, I want to remove it and retest just that one"
**Reality:** Can only clear ALL results or retest ALL failures

**Needed:**
- Right-click on result row → "Remove" or "Retest This Node"
- Select multiple → "Retest Selected"

### 4. Sort Table Columns
**User expectation:** Click "Speed" column header → sort by speed descending
**Reality:** Table is in test order only. Can't sort.

**This is a basic data table feature.** Every table in every app ever made can sort by column. The Node Tester's HTML table can sort. Our WPF table cannot.

### 5. Filter Results
**User expectation:** "Show me only failed nodes" or "Show me only WireGuard nodes"
**Reality:** No filters on test results table

**Needed:** Same filter pattern as the Nodes tab: All | WG | V2 | Pass | Fail

### 6. Test Run History
**User expectation:** "I ran tests yesterday and today. I want to compare them."
**Reality:** Each new scan overwrites the previous results. No history.

**Needed:**
- Auto-save each completed scan to `runs/YYYY-MM-DD_HH-MM/`
- Dropdown to load previous runs
- Basic comparison: "10 more nodes passed today vs yesterday"

### 7. Token Spend Tracking
**User expectation:** "How much did this test scan cost me?"
**Reality:** No tracking. Balance shown in wallet but no delta calculation.

**Needed:**
- Record balance before scan starts
- Show running spend: "Spent: 42.3 P2P (balance: 9551 → 9509)"
- Show per-node cost: "~0.40 P2P per test"

### 8. Node Details on Click
**User expectation:** Click on a result row → see full details
**Reality:** Click does nothing except copy address (just added)

**Needed:**
- Click row → expand to show: full address, session ID, connect time breakdown, speed test method, Google latency, error details, V2Ray transport attempts

### 9. Test a Single Node by Address
**User expectation:** Paste a node address → test just that one
**Reality:** Must find the node in the node list first, or run the entire scan

**Needed:** Text input field in Test tab: "Test specific node: [sentnode1...]  [Go]"

### 10. Real-Time Status During Test
**User expectation:** During a test, see what's happening RIGHT NOW
**Reality:** Live log shows messages but the status is buried in log text

**Needed:**
- Current node name + country flag prominently displayed
- Current phase: "Connecting..." → "Speed testing..." → "Checking Google..."
- Time elapsed for current node
- Progress: "Node 45 of 997"

---

## Why These Get Left Out

### Problem 1: Building Features, Not Flows
The developer builds "speed test function" and "dashboard with buttons." They don't build "user opens app Tuesday, runs scan, closes, opens Wednesday, sees Tuesday's results, exports them, shares with team."

**The features exist. The flows don't.**

### Problem 2: Testing the Happy Path Only
"New Test works!" → ship it. But:
- Does Resume work? Never tested.
- Do results persist? Never tested.
- Can you see old results? Never tested.
- Can you export? Never tested.
- Can you sort? Never tested.

**The first path works. The second path doesn't exist.**

### Problem 3: No User Journey Documented
The Node Tester docs describe WHAT the dashboard shows. They don't describe WHAT THE USER DOES:

```
USER JOURNEY 1: First-time test
  Open app → Import wallet → Click Test → Click New Test → Wait → See results

USER JOURNEY 2: Return visit
  Open app → Click Test → See previous results → Click Resume or New Test

USER JOURNEY 3: Share results
  Open app → Click Test → See results → Click Export → Save file → Send to team

USER JOURNEY 4: Investigate failure
  Open app → Click Test → See results → Click failed node → Read details → Click Retest

USER JOURNEY 5: Compare over time
  Open app → Click Test → Load yesterday's run → Compare with today's run
```

**If these user journeys were documented, every basic feature would be obvious.**

---

## What the Node Tester Must Add to BUILD-ON-ME.md

### Section: User Journeys (Not Features)

Document the 5 user journeys above. For each journey, list:
1. What the user clicks
2. What the app shows
3. What data is loaded/saved
4. What happens if data is missing

### Section: Data Lifecycle

```
TEST RUN:
  Start → results accumulate in memory
  Each node → append to results array + save to disk
  Complete → save final results + state + archive to runs/

APP RESTART:
  Load test-results.json → populate table immediately
  Load test-state.json → show last scan stats
  Load test-failures.jsonl → count for Retest Failed badge

EXPORT:
  Button click → save dialog → write results.json to chosen path

CLEAR:
  Confirm → delete results + state + failures
  Archive previous results to runs/ before clearing
```

### Section: Table Interactivity

```
SORT: Click column header → toggle asc/desc
FILTER: Buttons above table → All / WG / V2 / Pass / Fail
CLICK ROW: Expand to show diagnostics
RIGHT-CLICK: Context menu → Retest / Remove / Copy Address
SEARCH: Text field → filter by moniker, address, country
```

---

## The Standard

Every feature in the test dashboard should answer these questions:

1. **Does it work on first use?** (New user, no data)
2. **Does it work on return visit?** (Data exists from previous session)
3. **Does it work after restart?** (App closed, reopened)
4. **Does it work after failure?** (Crash, network error, cancel)
5. **Can the user share the output?** (Export, copy, screenshot)
6. **Can the user investigate issues?** (Click, expand, filter, sort)

If any answer is "no," the feature is incomplete.

**The current standard: "it works on first use." That's 1 out of 6. The standard must be 6 out of 6.**

---

## Cost of Leaving These Out

Every missing basic feature costs:
- **User trust:** "The app doesn't remember my results? This is amateur."
- **Developer time:** Every future integration rebuilds the same basics
- **Support burden:** "How do I see my old results?" → "Open %LocalAppData%/..."
- **Data loss:** User can't export → results exist only on one machine → machine dies → data gone

**These basics take 2-4 hours to implement. Leaving them out costs 20+ hours of user frustration and developer rework across every integration.**
