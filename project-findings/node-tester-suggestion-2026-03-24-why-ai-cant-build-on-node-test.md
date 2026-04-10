# Why AI Cannot Build On Node Test — Strict Feedback

**Date:** 2026-03-24
**Source:** 9+ hours of an AI trying to integrate Node Tester into a C# dVPN app
**Result:** Failed repeatedly. Test never completed. Dashboard never fully rendered. Buttons didn't work.

---

## The Honest Truth

The Node Tester is an incredible testing tool. It tests 1000+ nodes with real traffic and has found dozens of bugs. But **it is impossible for AI (or any builder) to build on top of it** because:

### 1. The Test Flow Is Buried In 600 Lines of One Function

`audit/node-test.js::testNode()` is ~600 lines with:
- 12 nested if/else blocks
- 3 different credential cache paths
- 409 retry loops with delays
- V2Ray transport preference selection
- Clock drift detection
- Economy mode branching
- Baseline comparison logic

**There is no extractable "test a node" function.** The function does everything: check online, check price, check cache, pay, handshake, connect, speed test, check Google, cleanup. Each step has error handling that depends on state from previous steps.

**What AI needs:** A clean function with input → output:
```
testNode(nodeAddress, wallet, chain) → TestResult
```

Not a 600-line function that manages session caches, duplicate guards, credential stores, retry counters, and economy mode.

### 2. The Speed Test Is Interleaved With Error Recovery

`protocol/speedtest.js` has a good speed test. But it's called from inside `testNode()` with error handling that depends on:
- Whether the tunnel is WireGuard or V2Ray
- What SOCKS5 port V2Ray is using
- Whether the connectivity pre-check passed
- Whether the baseline was already measured

**What AI needs:** A standalone speed test function:
```
speedTest(options: { socksHost?, socksPort?, direct? }) → { mbps, method, chunks }
```

### 3. The Dashboard HTML Is A 700-Line Single File

`index.html` has HTML, CSS, and JavaScript in one file. The layout is defined by CSS grid classes. The data binding is done by `getElementById` calls scattered across 500 lines of JavaScript.

**What AI needs:** A layout specification:
```
Section 1: Controls (buttons)
Section 2: Stats (6 cards, exact fields)
Section 3: Progress (bar + ETA)
Section 4: Table (columns, widths, data sources)
Section 5: Log (scrolling text)
```

The AI tried to read the HTML and translate to WPF XAML. It failed because HTML grid layout doesn't map to WPF Grid. CSS styling doesn't map to WPF resources. JavaScript event handlers don't map to WPF click handlers.

### 4. No API Contract Between Server and Dashboard

`server.js` has ~30 SSE event types. The dashboard JavaScript has ~30 event handlers. There is no document listing which events exist, what data they carry, and which UI elements they update.

**What AI needs:** An API contract:
```
Event: "test-result"
Data: { address, moniker, pass, speedMbps, protocol, error }
Updates: resultsBody table, stats cards, progress bar
```

### 5. The Architecture Diagram Exists But Doesn't Help AI Build

The CLAUDE.md has a beautiful directory tree. But it doesn't explain:
- Which file does what
- What calls what
- What the data flow is
- What external state each module depends on

**What AI needs:** A flow diagram:
```
User clicks "New Test"
→ server.js: POST /api/audit/start
→ audit/pipeline.js: runAudit()
  → core/chain.js: fetchAllNodes()
  → For each node:
    → audit/node-test.js: testNode(node)
      → core/session.js: getOrCreateSession(node)
      → protocol/v3protocol.js: handshake(session)
      → platforms/windows/wireguard.js: installTunnel(config)
        OR platforms/windows/v2ray.js: spawnProcess(config)
      → protocol/speedtest.js: speedtest(tunnel)
      → CLEANUP
    → SSE emit: "test-result"
    → results.json: upsertResult(result)
```

### 6. The Test Result Schema Isn't Documented

AI had to reverse-engineer the result format from `results/results.json`. The schema has 30+ fields. Some are optional. Some change meaning depending on protocol type. The `diag` object has different shapes for WireGuard vs V2Ray.

---

## What Node Tester Must Create

### Priority 1: `docs/TEST-FUNCTION.md`
A spec for the reusable test function with:
- Clear input parameters
- Step-by-step flow (numbered, not prose)
- What each step does and what it returns
- Error handling for each step
- Cleanup guarantee

### Priority 2: `docs/RESULT-SCHEMA.md`
JSON schema with:
- Every field, its type, whether optional
- Different shapes for WG vs V2Ray
- Example complete result for each protocol type
- Which fields are needed for display vs diagnostics

### Priority 3: `docs/DASHBOARD-LAYOUT.md`
Visual spec with:
- Section order (top to bottom)
- Each section's exact fields and data sources
- Column widths for the table
- Color meanings (green=pass, red=fail, amber=slow)
- Button states (enabled/disabled/loading)

### Priority 4: `docs/API-EVENTS.md`
Complete list of:
- SSE event names
- Payload structure for each event
- Which UI elements each event updates
- When each event fires in the test flow

### Priority 5: Extractable Functions
Refactor into pure functions that can be called from any runtime:
```
// These should be importable independently:
import { testNode } from './audit/node-test.js'
import { speedTest } from './protocol/speedtest.js'
import { checkGoogle } from './protocol/connectivity.js'
import { buildV2RayConfig } from './protocol/v3protocol.js'
```

Currently `testNode` depends on global state (session map, credential cache, wallet, chain client, V2Ray process manager, WireGuard tunnel manager, baseline history). These dependencies should be passed as parameters, not accessed as globals.

---

## The Test: Can AI Build A Node Tester From This Documentation?

If the documentation is complete, an AI should be able to:
1. Read the test function spec → implement `testNode()` in any language
2. Read the result schema → create the data model
3. Read the dashboard layout → build the UI in any framework
4. Read the API events → connect UI to backend
5. Read the integration guide → embed testing into any app

**Current answer: No.** The AI spent 9 hours and couldn't even get the speed test to run before the test cancelled. Not because the AI is bad — because the documentation doesn't exist and the code isn't structured for reuse.

---

## The Fix Takes 1 Day

Writing these 5 docs takes ~4 hours. Refactoring `testNode()` into a pure function takes ~4 hours. Total: 1 day of work, and every AI and human can build on the Node Tester forever.

**The Node Tester is too valuable to keep locked inside one project.**
