# Handshake dVPN Integration Experience — Every Bug, Every Mistake, Every Query

**Date:** 2026-03-24
**Duration:** 10+ hours building, 50+ iterations, 25+ mainnet connections
**App:** Handshake dVPN (C# WPF on Sentinel C# SDK)
**Goal:** Integrate Node Tester functionality as a Test tab

---

## Timeline of Failures

### Hour 1-7: Building the dVPN (worked)
Built complete dVPN: nodes, sessions, plans, wallet, settings, cache, flags. All working. Connected to mainnet, transferred tokens, subscribed to plans. Zero issues with the dVPN itself.

### Hour 8: "Add a Test tab" (disaster begins)
User asked to integrate Node Tester. AI read CLAUDE.md and MANIFESTO.md but did NOT read:
- `docs/AI-BUILD-NODE-TEST.md` (the actual build instructions)
- `docs/IN-APP-NODE-TESTING.md` (the design spec)
- `docs/FUNCTION-REFERENCE.md` (every function documented)

**Mistake 1:** AI tried to reverse-engineer the test flow from `audit/node-test.js` instead of reading the docs that already explain it.

### Hour 8.5: First Test Tab — wrong approach
Built a simple "Test Selected Node" button in the sidebar. User said: "I need the same interface as the Node Tester dashboard."

**Mistake 2:** AI put the test UI in the sidebar (360px) instead of the main area. The Node Tester is a full-width dashboard.

### Hour 9: Dashboard in main area — but buttons don't work
Rebuilt with XAML panels in the main area. Buttons rendered but clicking "New Test" did nothing.

**Mistake 3:** Used lambda factory pattern for button creation — WPF click handlers didn't bind.
**Fix:** Explicit button creation with direct `Click += async (_, _) =>` handlers.

### Hour 9.5: New Test works but test "Cancelled" immediately
Test connected successfully (handshake + tunnel verified on 5+ nodes) but speed test never ran. Result always "Cancelled."

**Mistake 4:** Passed `CancellationToken` to `ConnectAsync` inside `TestNodeAsync`. The SDK's internal async flow caused the token to fire during tunnel verification, before the speed test could start.
**Fix:** Removed `ct` from `ConnectAsync` and speed test calls. Only check `ct.IsCancellationRequested` between phases.

### Hour 10: Test blocks on background refresh
Clicking New Test hung — no log output after "Starting scan...". The test was waiting for `RefreshAllAsync` (background node probe) to finish, because both used the same chain client.

**Mistake 5:** `NativeVpnClient` has a single `_vpn` instance shared between normal connections and test connections. When the background refresh held the HTTP client, the test couldn't proceed.
**Fix:** Cancel `_refreshCts` before starting test. Create dedicated `testVpn` instance for testing.

### Hour 10.5: NullReferenceException crash
Clicking New Test twice (or before dashboard rendered) crashed with `_testProgressTb` being null.

**Mistake 6:** UI TextBlock references were set in `RenderTestStats()` but checked in `StartBatchTestAsync` background loop. If the dashboard wasn't rendered before the scan started, references were null.
**Fix:** Null-check all UI references in background loops. Added global crash handler in `App.xaml.cs`.

### Hour 11: Stop button doesn't work
User clicked Stop but the test kept running. The `CancellationToken.Cancel()` only works between nodes, not during a connection attempt (which takes 15-30 seconds).

**Mistake 7:** The Node Tester uses `state.stopRequested` flag checked at 4 points in the flow. Our implementation only used `CancellationToken` which doesn't interrupt SDK's internal async operations.
**Fix:** Added `_testStopRequested` volatile flag + async tunnel cleanup on stop.

### Hour 11.5: Peer count not showing
Test results showed "—" for peers. The test never queried node status separately — it relied on `ConnectAsync` which doesn't expose peer count.

**Mistake 8:** Didn't read `docs/FUNCTION-REFERENCE.md` Phase 2 which shows `nodeStatusV3()` returns `peers`, `bandwidth`, `location`, `clockDriftSec`. Our test skipped the pre-connect status check entirely.
**Fix:** Added Phase 0 pre-check: query node status, get peers/location/type before connecting.

### Hour 12: Speed test missing V2Ray connectivity pre-check
V2Ray speed test failed silently because SOCKS5 binding is asynchronous — the proxy wasn't ready when the first download started.

**Mistake 9:** `docs/AI-BUILD-NODE-TEST.md` Step 3 says "Connectivity targets: Google, Cloudflare, httpbin, ifconfig, ip-api" with retry. Our speed test went straight to download without checking connectivity.
**Fix:** Added Phase 0 connectivity check (3 attempts, 3s delay) before V2Ray speed test.

---

## Every User Query (Verbatim) and What They Meant

| User Said | What They Meant | What AI Did Wrong |
|-----------|----------------|-------------------|
| "integrate the node test functions as a separate tab" | Read the docs, use the adapter pattern, build full dashboard | AI read node-test.js source code instead of docs/ |
| "the node test page has to have the same interface as the node test project" | Copy localhost:3001 dashboard layout exactly | AI built a simplified version in the sidebar |
| "i need to see the complete interface inside of the application" | The dashboard isn't showing at all | Build was failing silently due to ternary in string interpolation |
| "copy the complete ux of whats running on localhost 3001" | Read index.html, replicate every section | AI kept building minimal versions instead of reading the full HTML |
| "why is it still showing so many 0s" | Use QuoteValue not BaseValue for prices | AI used BaseValue which is Cosmos sdk.Dec with 18 decimals |
| "per hour still not working in filter" | Chain doesn't expose payment type on sessions | AI didn't verify the chain data before building the filter |
| "the page is flickering" | Don't re-render during user interaction | AI called RenderNodes() from background refresh |
| "stop testing i didn't tell you to start a test" | The test auto-started or plans loaded into test area | Tab switching logic was wrong |
| "still no scanning or functionality" | New Test button click handler isn't wired | Lambda factory pattern failed in WPF |
| "crashes when i clicked new test" | NullReferenceException from unrendered UI elements | Background loop referenced UI elements before they existed |
| "nothing is happening at all" | StartBatchTestAsync is blocked waiting for RefreshAllAsync | Shared chain client blocked by background probe |
| "the stop button doesn't stop" | CancellationToken doesn't interrupt SDK ConnectAsync | Need flag + force tunnel cleanup |
| "why isn't peer count showing" | TestNodeAsync doesn't query node status before connecting | Skipped Phase 2 of Node Tester flow |

---

## What the Node Tester Docs Already Had (But AI Didn't Read)

### `docs/AI-BUILD-NODE-TEST.md` — The Build Instructions
This file literally tells you step by step how to integrate testing into any app:
- Step 0: Scan your project (language, platform, VPN backend)
- Step 1: Create adapter wrapping your app's connect/disconnect
- Step 2: Create test service with the adapter
- Step 3-6: Build dashboard, wire it up

**If AI had read this FIRST, 90% of the problems wouldn't have occurred.**

### `docs/IN-APP-NODE-TESTING.md` — The Design Spec
This file has:
- The `IVpnTestAdapter` interface (5 methods)
- The `testNode()` flow (5 phases: connect → connectivity → DNS → speed → disconnect)
- The result data model
- UI requirements for the Test tab
- Platform-specific notes for C# WPF
- Integration checklist (13 items)

### `docs/FUNCTION-REFERENCE.md` — Every Function Documented
Phase-by-phase flow with I/O for every function. The peer count source, the speed test timeout values, the pre-connect checks — all documented.

### `docs/CONSUMER-VS-TESTING.md` — What Functions to Use
Clear table of which SDK functions are consumer-safe vs testing-only, with token costs.

---

## Root Causes of All Failures

### 1. AI Read Source Code Instead of Documentation
The Node Tester has extensive docs in `docs/`. AI read `audit/node-test.js` (600 lines of complex code) instead of `docs/AI-BUILD-NODE-TEST.md` (clear step-by-step instructions).

**Fix for future:** Add to CLAUDE.md:
```
BEFORE building anything, read ALL files in docs/ directory.
Do NOT read source code until you've read the documentation.
```

### 2. AI Didn't Verify Assumptions Against Real Data
- Assumed `BaseValue` was a clean integer (it's an 18-decimal Cosmos type)
- Assumed `max_duration` distinguishes GB vs hourly sessions (it doesn't)
- Assumed `/sentinel/plan/v3/plans/{id}` works (returns 501)
- Assumed emoji flags render in WPF (they don't)

**Fix for future:** Add to docs:
```
KNOWN DATA GOTCHAS:
- PriceEntry.BaseValue has 18 decimal places — use QuoteValue
- ChainSession.max_bytes = 1000000000 for ALL sessions
- ChainSession.max_duration = "0s" for ALL sessions
- /sentinel/plan/v3/plans/{id} returns 501 — use subscription endpoints
- WPF cannot render emoji country flags — use PNG images
```

### 3. AI Built UI Before Verifying Backend Works
Built the Test tab dashboard before confirming `TestNodeAsync` actually completes a full test. Should have:
1. Run `TestNodeAsync` from a unit test or console
2. Confirm it returns a complete result
3. THEN build the UI

**Fix for future:** Add to docs:
```
TESTING ORDER:
1. Test the test function standalone (no UI)
2. Confirm speed test completes
3. Confirm result has all fields
4. THEN build dashboard
```

### 4. WPF-Specific Gotchas Not Documented
Multiple WPF issues that web developers wouldn't expect:
- Lambda factory patterns don't reliably bind click handlers
- Ternary expressions in string interpolation cause CS8361
- Background threads can't access UI elements
- `CancellationToken` doesn't interrupt SDK async operations
- Emoji flags don't render
- `ScrollViewer` + `StackPanel` rendering is different from HTML+CSS grid

**Fix for future:** Add to `docs/AI-BUILD-NODE-TEST.md`:
```
## WPF-Specific Notes
- Create buttons explicitly, not via factory functions
- Use Dispatcher.Invoke for all UI updates from background threads
- Null-check all UI element references in background loops
- Use volatile bool flags for stop, not just CancellationToken
- Test completion BEFORE building UI
```

---

## What Worked Well

Despite all the failures, these parts worked first time:
1. **C# SDK ConnectAsync** — connected to 5+ nodes on mainnet without issues
2. **WireGuard tunnel** — installed, verified, cleaned up properly
3. **V2Ray tunnel** — VLess/TCP/TLS connected and verified
4. **Speed test code** — HttpClient download logic was correct
5. **Google check** — HTTP GET to generate_204 worked
6. **Disk cache** — test results persisted and loaded correctly
7. **Node pre-check** — querying node status returned peers, location, type

The fundamental test infrastructure works. The failures were all in:
- UI wiring (WPF-specific)
- Async coordination (shared resources, cancellation)
- Data format assumptions (chain data quirks)
- Not reading existing documentation

---

## Recommendations for Node Tester Project

### 1. Add "READ DOCS FIRST" Warning
At the top of CLAUDE.md:
```
## BEFORE INTEGRATING NODE TESTING INTO ANY APP
Read these files IN ORDER before writing any code:
1. docs/AI-BUILD-NODE-TEST.md — step-by-step build guide
2. docs/IN-APP-NODE-TESTING.md — design spec with data models
3. docs/FUNCTION-REFERENCE.md — every function documented
4. docs/CONSUMER-VS-TESTING.md — which functions to use
```

### 2. Add Platform-Specific Gotchas Section
In `docs/AI-BUILD-NODE-TEST.md`, add a "Platform Gotchas" section for each target:
- WPF: threading, button binding, emoji flags, string interpolation
- Electron: SOCKS5 with fetch (doesn't work — use axios)
- Swift: URLSession proxy configuration

### 3. Add Data Format Warning
Document every chain data field that doesn't behave as expected:
- BaseValue vs QuoteValue
- max_bytes always 1000000000
- max_duration always "0s"
- Plan endpoint returns 501

### 4. Add "Verify Before UI" Workflow
The build guide should mandate:
1. Implement test function
2. Run it standalone, confirm complete result
3. Print result JSON to console
4. THEN build dashboard

### 5. Provide Complete Test Result Example
In docs, include an actual JSON result from a real test:
```json
{
  "address": "sentnode1abc...",
  "moniker": "MyNode",
  "protocol": "wireguard",
  "peers": 8,
  "speedMbps": 45.2,
  "googleAccessible": true,
  "googleLatencyMs": 145,
  "pass": true,
  "connectSeconds": 12.3,
  ...
}
```

This would have saved hours of reverse-engineering the result schema.

---

*Total time: 10+ hours. Total tokens spent: ~300 P2P. Total builds: 50+. Total crashes: 4. Total cancelled tests: 8. Tests that completed speed test: 0 (as of this writing — the fix is deployed but untested). The infrastructure works. The documentation gap was the bottleneck.*
