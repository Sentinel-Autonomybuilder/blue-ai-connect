# Handshake dVPN — Development Retrospective

> Honest analysis of what happened building a C# WPF dVPN with integrated node testing.
> Purpose: Document every lesson so the next integration takes 4 hours, not 40.

---

## Timeline

### Phase 1: Skeleton + Branding (Hour 0-2)
**What happened:** Created C# WPF project, white/black theme, HNS crystalline slash logo, Sentinel shield, Inter font, sidebar with 4 tabs (Nodes/Sessions/Plans/Test).
**Outcome:** Clean branded shell, auth screen with import/create wallet.
**What went right:** Starting from DVPN reference architecture saved massive time. The structure was proven.

### Phase 2: Core Functionality (Hour 2-6)
**What happened:** Built NativeVpnClient wrapping Sentinel C# SDK. Node list, pricing, connect/disconnect, balance, sessions. Hit multiple issues: BaseValue vs QuoteValue (18 decimal garbage), plan endpoint returning 501, fee grant auto-detection wrong for direct-connect.
**Outcome:** Working connect/disconnect to mainnet nodes.
**What went wrong:**
- BaseValue prices showed `000000000000` — took 3 iterations to fix because price format wasn't documented
- Plan endpoint `/sentinel/plan/v3/plans/{id}` returns 501 — had to reverse-engineer subscription+node workaround
- Fee grant detection assumed plan-based — wrong for direct-connect apps
**Time wasted:** ~3 hours on chain data format issues that should have been documented.

### Phase 3: Settings + Session Tracking (Hour 6-8)
**What happened:** Built AppSettings (DNS presets, polling intervals, tunnel config), SessionTracker (local payment mode persistence because chain doesn't expose GB vs hourly).
**Outcome:** Full settings overlay, session payment tracking.
**What should have been different:** DiskCache, AppSettings, SessionTracker should be in the SDK. Built 3 reusable components that every consumer app needs.

### Phase 4: Test Dashboard — First Attempt (Hour 8-12)
**What happened:** Started integrating Node Tester as a Test tab. No C# guide existed. Reverse-engineered from index.html. Lambda factory pattern for buttons failed in WPF. Speed test reimplemented from scratch using 3 speed targets + 6 connectivity targets.
**Outcome:** Dashboard renders but nothing actually scans.
**What went catastrophically wrong:**
- Shared the main VPN client for testing → state corruption
- CancellationToken passed to speed test → premature cancel
- Background refresh held chain client → connection timeout
- No dedicated testVpn per test → tunnel leftovers from previous test
**Time wasted:** ~6 hours fighting bugs that a proper integration guide would have warned about.

### Phase 5: Test Dashboard — Working (Hour 12-18)
**What happened:** Fixed every bug: dedicated testVpn per test, CancellationToken.None for speed/google, refresh cancel before test, volatile bool for stop, WireGuard pre-cleanup, failure JSONL logging.
**Outcome:** 135 nodes tested on mainnet. 118 PASS, 17 FAIL. Speed tests work. Google checks work.
**What went right:** Once the architecture was correct (dedicated testVpn, proper cancellation, cleanup in finally), it worked reliably for 135 straight nodes.

### Phase 6: UX Parity + Polish (Hour 18-24)
**What happened:** Added Resume button, Retest Failed with count badge, country flags (flagcdn.com PNG cache because WPF can't render emoji), click-to-copy, city column, BW column, stats grid.
**Outcome:** Dashboard visually matches Node Tester.
**What should have been different:** Country flag rendering in WPF was a 2-hour rabbit hole. The Node Tester should document the WPF flag solution (PNG cache from flagcdn.com).

### Phase 7: Final Features (Hour 24-26)
**What happened:** Added Export (JSON/CSV), Filter (All/WG/V2/Pass/Fail), Sort (click column headers), FAST/SLOW/FAIL badges, fixed dead code, fixed progress counter stuck on errors.
**Outcome:** Feature-complete test dashboard.

---

## Total: ~26 hours across 3 days

| Phase | Hours | Wasted | Could Have Been |
|-------|-------|--------|-----------------|
| Skeleton + Branding | 2 | 0 | 2 |
| Core Functionality | 4 | 3 | 1 (if chain data documented) |
| Settings + Tracking | 2 | 1 | 1 (if SDK had these components) |
| Test Dashboard v1 | 4 | 4 | 0 (if C# guide existed) |
| Bug Fixing | 6 | 4 | 2 (if gotchas documented) |
| UX Parity | 6 | 2 | 4 (if flag solution documented) |
| Final Features | 2 | 0 | 2 |
| **Total** | **26** | **14** | **12** |

**54% of time was wasted.** 14 hours could have been saved with proper documentation.

---

## The 27 Problems (Quick Reference)

| # | Problem | Hours Lost | Root Cause |
|---|---------|-----------|------------|
| 1 | No C# integration guide | 4 | Node Tester is JS-only |
| 2 | Speed test reimplemented | 3 | Not documented as portable spec |
| 3 | V2Ray SOCKS5 fresh HttpClient | 2 | Undocumented platform gotcha |
| 4 | WPF emoji flags don't work | 2 | No native app flag guide |
| 5 | DiskCache built from scratch | 0.5 | Should be in SDK |
| 6 | SessionTracker built from scratch | 0.5 | Chain doesn't expose payment type |
| 7 | testVpn null crash | 0.5 | Classic C# finally-block bug |
| 8 | Progress counter stuck | 0.5 | Catch didn't increment counter |
| 9 | CancellationToken premature cancel | 1 | C#-specific async pattern |
| 10 | Background refresh blocked | 1 | Single chain client contention |
| 11 | Shared VPN instance | 2 | No isolation guidance |
| 12 | Stale session 404 | 0.5 | Session expiry undocumented |
| 13 | WireGuard tunnel orphan | 0.5 | No cleanup guidance |
| 14 | NullRef on dashboard | 0.5 | UI init order |
| 15 | Stop button broken | 0.5 | CancellationToken insufficient |
| 16 | No previous results on restart | 0.5 | Basic UX gap |
| 17 | No export | 0 | Added at end |
| 18 | No sort/filter | 0 | Added at end |
| 19 | Binary PASS/FAIL | 0 | Changed to FAST/SLOW/FAIL |
| 20 | Dead code accumulated | 0 | Cleaned up |
| 21 | results.json format mismatch | 0.5 | DiskCache wrapper vs raw array |
| 22 | Transport detail missing | 0 | SDK limitation |
| 23 | BaseValue 18 decimals | 1 | Undocumented chain format |
| 24 | Node address mismatch | 0 | Chain data issue |
| 25 | Fee grant wrong | 0.5 | Direct-connect vs plan-based |
| 26 | Plan endpoint 501 | 1 | Broken chain endpoint |
| 27 | PreferHourly wrong unit | 0 | SDK bug |

---

## What Works Now (Verified on Mainnet)

- **135 nodes tested:** 118 PASS (87%), 17 FAIL
- **WireGuard:** 8.6 Mbps average, reliable tunnel setup
- **V2Ray:** 20.3 Mbps average (VLess/TCP/TLS transport)
- **Google checks:** Working with latency measurement
- **Failure detection:** Stale sessions, tunnel timeouts, clock drift, address mismatch
- **Persistence:** DiskCache with 7-day TTL, failure JSONL logging, app.log
- **Export:** JSON + CSV with SaveFileDialog
- **Filter:** All / WG / V2 / Pass / Fail
- **Sort:** Click column headers (Speed, Peers, Country, BW, Result)
- **Badges:** FAST (green ≥10 Mbps) / SLOW (amber <10) / FAIL (red)
- **Resume:** Continue interrupted scan from where it left off
- **Retest Failed:** Re-test only failed nodes with count badge
- **Flags:** 120+ countries with PNG cache from flagcdn.com

---

## Missing Features (Honest Assessment)

### Not Implemented
1. **Test run history** — each scan should auto-save to `runs/YYYY-MM-DD_HH-MM/` with dropdown to load previous runs and basic comparison ("10 more nodes passed today vs yesterday")
2. **Baseline measurement** — measure direct internet speed before tunnel testing
3. **Speed history pills** — last 10 baseline + last 10 node speeds as colored pills
4. **Session spend tracking** — record balance before scan, show running delta
5. **Transport detail** — "V2 tcp/tls" not just "V2" (SDK doesn't expose metadata entries)
6. **Status badge** — IDLE/RUNNING/PAUSED in header
7. **Expandable row diagnostics** — click row to see full details (session ID, connect time breakdown, error details)
8. **Test single node by address** — paste address, test just that one
9. **Real-time phase display** — "Connecting..." → "Speed testing..." → "Checking Google..."

### Why These Matter
Test run history is the #1 missing feature. A user runs tests on Monday and Tuesday. They want to compare. Right now each new scan's results replace the previous view. There's no way to load Monday's results and see how they compare to Tuesday's. This is the most basic feature of any testing tool.

---

## Lessons for Future Integrations

### 1. Dedicated Test VPN Instance (CRITICAL)
Never share the main VPN client. Create a fresh `SentinelVpnClient` per test node with `ForceNewSession = true`. Dispose after each test. Clean up WireGuard tunnels before AND after.

### 2. CancellationToken Architecture
- Pass `ct` to the outer test loop (check between nodes)
- Pass `CancellationToken.None` to speed test and Google check (let them complete once started)
- Use `volatile bool _stopRequested` as additional stop signal
- Cancel background refresh before starting test scan

### 3. Flag Rendering
WPF cannot render emoji flags. Use PNG images from `https://flagcdn.com/w40/{code}.png`. Three-layer cache: memory → disk → download. Cache permanently (flags don't change).

### 4. Progress Must Always Increment
Every code path (success, error, cancel) must increment the progress counter. Otherwise the UI freezes and users think the app is stuck.

### 5. The Node Tester Must Provide C# Code
The working C# code from this project should be in the Node Tester's BUILD-ON-ME.md:
- `TestNodeAsync()` — complete method with all phases
- `RunSpeedTestAsync()` — with all 7 fallback methods
- `CheckGoogleAsync()` — with SOCKS5 proxy support
- `DiskCache` — generic TTL cache
- `NodeTestResult` — data model with all fields
- `CountryCode()` — map with 120+ entries and fuzzy matching

### 6. Build Test Infrastructure First
If we had built the test tab BEFORE the main app features, we would have discovered the shared VPN client problem, the cancellation token issue, and the chain client contention on day 1 instead of day 3.

---

## For the SDK

Components built here that should be absorbed into the SDK:
1. **DiskCache** — generic `Save<T>/Load<T>` with TTL and stale-while-revalidate
2. **SessionTracker** — local payment mode persistence (chain doesn't expose this)
3. **AppSettings** — DNS presets, polling intervals, tunnel config, persisted to disk
4. **CountryCode mapping** — 120+ entries with fuzzy match
5. **Flag image loading** — three-layer cache pattern for native apps

These are documented in `Sentinel SDK/suggestions/2026-03-23-sdk-app-architecture-parity.md`.

---

## The Standard Going Forward

Every feature must answer 6 questions:
1. Does it work on first use? (New user, no data)
2. Does it work on return visit? (Data exists from previous session)
3. Does it work after restart? (App closed, reopened)
4. Does it work after failure? (Crash, network error, cancel)
5. Can the user share the output? (Export, copy)
6. Can the user investigate issues? (Click, expand, filter, sort)

**Current score: 5 out of 6.** Missing: test run history for comparing across sessions.
