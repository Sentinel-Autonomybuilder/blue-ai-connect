# Node Tester Documentation Failures — Why AI Can't Integrate It

**Date:** 2026-03-24
**Source:** 9+ hours trying to integrate Node Tester into Handshake dVPN
**Problem:** AI was told "copy the Node Tester dashboard" multiple times but couldn't do it properly

---

## What Went Wrong

An AI spent 9+ hours building a dVPN app and was asked to integrate Node Tester functionality. It failed repeatedly because:

1. **No integration guide exists.** The Node Tester has a CLAUDE.md that explains the architecture but not HOW to embed it into another app.

2. **No component boundary documentation.** Which parts are reusable? Which are Node-Tester-specific? The table says "testing tool vs consumer app" but doesn't say "here's the reusable test function, here's how to call it."

3. **No UI specification.** The dashboard layout exists only in index.html as interleaved HTML+CSS+JS. No document says "the dashboard has these sections in this order with these data fields."

4. **No data contract.** What does a test result look like? The AI had to reverse-engineer it from results.json. There's no schema, no TypeScript type, no documented interface.

5. **No standalone launch guide for other platforms.** "How do I run the Node Tester dashboard inside a WPF app?" has no answer.

---

## What The Node Tester Needs To Document

### 1. Integration Guide: `docs/INTEGRATION.md`

```markdown
# Integrating Node Testing Into Your App

## Option A: Embed the Test Function
Your app already connects to nodes. Add speed testing after connection:

### Step 1: After ConnectAsync succeeds, run speed test
- WireGuard: HTTP download direct (tunnel routes all traffic)
- V2Ray: HTTP download via SOCKS5 proxy at 127.0.0.1:{socksPort}

### Step 2: Speed test targets (in order, with fallback)
1. https://speed.cloudflare.com/__down?bytes=1048576
2. https://proof.ovh.net/files/1Mb.dat
3. https://speedtest.tele2.net/1MB.zip

### Step 3: Two phases
- Phase 1: Download 1MB, measure Mbps
- Phase 2: If >= 3 Mbps, download 5x1MB sequentially, measure average

### Step 4: Google accessibility check
- GET https://www.google.com/generate_204
- Record: accessible (bool), latency (ms)

### Step 5: Disconnect and record result

## Option B: Launch Full Dashboard
The Node Tester dashboard can run inside any app via:
- WebView2 component pointing to localhost:3001
- Or: extract the HTML/CSS/JS and embed as static resources

## Option C: Use Results Only
Load `results/results.json` from the Node Tester project.
Filter by pass/fail, speed, country, protocol.
```

### 2. Dashboard UI Specification: `docs/DASHBOARD-SPEC.md`

```markdown
# Dashboard Layout Specification

## Controls Bar
Buttons (left to right):
- New Test: Start fresh scan of all online nodes
- Resume: Continue interrupted scan
- Rescan: Re-fetch node list from chain
- Retest Failed: Re-test only failed nodes
- Stop: Halt current scan immediately
- Economy: Toggle economy mode (skip expensive nodes)
- Plan Select: Dropdown of plans
- Test Plan: Test only nodes in selected plan
- Reset: Clear all results

## Stats Grid (6 columns, equal width)
| Stat | Value Source | Sub-text |
|------|------------|----------|
| Tested | completed / total | "of {total} online" |
| Total Failed | count where !pass | "{pct}%" |
| Pass 10 Mbps | count where speed >= 10 | "{pct}%" |
| Dead Plan Nodes | failed nodes in plan | "{pct}%" |
| Not Online | total - online | "offline" |
| Pass Rate | passed / tested | "connected / tested" |

## Speed History (2 sections side by side)
- Last 10 Baseline Readings: colored pills (green/yellow/red by speed)
- Last 10 Node Speeds: colored pills

## Progress Bar
- Title: "Audit Progress"
- Percentage label: "X% Complete"
- ETA block: "Est. Remaining" + "HH:MM:SS"
- Fill bar: proportional
- Meta: "X / Y Available Nodes" + current action text

## Node Performance Matrix (TABLE)
Columns:
| Column | Width | Align | Content |
|--------|-------|-------|---------|
| SDK | 40px | left | "JS" or "C#" badge |
| Transport | 100px | left | "WG" or "V2 tcp/tls" etc |
| Node | 180px | left | Moniker (truncated, click to copy full address) |
| Country | 80px | left | Flag emoji + country code |
| City | 100px | left | City name |
| Peers | 50px | center | Number |
| Speed | 80px | right | "XX.X Mbps" colored by threshold |
| Total BW | 80px | right | "XX.X Mbps" |
| Baseline | 80px | right | Baseline speed at time of test |
| Result | 70px | center | "PASS" green or "FAIL" red badge |

Row click: expand to show full diagnostics (diag object)

## Live Log Panel
- Scrolling text log
- Timestamp + message
- Errors in red
- Auto-scroll to bottom
```

### 3. Test Result Schema: `docs/TEST-RESULT-SCHEMA.md`

```markdown
# Test Result Schema

Every node test produces this JSON object:

{
  // Identity
  "address": "sentnode1...",      // node address
  "moniker": "NodeName",          // operator name
  "country": "Germany",           // from node status
  "city": "Frankfurt",            // from node status
  "timestamp": "2026-03-24T...",  // ISO 8601

  // Connection
  "type": "WireGuard" | "V2Ray",
  "connected": true | false,
  "error": null | "error message",

  // Speed (null if not connected)
  "actualMbps": 45.2,             // measured throughput
  "baselineAtTest": 120.5,        // direct connection speed
  "speedtestMethod": "multi-request" | "probe-only",

  // Thresholds
  "pass10mbps": true,             // >= 10 Mbps
  "pass15mbps": true,             // >= 15 Mbps
  "passBaseline": true,           // >= 50% of baseline

  // Network access
  "googleAccessible": true,
  "googleLatencyMs": 145,

  // Node info
  "peers": 8,
  "maxPeers": null,
  "reportedDownloadMbps": 100,

  // V2Ray specific
  "diag": {
    "v2rayProto": "vless",
    "v2rayTransport": "tcp",
    "v2raySecurity": "tls",
    "v2rayPort": 4876,
    "v2rayAttempts": [...]
  },

  // WireGuard specific
  "diag": {
    "wgAssignedAddrs": ["10.0.0.5"],
    "wgServerPubKey": "...",
    "wgServerEndpoint": "1.2.3.4:51820"
  }
}
```

### 4. Reusable Test Function Specification: `docs/TEST-FUNCTION-SPEC.md`

```markdown
# Reusable Test Function

## Input
- nodeAddress: string (sentnode1...)
- wallet: initialized wallet with balance
- chainClient: initialized LCD/RPC client
- options: { gigabytes: 1, skipSpeedTest: false, v2rayExePath: string }

## Flow
1. Query node status → get protocol, remote URL, peers
2. Pre-verify: remote URL returns matching node address
3. Create session on chain (1 GB, ForceNewSession=true)
4. Wait 5s for chain propagation
5. Perform V3 handshake
6. Install tunnel (WG or V2Ray)
7. Verify tunnel (check external IP changed)
8. Speed test (1MB probe → 5x1MB if probe >= 3 Mbps)
9. Google accessibility check
10. Disconnect + cleanup tunnel
11. Return TestResult

## Output
TestResult object (see schema above)

## Error Handling
- Node offline: skip (no tokens spent)
- Address mismatch: skip (no tokens spent)
- Session creation failed: record error, move on
- Handshake failed: record error with details
- Tunnel failed: record error, cleanup
- Speed test failed: mark 0 Mbps, still record as connected

## Cleanup (MUST happen even on error)
- Disconnect VPN client
- Uninstall WireGuard tunnel service
- Kill V2Ray process
- Remove system proxy
```

### 5. Standalone Launch Guide: `docs/STANDALONE.md`

```markdown
# Running Node Tester Standalone

## As Web Dashboard (current)
1. cd sentinel-node-tester
2. npm install
3. Create .env with MNEMONIC=...
4. cscript //nologo SentinelAudit.vbs (Windows, admin for WireGuard)
5. Open http://localhost:3001

## Embedded in WPF App
Option A: WebView2
- Add Microsoft.Web.WebView2 NuGet
- Point WebView2 to http://localhost:3001
- Node Tester runs as background process

Option B: Native WPF (what Handshake dVPN is doing)
- Reimplement dashboard in XAML
- Use C# SDK for connections (not JS SDK)
- Speed test via HttpClient
- Same result schema

## Embedded in Electron App
- Import test functions from audit/node-test.js
- Render dashboard in renderer process
- Use IPC for test control

## Embedded in React/Web App
- Extract index.html CSS+JS
- Connect to Node Tester API via fetch
- SSE for real-time updates
```

---

## Why AI Keeps Failing To Integrate

### Problem 1: No Single Source of Truth for Dashboard Layout
AI reads index.html (700+ lines of HTML) and tries to translate to WPF. HTML→WPF translation loses layout intent. The CSS grid system doesn't map to WPF Grid columns without understanding the design intent.

**Fix:** `DASHBOARD-SPEC.md` with exact widths, alignments, data sources. AI reads the spec, not the HTML.

### Problem 2: No Clear Component Boundaries
AI doesn't know which parts of node-test.js are reusable vs which are specific to the batch pipeline. It reimplements everything from scratch.

**Fix:** `TEST-FUNCTION-SPEC.md` with input/output/flow. AI implements the spec, not reverse-engineers the code.

### Problem 3: No Data Contract
AI creates its own `NodeTestResult` class by guessing from results.json. Fields are wrong, missing, or misnamed.

**Fix:** `TEST-RESULT-SCHEMA.md` with exact JSON schema. AI copies the schema.

### Problem 4: No Integration Pattern
AI tries to stuff the entire Node Tester dashboard into a sidebar panel (360px). The Node Tester is a full-width dashboard.

**Fix:** `INTEGRATION.md` with explicit layout guidance: "The test dashboard should take over the full main area, not be squeezed into a sidebar."

---

## The Documentation The Node Tester Needs

```
sentinel-node-tester/
  docs/
    INTEGRATION.md          ← How to embed test functions in any app
    DASHBOARD-SPEC.md       ← Exact layout specification for the UI
    TEST-RESULT-SCHEMA.md   ← JSON schema for test results
    TEST-FUNCTION-SPEC.md   ← Reusable test function input/output/flow
    STANDALONE.md           ← How to run standalone on any platform
    API.md                  ← Express API endpoints for external integration
```

Without these docs, every AI (or human) that tries to integrate the Node Tester will:
1. Spend hours reading index.html trying to understand the layout
2. Reverse-engineer results.json to build a data model
3. Reimplement the test flow from scratch by reading node-test.js
4. Put the dashboard in the wrong place (sidebar vs main area)
5. Miss critical details (cleanup, error handling, V2Ray waits)

**The Node Tester is the most valuable testing tool in the ecosystem. It deserves documentation that matches its importance.**
