# Complete UX Parity Checklist — Node Tester Dashboard vs Handshake dVPN Test Tab

**Date:** 2026-03-24
**Source:** Line-by-line comparison of Node Tester index.html vs Handshake dVPN Test tab

---

## CONTROLS BAR

| Element | Node Tester | Handshake dVPN | Status |
|---------|------------|---------------|--------|
| New Test button | ✅ `startAudit()` | ✅ `StartBatchTestAsync()` | DONE |
| Resume button | ✅ `resumeAudit()` | ❌ Missing | MISSING |
| Rescan button | ✅ `rescanNodes()` | ❌ Missing | MISSING |
| Retest Failed button | ✅ `retestFails()` with count | ✅ `RetestFailedAsync()` | DONE (no count badge) |
| Stop button | ✅ `stopAudit()` | ✅ with force cleanup | DONE |
| Economy toggle | ✅ `toggleEconomy()` | ❌ Missing | MISSING |
| SDK toggle | ✅ JS/C# switch | N/A (removed for integrated) | CORRECT |
| Plan Select dropdown | ✅ populated from chain | ❌ Missing | MISSING |
| Test Plan button | ✅ `testPlan()` | ❌ Missing | MISSING |
| Reset button | ✅ `clearResults()` | ✅ clears results | DONE |
| DNS toggle | ✅ HNS/Google/Cloudflare | ❌ Missing | MISSING |
| Help button (?) | ✅ `showInfoPopup()` | ❌ Missing | LOW PRIORITY |

## STATS GRID (6 Cards)

| Stat | Node Tester | Handshake dVPN | Status |
|------|------------|---------------|--------|
| Tested | ✅ `processed` with "of X total \| Y remaining" | ✅ `_testDone/_testTotal` | DONE (sub-text incomplete) |
| Total Failed | ✅ fail count + "X% failure rate" | ✅ fail count + percentage | DONE |
| Pass 10 Mbps SLA | ✅ p10 count + "X% of connected" | ✅ pass10 count + percentage | DONE |
| Dead Plan Nodes | ✅ `r.inPlan && r.actualMbps == null` + "X/Y plan nodes failed" | ❌ Shows 0 always | MISSING — need `inPlan` field |
| Not Online | ✅ `r.actualMbps == null && (r.peers === 0 \|\| r.peers == null)` | ✅ totalChain - totalOnline | PARTIALLY DONE (different calculation) |
| Pass Rate | ✅ `done / processed` = "X%" (connection success rate) | ✅ passRate | DONE |

## SPEED HISTORY (2 Pill Rows)

| Element | Node Tester | Handshake dVPN | Status |
|---------|------------|---------------|--------|
| Last 10 Baseline Readings | ✅ colored pills (green >= 30, yellow >= 15, red < 15) | ❌ Missing entirely | MISSING |
| Last 10 Node Speeds | ✅ colored pills | ❌ Missing entirely | MISSING |
| Baseline measurement | ✅ `speedtestDirect()` before tunnel | ❌ Never measured | MISSING |

## PROGRESS BAR

| Element | Node Tester | Handshake dVPN | Status |
|---------|------------|---------------|--------|
| Title "Audit Progress" | ✅ | ✅ | DONE |
| Percentage label | ✅ "X% Complete" | ✅ | DONE |
| ETA | ✅ `updateETA()` every 1s | ✅ `EstimateEta()` | DONE |
| Fill bar | ✅ proportional | ✅ star columns | DONE |
| Node count | ✅ "X / Y Available Nodes" | ✅ | DONE |
| Current action | ✅ "Testing {moniker}..." or "Standby" | ✅ via `_testStatusTb` | DONE |
| Retest mode progress | ✅ shows retest-specific counts | ❌ Missing | MISSING |
| Retry count | ✅ shows total retries | ❌ Missing | MISSING |

## TABLE COLUMNS

| Column | Node Tester | Handshake dVPN | Status |
|--------|------------|---------------|--------|
| SDK | ✅ "JS" or "C#" badge | N/A (single SDK) | CORRECT — removed |
| Transport | ✅ "WG" or "V2 tcp/tls" full detail | ✅ "WG" or "V2" only | INCOMPLETE — need transport detail |
| Node | ✅ moniker, click to copy full address | ✅ moniker, no copy | INCOMPLETE — need click to copy |
| Country | ✅ flag emoji + country code | ✅ flag image + code (just fixed) | VERIFY — flags may be wrong |
| City | ✅ city name | ❌ Missing column | MISSING |
| Peers | ✅ number | ✅ number | DONE |
| Speed | ✅ "XX.X Mbps" colored by threshold | ✅ colored | DONE |
| Total BW | ✅ reported bandwidth from node | ❌ Missing column | MISSING |
| Baseline | ✅ baseline at time of test | ❌ Missing column | MISSING — no baseline measurement |
| Result | ✅ PASS/FAIL badge | ✅ PASS/FAIL text | DONE (should be badge) |

## TABLE ROW FEATURES

| Feature | Node Tester | Handshake dVPN | Status |
|---------|------------|---------------|--------|
| Click to copy address | ✅ `copyToClipboard()` | ❌ Missing | MISSING |
| Expandable diagnostics | ✅ click row to see diag object | ❌ Missing | MISSING |
| Max 200 rows | ✅ `maxRows = 200` | ✅ `Take(100)` | DONE (different limit) |
| Color coding speed | ✅ green >= 10, yellow < 10, red = fail | ✅ green/amber/red | DONE |
| Dedup by address | ✅ `upsertLocal()` | ❌ Appends duplicates | MISSING |

## LIVE LOG

| Feature | Node Tester | Handshake dVPN | Status |
|---------|------------|---------------|--------|
| Dedicated log panel | ✅ `logBody` div | ✅ `TestLogPanel` | DONE |
| Auto-scroll | ✅ `scrollTop = scrollHeight` | ✅ `ScrollToEnd()` | DONE |
| Max lines | ✅ 200 | ✅ 100 | DIFFERENT |
| Error coloring | ✅ red for errors | ✅ red for errors | DONE |
| Timestamps | ✅ HH:MM:SS | ✅ HH:MM:SS | DONE |
| [TEST] prefix | N/A (all log is test) | ✅ filters by [TEST] | DONE |

## DATA PERSISTENCE

| File | Node Tester | Handshake dVPN | Status |
|------|------------|---------------|--------|
| results.json | ✅ raw array | ✅ wrapped in `{Data:[]}` | WRONG FORMAT |
| failures.jsonl | ✅ JSONL | ✅ just added | DONE |
| session-credentials.json | ✅ | ❌ (ForceNewSession=true) | N/A |
| transport-cache.json | ✅ | ❌ | MISSING |
| .state-snapshot.json | ✅ | ❌ | MISSING |

## HEADER BAR DATA

| Element | Node Tester | Handshake dVPN | Status |
|---------|------------|---------------|--------|
| Wallet address | ✅ truncated | ✅ in topbar | DONE (different location) |
| Balance | ✅ formatted P2P | ✅ in topbar | DONE |
| Status badge (IDLE/RUNNING/PAUSED) | ✅ colored badge | ❌ Missing | MISSING |
| Session spend tracking | ✅ "Est. Cost: X P2P" | ❌ Missing | MISSING |

## COUNTRY FLAGS SPECIFICALLY

| Platform | Node Tester (Web) | Handshake dVPN (WPF) | Issue |
|---------|-------------------|---------------------|-------|
| Flag rendering | ✅ Emoji via `String.fromCodePoint` | ✅ PNG from flagcdn.com | Different method — both work |
| Country map | ✅ 80+ entries with fuzzy match | ✅ 120+ entries with fuzzy match | dVPN has MORE |
| Empty country | Shows empty | Shows "—" | Minor difference |
| Flag in table | ✅ emoji before code | ✅ image before code | VERIFY rendering |

---

## SUMMARY: What's Missing

### CRITICAL (affects data quality)
1. **Dead Plan Nodes stat** — need `inPlan` field on test results
2. **Baseline measurement** — need direct speed test before tunnel testing
3. **Transport detail** — "V2 tcp/tls" not just "V2"
4. **City column** — exists in Node Tester table, missing in ours
5. **Total BW column** — reported node bandwidth, missing
6. **results.json format** — must be raw array, not `{Data:[]}`

### IMPORTANT (affects UX parity)
7. **Resume button** — continue interrupted scan
8. **Speed history pills** — last 10 baseline + last 10 node speeds
9. **Plan Select + Test Plan** — test only plan nodes
10. **Click to copy address** — on table row
11. **Status badge** (IDLE/RUNNING/PAUSED)
12. **Session spend tracking** — show tokens spent during scan
13. **Dedup results** — upsert by address, don't append duplicates
14. **State persistence** — save scan state for resume
15. **Retest Failed count badge** — "Retest Failed (17)"

### NICE TO HAVE
16. Economy toggle
17. DNS toggle
18. Help popup
19. Expandable diagnostics row
20. Run archives
21. Retry count display

---

## For Node Tester Project: Provide These as Exports

The Node Tester should export these so integrations don't rebuild them:

```javascript
// core/countries.js — already exists as _CC in index.html
export const COUNTRY_MAP = { ... };
export function countryToCode(name) { ... }
export function countryToFlag(name) { ... } // emoji for web, URL for native

// core/constants.js — partially exists
export const SPEED_THRESHOLDS = { PROBE_CUTOFF: 3, PASS_10: 10, PASS_15: 15 };
export const SPEED_COLORS = { FAST: '#00c853', SLOW: '#ffab00', FAIL: '#ff1744' };
export const TABLE_COLUMNS = [ { key: 'transport', width: 80, align: 'left' }, ... ];
export const STAT_CARDS = [ { id: 'tested', label: 'Tested', color: 'default' }, ... ];

// core/result-format.js — doesn't exist yet
export function formatResult(raw) { ... } // normalize any result to standard format
export function resultToTableRow(result) { ... } // extract table-relevant fields
export function isDeadPlanNode(result) { return result.inPlan && result.actualMbps == null; }
```

**The country map is currently ONLY in index.html (client-side JS).** It needs to be in a shared module that both server and integrations can import.
