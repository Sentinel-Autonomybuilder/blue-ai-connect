# Every Small Detail Matters — What Node Test Must Ship Ready-to-Deploy

**Date:** 2026-03-24
**Source:** 12+ hours building Handshake dVPN — hours wasted on details that should have been provided

---

## The Problem

When integrating Node Tester into an app, 60% of the time was spent on "small details" that have nothing to do with testing nodes. These details should be pre-solved and ready to deploy in the Node Tester package.

---

## Country Flags

### The Problem We Hit
WPF cannot render emoji country flags. Spent 3+ hours discovering this, finding flagcdn.com, building a cache system, mapping 120+ country name variants.

### What Node Tester Must Provide

**1. Complete country name → ISO code map (120+ entries with variants)**
```javascript
export const COUNTRY_MAP = {
  "united states": "US", "us": "US", "usa": "US",
  "the netherlands": "NL", "netherlands": "NL", "holland": "NL",
  "türkiye": "TR", "turkey": "TR",
  "dr congo": "CD", "democratic republic of the congo": "CD",
  "czechia": "CZ", "czech republic": "CZ",
  "russian federation": "RU", "russia": "RU",
  "viet nam": "VN", "vietnam": "VN",
  "south korea": "KR", "korea": "KR",
  "hong kong": "HK",
  "united arab emirates": "AE", "uae": "AE",
  // ... 120+ entries
};
```

The Node Tester already has this in `index.html` (the `_CC` object at line 688). **Export it as a reusable module.**

**2. Fuzzy matching function**
If exact match fails, try `contains` matching. "Republic of Korea" → finds "korea" → returns "KR".

**3. Flag URL helper**
```javascript
export function getFlagUrl(code, width = 40) {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
```

**4. Platform-specific rendering notes**
```
WEB/ELECTRON: Use emoji flags via String.fromCodePoint (works in all browsers)
WPF (.NET): Emoji flags DO NOT RENDER. Use PNG images from flagcdn.com. Cache to disk permanently.
SWIFT: Emoji flags work natively on macOS/iOS.
```

**5. Pre-download script**
```bash
# Download all flags used by Sentinel nodes (71 countries)
for code in us de fr gb nl ca jp sg au br in kr tr ro pl es it se no fi ch at ie pt cz hu bg gr ua ru hk tw th vn id ph mx ar cl co za il ae ng lv lt ee hr rs dk be lu mt cy is nz my bd pk eg ke ma pe ve ge gt pr cn cd sa kz mn sk al md jm bo ec uy bh; do
  curl -s -o "flags/${code}.png" "https://flagcdn.com/w40/${code}.png"
done
```

---

## Country Codes in Node Status

### The Problem We Hit
`NodeStatus.Location.Country` returns free-text strings with inconsistent formatting. "The Netherlands" vs "Netherlands" vs "NL" vs "Holland" — all the same country.

### What Node Tester Must Provide

**1. Normalized country code in the status response**
The Node Tester's `nodeStatusV3()` should return `countryCode` alongside `country`:
```json
{
  "location": {
    "country": "The Netherlands",
    "countryCode": "NL",
    "city": "Amsterdam"
  }
}
```

If the node doesn't provide a code, the Node Tester should normalize it using the country map before returning the result.

**2. Results should always include `countryCode`**
The test result object already has `countryCode` (line 698 in node-test.js). Ensure it's always populated, never empty.

---

## Price Formatting

### The Problem We Hit
Spent 2+ hours on `BaseValue` vs `QuoteValue`. Prices displayed as `52573.099722991367791000000000/GB`.

### What Node Tester Must Provide

**1. Formatted price in the result**
```json
{
  "gigabytePrices": [
    { "denom": "udvpn", "raw": "40152030", "display": "40.15 P2P/GB" }
  ]
}
```

**2. Price formatting function**
```javascript
export function formatP2P(udvpn) {
  const p2p = parseInt(udvpn) / 1_000_000;
  if (p2p >= 100) return `${Math.round(p2p)}`;
  if (p2p >= 10) return p2p.toFixed(1).replace(/\.0$/, '');
  if (p2p >= 1) return p2p.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  if (p2p >= 0.01) return p2p.toFixed(2);
  if (p2p >= 0.001) return p2p.toFixed(3);
  return p2p.toFixed(4);
}
```

**CRITICAL: Always use `quote_value` (integer), NEVER `base_value` (18-decimal Cosmos sdk.Dec).**

---

## Speed Test Targets

### What Must Be Pre-Configured
```javascript
export const SPEED_TARGETS = [
  { url: "https://speed.cloudflare.com/__down?bytes=1048576", name: "cloudflare", size: 1048576 },
  { url: "https://proof.ovh.net/files/1Mb.dat", name: "ovh", size: 1000000 },
  { url: "https://speedtest.tele2.net/1MB.zip", name: "tele2", size: 1000000 },
];

export const CONNECTIVITY_TARGETS = [
  "https://www.google.com",
  "https://www.cloudflare.com",
  "https://1.1.1.1/cdn-cgi/trace",
  "https://httpbin.org/ip",
  "https://ifconfig.me",
  "http://ip-api.com/json",
];

export const SPEED_THRESHOLDS = {
  PROBE_CUTOFF_MBPS: 3,       // Below this, skip multi-request
  PASS_10_MBPS: 10,            // SLA threshold
  PASS_15_MBPS: 15,            // High quality threshold
  BASELINE_MIN: 30,            // Minimum baseline for SLA applicability
  BASELINE_PASS_PCT: 0.5,      // 50% of baseline = pass
  ISP_BOTTLENECK_PCT: 0.85,    // 85% of baseline = ISP bottleneck
};

export const TIMEOUTS = {
  PROBE_MS: 30000,
  RESCUE_MS: 60000,
  GOOGLE_MS: 15000,
  MULTI_CHUNK_MS: 30000,
  CONNECTIVITY_MS: 15000,
  NODE_STATUS_MS: 12000,
  HANDSHAKE_MS: 90000,
};
```

These constants should be in `core/constants.js` and exported for any integration to use.

---

## Dashboard Colors

### What Must Be Documented
```
SPEED COLORS:
  >= 10 Mbps: GREEN (#22C55E / #00c853)
  >= 5 Mbps:  YELLOW/AMBER (#E09F3E / #ffab00)
  < 5 Mbps:   RED (#DC2626 / #ff1744)

RESULT BADGES:
  PASS: Green background, white text
  FAIL: Red background, white text

STAT CARD COLORS:
  Tested: default
  Total Failed: red value
  Pass 10 Mbps: green value
  Dead Plan Nodes: red value
  Not Online: gray value
  Pass Rate: default

SPEED PILLS (history):
  >= 30 Mbps: green
  >= 15 Mbps: yellow
  < 15 Mbps: red

PROGRESS BAR:
  Fill: accent color (brand-specific)
  Track: light gray

LOG:
  Timestamps: muted color
  Errors: red
  Success: green
  Default: secondary text color
```

---

## Table Column Widths

### Exact Specification (from Node Tester dashboard)
```
| Column    | Min Width | Align  | Overflow    |
|-----------|-----------|--------|-------------|
| Transport | 80px      | left   | truncate    |
| Node      | flex      | left   | ellipsis    |
| Country   | 80px      | left   | truncate    |
| City      | 100px     | left   | truncate    |
| Peers     | 50px      | center | —           |
| Speed     | 70px      | right  | fixed 1dp   |
| Baseline  | 70px      | right  | fixed 1dp   |
| Result    | 60px      | center | badge       |
```

Row height: 36-40px. Header height: 32px. Font size: 11-12px body, 10px header.

---

## Button States

### Every Button, Every State
```
NEW TEST:
  idle: enabled, accent background, white text
  running: disabled, gray background, "Scanning..."

RESUME:
  idle + has interrupted scan: enabled
  idle + no interrupted scan: disabled, gray
  running: disabled

RESCAN:
  idle: enabled, outline style
  running: disabled

RETEST FAILED:
  idle + has failures: enabled, red background
  idle + no failures: disabled, gray
  running: disabled

STOP:
  idle: disabled, gray
  running: enabled, red background, "Stop"
  stopping: disabled, "Stopping..."

ECONOMY:
  off: outline, "Economy"
  on: filled, "Economy ON"

PLAN SELECT:
  dropdown, populated from chain query

TEST PLAN:
  enabled when plan selected
  disabled when no plan selected

RESET:
  always enabled
  confirms before clearing
```

---

## Persistence Files

### What Must Exist On Disk
```
{appData}/
  test-results.json          ← Array of TestResult objects
  test-failures.jsonl        ← One JSON per line, timestamped failures
  test-sessions.json         ← Session credentials for reuse
  test-transport-cache.json  ← V2Ray transport success/failure history
  test-state.json            ← Scan state (position, counts, baseline history)
  test-baseline-history.json ← Last 10 baseline readings
  test-speed-history.json    ← Last 10 node speed readings
```

Each file must:
- Be created on first use (not on app startup)
- Survive app restart (restore state within 1 second)
- Handle corruption gracefully (reset to empty on parse error)
- Not grow unbounded (cap results at 2000 entries)

---

## SSE Event Types (for HTTP API approach)

### What the Dashboard Expects
```
event: log
data: { "msg": "Testing busurnode au 001..." }

event: progress
data: { "state": { "status": "testing", "testedNodes": 45, "totalNodes": 997, ... } }

event: test-result
data: { "address": "sentnode1...", "pass": true, "actualMbps": 45.2, ... }

event: baseline
data: { "mbps": 120.5 }

event: error
data: { "msg": "Node unreachable", "node": "sentnode1..." }

event: stopped
data: {}

event: complete
data: { "passed": 890, "failed": 107, "avgMbps": 32.1 }
```

---

## The Rule: Ship Complete, Not Close

Every detail in this document was discovered through painful trial-and-error during integration. Each one cost 30-120 minutes to solve. Total: 8+ hours on "small details."

The Node Tester must ship ALL of these as:
1. **Exported constants** (targets, timeouts, thresholds, colors)
2. **Exported utilities** (country map, flag URL, price formatter, fuzzy match)
3. **Documented specifications** (table widths, button states, persistence files)
4. **Platform-specific notes** (WPF can't render emoji, Swift can, etc.)

**If a builder has to discover any of these through trial-and-error, the Node Tester package is incomplete.**
