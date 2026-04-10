# What It Takes for an AI to One-Shot Build a Sentinel Node Tester

**Date:** 2026-03-19
**Context:** After analyzing the production node tester (`sentinel-node-tester/`) — 950+ nodes tested, 30-worker parallel scan, batch payments, WireGuard + V2Ray tunnels, real-time dashboard. This document captures every hard-won decision so the SDK's AI-BUILD-INSTRUCTIONS.md can enable one-shot node tester builds.

---

## The Honest Answer: It Can't. Not Without This Document.

A node tester is fundamentally different from a VPN client. A VPN client connects to ONE node and stays connected. A node tester connects to HUNDREDS of nodes sequentially, pays for each, measures speed, records results, handles failures gracefully, and never crashes. The SDK's AI-BUILD-INSTRUCTIONS.md covers the VPN client use case. This document covers everything else.

---

## How a Node Tester Differs from a VPN Client

| Concern | VPN Client | Node Tester |
|---------|-----------|-------------|
| Nodes tested | 1 (user picks) | ALL (~950) |
| Error handling | Crash/retry is fine | MUST log and continue |
| Payment | 1 node at a time | Batch 5 per TX (saves gas) |
| Sessions | 1 active | Hundreds (reuse map) |
| Speed test | Not needed | Core feature |
| Results | Not persisted | JSON on disk + dashboard |
| Parallelism | None | 30 concurrent status checks |
| Admin elevation | User handles | Required for WireGuard |
| WireGuard lifecycle | Up once, down on exit | Up/down per node (45s watchdog) |
| V2Ray lifecycle | Spawn once | Spawn/kill per node (PID tracking) |
| Tunnel cleanup | On process exit | After EVERY node + emergency handlers |
| Clock drift | Not relevant | Kills VMess AEAD (must detect) |
| Transport fallback | Pick best | Try ALL transports sequentially |
| Balance tracking | Show once | Track spending, warn on low |
| Process safety | Kill on exit | NEVER kill node.exe (kills ) |

---

## The 7 Walls an AI Hits

### Wall 1: Batch Payment Is Not in the SDK

The SDK provides `subscribeToDvpn()` for single-node payment. A node tester paying 950 nodes individually costs 950 TXs x 0.2 DVPN gas = 190 DVPN in gas alone. Batch payment (5 nodes per TX) reduces this to 190 TXs.

**What the AI needs to know:**

```
Batch payment: Put up to 5 MsgStartSessionRequest messages in ONE TX.
Fee calculation: { amount: [{ denom: 'udvpn', amount: String(200000 * N) }], gas: String(800000 * N) }
  where N = number of messages in the batch.

Session ID extraction: A batch TX produces multiple session IDs.
  Parse txResult.events — each 'session' type event has a 'session_id' or 'id' attribute.
  Event attribute keys may be base64-encoded (CosmJS quirk) — decode with:
    Buffer.from(attr.key, 'base64').toString('utf8')
  Map session IDs to nodes by position (first message = first session ID, etc.).

If some IDs fail to extract: invalidate session cache, query chain for missing sessions.
```

**The SDK should provide:** `batchStartSessions(nodes, gigabytes)` that handles all of this.

### Wall 2: Session Reuse Is Critical (and Complex)

Without session reuse, you pay for every node on every test run. At ~40 DVPN/node, testing 950 nodes costs ~38,000 DVPN. Session reuse avoids re-paying for nodes you've already paid for.

**What the AI needs:**

```
Session Map (O(1) lookups):
  Query: GET /sentinel/session/v3/sessions?address={wallet}&status=1&pagination.limit=200
  Build a Map<nodeAddr, {sessionId, maxBytes, usedBytes}>.
  Full pagination required (next_key loop) — wallet may have hundreds of sessions.
  Cache for 2 minutes (SESSION_MAP_TTL).

Session field names (v3 chain response):
  Sessions are wrapped in 'base_session' object.
  Node address: base_session.node_address || base_session.node
  Account: base_session.acc_address || base_session.address
  Used bytes: base_session.download_bytes + base_session.upload_bytes
  Max bytes: base_session.max_bytes
  Session ID: base_session.id (BigInt — chain uses uint64)

Credential cache (disk-persistent):
  After successful handshake, save WG keys / V2Ray UUID to disk.
  On next test: skip payment AND handshake, go straight to tunnel.
  Clear cache on handshake failure (stale credentials).

Duplicate payment guard:
  Track which nodes were paid this run. Never pay twice.
  Set<nodeAddr> paidNodesThisRun — check before every payment.

Session poisoning:
  If a session's handshake fails, mark it as poisoned.
  Set<nodeAddr:sessionId> poisonedSessions — skip during lookups.
  A poisoned session will never work; need a new one.
```

**The SDK should provide:** `SessionManager` class with reuse, caching, and poison tracking.

### Wall 3: V2Ray Config Building Is a Minefield

The SDK's `buildV2RayConfig()` handles basic config. But a node tester needs ALL transport variants working, because it tests every node regardless of transport type.

**Critical V2Ray specifications the AI must follow exactly:**

```
Protocol mapping (sentinel-go-sdk types):
  proxy_protocol:     1=VLess  2=VMess
  transport_protocol: 1=domainsocket 2=gun 3=grpc 4=http 5=mkcp 6=quic 7=tcp 8=websocket
  transport_security: 0=unspecified 1=none 2=TLS

CRITICAL: "gun" (2) and "grpc" (3) are DIFFERENT protocols in V2Ray 5.x.
  gun = raw HTTP/2 frames. grpc = gRPC library.
  Both need grpcSettings: { serviceName: '' }

Network map for V2Ray config:
  { 2: 'gun', 3: 'grpc', 4: 'http', 5: 'mkcp', 6: 'quic', 7: 'tcp', 8: 'websocket' }

V2Ray config structure (must match sentinel-go-sdk client.json.tmpl):
  - SOCKS inbound with sniffing
  - API inbound (dokodemo-door) for StatsService — RANDOM port (avoid TIME_WAIT collisions)
  - ALL metadata entries as SEPARATE outbounds (not a single outbound)
  - Outbounds sorted by transport reliability: tcp > ws > http > gun > mkcp > grpc/none > grpc/tls > quic
  - Routing: proxy tag → first outbound (most reliable)
  - Policy: uplinkOnly=0, downlinkOnly=0
  - Global transport section with quicSettings: { security: 'none', key: '', header: { type: 'none' } }
  - NEVER use balancer/observatory — causes session poisoning

Per-outbound rules:
  VMess: users: [{ id: uuid, alterId: 0 }]  — NO 'security' field in user object
  VLess: users: [{ id: uuid, encryption: 'none' }]  — NO 'flow' field (xtls is Xray-only)
  TLS:   tlsSettings: { allowInsecure: true, serverName: serverHost }
  gRPC:  grpcSettings: { serviceName: '' }
  QUIC:  quicSettings: { security: 'none', key: '', header: { type: 'none' } }

Outbound iteration (node tester specific):
  Try EACH outbound sequentially. If first fails, try next.
  For each outbound: write new config, spawn v2ray, wait for SOCKS port, run speedtest.
  This is different from VPN client (which just uses the first/best).

V2Ray binary:
  V2Ray 5.2.1 (V2Fly build) is confirmed working.
  5.44.1 works but warns about missing observatory.
  Binary must be in bin/ directory (added to PATH at startup).
  Command: v2ray run -config <path>

UUID format for V2Ray handshake:
  Go [16]byte = JSON integer array, NOT base64, NOT string.
  const hex = uuid.replace(/-/g, '');
  const uuidBytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    uuidBytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  Body: { uuid: uuidBytes }  — field name is "uuid" not "uid"
```

**Observed transport success rates (780 nodes tested):**

| Transport | Security | Success Rate |
|-----------|----------|-------------|
| tcp | none | 100% |
| websocket | none/tls | 100% |
| http | none | 100% |
| gun | none | 100% |
| mkcp | none | 100% |
| grpc | none | 87% |
| grpc | tls | ~0% (serverName fix applied, unverified) |
| quic | none/tls | 0% (no active nodes) |
| domainsocket | — | 0% (unusable remotely) |

**The SDK should provide:** `buildV2RayConfig()` that generates ALL outbounds sorted by reliability, with proper per-transport settings.

### Wall 4: Clock Drift Detection Kills VMess

VMess AEAD authentication requires client and server clocks within +/-120 seconds. If the drift exceeds this, VMess silently reads random bytes for ~16 seconds then disconnects ("drain" pattern). The AI sees "context canceled" after 15 seconds and has no idea why.

**What the AI needs:**

```
Detection: nodeStatusV3() measures HTTP Date header vs local time.
  const before = Date.now();
  const res = await axios.get(url);
  const after = Date.now();
  const serverTime = new Date(res.headers['date']).getTime();
  const localMidpoint = before + (after - before) / 2;
  const clockDriftSec = Math.round((serverTime - localMidpoint) / 1000);

If |clockDriftSec| > 120:
  - If node has VLess outbounds: strip ALL VMess outbounds, use VLess only
  - If VMess-only: mark as FAIL with clear error message
  - NEVER attempt VMess connection — it will silently drain for 16s then fail
```

**The SDK should provide:** Clock drift measurement in `queryNodeStatus()`, with `isVMessViable()` helper.

### Wall 5: WireGuard Requires Admin + Has Invisible Failure Modes

WireGuard tunnel management on Windows requires Administrator privileges (the WireGuard service runs as SYSTEM). Without admin, tunnel install silently fails or hangs.

**What the AI needs:**

```
Admin detection:
  try { execSync('net session', { stdio: 'ignore' }); return true; }
  catch { return false; }

WireGuard binary: C:\Program Files\WireGuard\wireguard.exe
  Commands: /installtunnelservice <confpath>  /uninstalltunnelservice <name>
  NOT /installtunnel or /removetunnel (different commands, don't work)

Config file location: C:\ProgramData\sentinel-wg\wgsent0.conf
  NOT user temp dir — SYSTEM account can't read C:\Users\X\AppData\Local\Temp
  Set ACL: icacls <dir> /inheritance:r /grant:r <USER>:F /grant:r SYSTEM:F

Config format:
  [Interface]
  PrivateKey = <base64>
  Address = <assigned IPs from handshake, comma-separated>
  MTU = 1420

  [Peer]
  PublicKey = <server public key from handshake>
  Endpoint = <IP:PORT from handshake>
  AllowedIPs = <split tunnel IPs or 0.0.0.0/0>
  PersistentKeepalive = 30

Split tunneling (CRITICAL for testing):
  Route ONLY speedtest IPs through tunnel: Cloudflare CDN + fallback hosts + Google
  Full tunnel (0.0.0.0/0) = if tunnel dies, ALL internet dies
  Pre-resolve DNS before installing tunnel (DNS won't work through dead tunnel)

Tunnel lifecycle (45-second watchdog):
  Install → wait 1.5s → speedtest → uninstall → emergency cleanup
  Watchdog timer: if tunnel > 45s, force-kill (prevents internet death)
  Emergency cleanup on EVERY exit: process.on('exit'), SIGINT, SIGTERM, uncaughtException

Exponential retry for install:
  Try at 1.5s, 1.5s, 2s delays (5s total budget)
  Most peers register within 1-2 seconds

Cleanup after EVERY node:
  uninstallWgTunnel() + emergencyCleanupSync()
  Also clean via 'sc query/stop/delete' for any WireGuardTunnel$wgsent* services
```

**The SDK should provide:** Platform-specific tunnel manager with watchdog, split tunneling, and emergency cleanup.

### Wall 6: Speed Testing Through Tunnels Is Fragile

Speed testing through a VPN tunnel is fundamentally different from a normal download. DNS can fail. Cloudflare may be unreachable. The tunnel may be up but not routing traffic.

**What the AI needs:**

```
Methodology: Multi-request (5 x 1MB sequential downloads, each with FRESH TCP+TLS connection)
  This compounds VPN overhead (extra RTT per handshake) across chunks.
  Adaptive: 1MB probe first. If < 3 Mbps, report probe result (save time on slow nodes).

WireGuard speed test: speedtestDirect()
  All traffic routes through tunnel (split tunnel to speedtest IPs only).
  Pre-resolve Cloudflare IP to avoid DNS failures behind WireGuard tunnels.
  IP-based URL with Host header + servername SNI.
  Fallback chain: Cloudflare IP → Cloudflare hostname → proof.ovh.net → speedtest.tele2.net → rescue (2MB + 60s timeout)

V2Ray speed test: speedtestViaSocks5(testMb, proxyPort)
  Routes through SOCKS5 proxy on localhost:PORT.
  MUST use axios (native fetch silently ignores SOCKS5 agent — undici bug).
  Fresh SocksProxyAgent per request (V2Ray can fail with connection reuse).
  Connectivity check FIRST: try google.com/cloudflare.com/1.1.1.1 via SOCKS5.
    3 attempts with 5s pause between. If all fail: "SOCKS5 tunnel has no internet connectivity"
  Fallback chain: same as WireGuard, through SOCKS5.
  Last resort: timed GET of google.com as rough speed estimate.

Speed cap:
  If measured speed > baseline speed: cap at baseline * 0.97.
  This prevents impossible results from speed bursts.

Scoring:
  pass10mbps: actualMbps >= 10
  pass15mbps: actualMbps >= 15 AND baseline >= 30
  passBaseline: actualMbps >= (baseline * 0.5)
  ispBottleneck: (actual / baseline) >= 0.85

Google accessibility check:
  After speedtest, check if google.com is reachable through the tunnel.
  WireGuard: direct HTTPS GET to cached Google IP with Host header.
  V2Ray: axios GET via SocksProxyAgent.
  Records: googleAccessible (bool), googleLatencyMs (number), googleError (string).
```

**The SDK should provide:** `SpeedTest` class with tunnel-aware measurement, fallback chain, and adaptive methodology.

### Wall 7: The Entire Pipeline Must Be Resilient

A VPN client fails once and the user retries. A node tester processes 950 nodes over hours. It CANNOT crash mid-run.

**What the AI needs:**

```
Zero-skip system: Every node ends as PASS or FAIL. Never "skip".
  Retry strategy per failure type:
    VPN interference → PAUSE audit, poll every 30s, auto-resume when clear (10 min max)
    Chain lag (404) → wait 10s, retry (up to 2x)
    Network timeout → wait 5s, retry (up to 2x)
    Session conflict (409) → clear credential cache, retry (up to 2x)
    Node error (address mismatch, DB corrupt) → FAIL immediately (no retry)
    Fatal → FAIL immediately

VPN interference detection (Windows):
  Check 1: Non-Sentinel VPN adapters via 'netsh interface show interface'
  Check 2: Suspicious default routes (10.x, 172.16-31.x, 100.64.x gateways)
  Check 3: DNS resolution failure
  Auto-pause: set state.status='paused', state.pauseReason=reason
  Poll every 30s until clear. Auto-resume when all checks pass.

Handshake error handling:
  409 "already exists" → node race condition. Wait 15s, retry. If still 409, wait 20s, retry once more.
  "does not exist" → session not visible to node yet. Wait 10s, retry.
  "ABCI query failed" → node RPC timeout. Wait 20s, retry.
  "address mismatch" → node format bug. Wait 5s, retry once.
  "database corrupt" → permanent node failure. FAIL immediately.
  "no such table" → permanent node failure. FAIL immediately.

V2Ray process management:
  Kill ALL v2ray.exe before starting (killAllV2Ray).
  Wait 1.5s after kill.
  Spawn with stdio: 'pipe'. Capture stdout + stderr for diagnostics.
  Wait for SOCKS5 port readiness (waitForPort with TCP probe, 8-12s timeout).
  Wait 2s after port ready before speedtest.
  After test: proc.kill() + taskkill /F /PID (backup).
  NEVER use 'taskkill /F /IM node.exe' — this kills  / the Node.js process running the tester.

Rotating SOCKS port:
  Start at random 10800-11800. Increment per test.
  Check port availability with net.createServer().listen() before use.
  Avoids Windows TIME_WAIT collisions from rapid spawn/kill cycles.

Random API port:
  V2Ray's dokodemo-door API inbound: random 10000-60000.
  Fixed port 2080 causes cascading bind failures.

Failure logging:
  Append to results/failures.jsonl (one JSON line per failure).
  Include: timestamp, node address, error message, type, sessionId, diagnostics.
  This is the debugging lifeline when investigating patterns.

Results persistence:
  Save to results/results.json after EVERY node (not just at end).
  On startup: load existing results.json, rehydrate state counters.
  Resume mode: skip already-tested nodes (by address).

Graceful shutdown:
  On SIGINT/SIGTERM: emergencyCleanupSync() (removes all WG tunnels).
  On uncaughtException: log error, emergency cleanup.
  On unhandledRejection: log, cleanup.
  Watchdog: every 5s, check if any tunnel has been up > 45s.
```

---

## Complete Architecture Specification

### Directory Structure

```
node-tester/
├── core/
│   ├── constants.js     # All config: env vars, endpoints, paths, protocol msg types
│   ├── errors.js        # Typed error classes: AuditError, ChainError, HandshakeError, etc.
│   ├── types.js         # JSDoc type definitions: ChainNode, NodeStatus, TestResult, AuditState
│   ├── wallet.js        # Mnemonic → wallet, signing client, broadcast retry, RPC failover
│   ├── chain.js         # LCD queries: node list (paginated), plan membership, endpoint failover
│   └── session.js       # Session map, credential cache, batch payment, duplicate guard, poisoning
├── protocol/
│   ├── v3protocol.js    # Handshake (WG + V2Ray), protobuf encoding, V2Ray config builder
│   ├── speedtest.js     # Cloudflare speed test: direct (WG) + SOCKS5 (V2Ray), adaptive, fallbacks
│   └── diagnostics.js   # VPN interference detection, failure classification, pause/resume
├── platforms/
│   └── windows/
│       ├── wireguard.js # WG service management: install/uninstall/watchdog/emergency cleanup
│       ├── v2ray.js     # V2Ray process spawn/kill, config writing, SOCKS port rotation
│       └── network.js   # VPN adapter detection, route inspection, DNS checks
├── audit/
│   ├── pipeline.js      # Main audit loop (runAudit), retest (runRetestSkips), plan test
│   ├── node-test.js     # Single node test: payment → handshake → tunnel → speedtest → result
│   └── retry.js         # Zero-skip retry logic: interference pause, chain lag, network retry
├── server.js            # Express server: API routes, SSE, state management (~250 lines)
├── index.html           # Dashboard UI (single file, ~1100 lines)
├── bin/
│   └── v2ray.exe        # V2Ray 5.2.1 binary (MUST be included)
├── results/
│   ├── results.json     # Persistent test results
│   ├── failures.jsonl   # Failure log (one JSON per line)
│   └── session-credentials.json  # Cached handshake credentials
└── .env                 # MNEMONIC, RPC, DENOM, GIGABYTES_PER_NODE, etc.
```

### .env Configuration

```
MNEMONIC=<24-word cosmos mnemonic>
RPC=https://rpc.sentinel.co:443
DENOM=udvpn
GAS_PRICE=0.2udvpn
GIGABYTES_PER_NODE=1
TEST_MB=10
MAX_NODES=0           # 0 = all nodes
NODE_DELAY_MS=5000    # Delay between nodes (ms)
PORT=3001
```

### Dependencies

```json
{
  "@cosmjs/proto-signing": "^0.32.2",
  "@cosmjs/stargate": "^0.32.2",
  "@noble/curves": "^2.0.1",
  "axios": "^1.6.8",
  "dotenv": "^16.4.5",
  "express": "^4.18.2",
  "long": "^5.2.3",
  "socks-proxy-agent": "^8.0.4"
}
```

Note: `@cosmjs/crypto` and `@cosmjs/amino` are included transitively via `@cosmjs/stargate`.

### Platform Requirements

- **Node.js:** v18+ (for AbortSignal.timeout, native fetch)
- **OS:** Windows 11 (WireGuard service, netsh, taskkill, route print)
- **Admin:** Required for WireGuard (use VBS launcher for UAC elevation)
- **WireGuard:** Installed at `C:\Program Files\WireGuard\wireguard.exe`
- **V2Ray:** v5.2.1 binary in `bin/v2ray.exe` (V2Fly build)

---

## The Complete Flow: What Happens When You Click "Start Scan"

### Phase 0: Setup (~5 seconds)

```
1. Derive wallet from mnemonic (cached after first derivation)
2. Create SigningStargateClient with custom Registry (v3 message types registered)
3. Fetch balance from chain
4. Check V2Ray binary availability
5. Check WireGuard binary + admin status
6. Pre-resolve Cloudflare CDN IP (cached 5 min — avoids DNS failures behind tunnels)
7. Run baseline speed test (direct, no tunnel — measures ISP speed)
```

### Phase 1: Fetch Node List (~5 seconds)

```
1. Probe LCD endpoints for first working one (6s timeout per endpoint)
2. Paginated fetch: GET /sentinel/node/v3/nodes?status=1&pagination.limit=200
   Loop on pagination.next_key until null
   First request includes pagination.count_total=true
3. Parse nodes: extract address, remote_url, gigabyte_prices
4. Log pagination mismatch if fetched count != chain total
5. Cache node list (5 min TTL)
6. Fetch plan membership (which nodes belong to subscription plans)
```

### Phase 2: Parallel Online Scan (~35 seconds for 950 nodes)

```
1. Spawn 30 concurrent workers
2. Each worker: GET node's remoteUrl/ (v3 status endpoint)
   6-second timeout per node
3. Parse response: type (wireguard/v2ray), moniker, peers, bandwidth, location
4. Measure clock drift from HTTP Date header
5. Filter: remove nodes without udvpn pricing, without matching binary (no WG exe = skip WG nodes)
6. Economy mode: cap to affordable node count based on remaining balance
7. Resume mode: filter out already-tested nodes
8. Report: "X testable nodes. ~Y DVPN/node avg, ~Z DVPN total est."
```

### Phase 3: Batched Payment + Sequential Test (~10 minutes per batch of 5)

```
For each batch of 5 nodes:

  A. VPN interference check (before each batch)
     - Check for non-Sentinel VPN adapters, suspicious routes, DNS failure
     - If detected: PAUSE, poll every 30s, resume when clear (10 min max)

  B. Batch payment
     - Build 5 MsgStartSessionRequest messages
     - Single TX with fee = 200000 * 5 udvpn, gas = 800000 * 5
     - signAndBroadcastRetry (up to 3 retries on sequence mismatch / RPC failure)
     - Extract session IDs from TX events
     - If some IDs missing: invalidate session cache, query chain
     - Poll chain for new sessions (waitForBatchSessions, 20s max)

  C. For each node in batch:
     1. Refresh baseline speed
     2. testWithRetry (up to 2 retries based on failure classification):
        a. Online check (skip if pre-scanned)
        b. Clock drift check (VMess AEAD +/-120s limit)
        c. Price check (must have udvpn pricing)
        d. Session resolution:
           - Check credential cache (FREE — skip payment + handshake)
           - Check batch payment map (pre-paid session ID)
           - Check session reuse map (existing session on chain)
           - Individual payment (last resort)
        e. Handshake with retry:
           - WireGuard: generate keypair, POST peer request, parse assigned IPs + endpoint
           - V2Ray: generate UUID, POST uuid bytes, parse metadata config
           - Handle 409 (already exists), node DB corrupt, address mismatch, ABCI timeout
        f. Tunnel:
           WireGuard:
             - Write config to C:\ProgramData\sentinel-wg\wgsent0.conf
             - Split tunneling: only speedtest IPs routed through tunnel
             - Install tunnel service, wait 1.5s
             - Speed test (direct — all traffic through WG)
             - Google accessibility check
             - Uninstall tunnel
           V2Ray:
             - Kill all v2ray.exe processes
             - Wait 1.5s
             - For each outbound (sorted by reliability):
               - Write config, spawn v2ray process
               - Wait for SOCKS5 port readiness (8-12s)
               - Wait 2s more
               - Speed test via SOCKS5
               - Google accessibility check via SOCKS5
               - If success: break. If fail: try next outbound.
             - Kill v2ray by PID
        g. Score result:
           - Cap speed at baseline * 0.97 (prevent impossible results)
           - Calculate pass/fail for 10 Mbps SLA, 15 Mbps SLA, 50% baseline
        h. Save result to results.json
        i. Broadcast via SSE to dashboard
     3. Cleanup: uninstall WG tunnel, emergency cleanup, sleep NODE_DELAY_MS
```

### Phase 4: Completion

```
1. Emergency cleanup (all WG tunnels)
2. Set state.status = 'done'
3. Broadcast final state
4. Log summary: "Tested X, Failed Y. Z retries total."
```

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Dashboard UI |
| GET | `/api/state` | Current state + last 200 results |
| GET | `/api/results?page=1&limit=100` | Paginated results |
| GET | `/api/events` | SSE stream (real-time updates) |
| POST | `/api/start` | Start fresh audit |
| POST | `/api/resume` | Resume from existing results |
| POST | `/api/stop` | Stop audit |
| POST | `/api/economy` | Toggle economy mode |
| POST | `/api/retest-skips` | Retest unreachable failures |
| POST | `/api/retest-fails` | Retest all failures (or specific addresses) |
| POST | `/api/auto-retest` | Smart retest (skip permanent failures) |
| POST | `/api/test-plan` | Test nodes via subscription plan |
| GET | `/api/plans` | List subscription plans |
| POST | `/api/clear` | Clear all results |
| GET | `/api/failure-analysis` | Categorize failures |
| GET | `/api/runs` | List saved test runs |
| POST | `/api/runs/save` | Save current results as named run |
| GET | `/api/runs/:num` | Get specific run results |
| POST | `/api/runs/load/:num` | Load run as active results |
| POST | `/api/sdk` | Switch between JS/C# SDK |
| GET | `/api/sdk` | Get active SDK |
| GET | `/api/dictator` | Country-level censorship analysis |
| GET | `/health` | Health check |

### SSE Event Types

```
init    — Full state + last 200 results (on connect)
state   — State object update
result  — Single test result (+ updated state)
log     — Log message string
```

---

## Exact Protobuf Encoding (v3 Messages)

The SDK uses CosmJS for TX signing but needs custom protobuf encoding for v3 message types that CosmJS doesn't know about. Register a custom encoder in the CosmJS Registry:

```javascript
// Custom message type adapter for CosmJS Registry
const makeMsgType = (encodeFn) => ({
  fromPartial: (value) => value,
  encode: (instance) => ({ finish: () => encodeFn(instance) }),
  decode: () => ({}),
});

const registry = new Registry([
  ...defaultRegistryTypes,
  ['/sentinel.node.v3.MsgStartSessionRequest', makeMsgType(encodeMsgStartSession)],
  ['/sentinel.subscription.v3.MsgStartSubscriptionRequest', makeMsgType(encodeMsgStartSubscription)],
  ['/sentinel.subscription.v3.MsgStartSessionRequest', makeMsgType(encodeMsgSubStartSession)],
]);
```

### MsgStartSessionRequest Fields

```
Field 1: from         (string) — wallet address
Field 2: node_address (string) — sentnode1... address
Field 3: gigabytes    (int64)  — GB to purchase
Field 4: hours        (int64)  — 0 for GB-based
Field 5: max_price    (Price)  — embedded message
```

### Price Encoding

```
Field 1: denom       (string) — "udvpn"
Field 2: base_value  (string) — sdk.Dec format, multiply by 10^18
Field 3: quote_value (string) — integer string
```

**sdk.Dec scaling (CRITICAL):**
```javascript
// "0.003000000000000000" → "3000000000000000"
// "40152030" → "40152030000000000000000000"
function decToScaledInt(decStr) {
  const dotIdx = decStr.indexOf('.');
  if (dotIdx === -1) return decStr + '0'.repeat(18);
  const intPart = decStr.slice(0, dotIdx);
  const fracPart = (decStr.slice(dotIdx + 1) + '0'.repeat(18)).slice(0, 18);
  return ((intPart || '') + fracPart).replace(/^0+/, '') || '0';
}
```

### Handshake Signature (for POST to node)

```
1. Build data: JSON.stringify(peer_request) → bytes
   WireGuard: { public_key: "<base64 WG pubkey>" }
   V2Ray:     { uuid: [<integer byte array>] }

2. Build message: BigEndian uint64 session_id (8 bytes) ++ data bytes

3. Sign: SHA256(message) → secp256k1 compact signature
   EXACTLY 64 bytes (r + s, NO recovery byte)
   Go's VerifySignature checks len == 64 explicitly

4. Encode public key: "secp256k1:" + base64(compressed_33_byte_pubkey)

5. POST body:
   {
     data: base64(data_bytes),
     id: Number(session_id),  // MUST be safe integer
     pub_key: "secp256k1:<base64>",
     signature: base64(64_byte_signature)
   }
```

---

## Non-Obvious Timing Requirements

| When | Wait | Why |
|------|------|-----|
| After batch payment TX | 2s + poll up to 20s | Chain needs time to index sessions |
| After individual payment | 5s + poll 20s | Node needs time to index session in its DB |
| After V2Ray handshake | 10s | Node needs time to register UUID in V2Ray API |
| After WG tunnel install | 1.5s | Peer registration + tunnel establishment |
| After killing v2ray.exe | 1.5s | Port release (Windows TIME_WAIT) |
| Between V2Ray outbound attempts | 2s | Process cleanup + port release |
| Between nodes | 5s (configurable NODE_DELAY_MS) | Prevent chain congestion |
| After v2ray SOCKS5 port ready | 2s | Internal pipeline initialization |
| 409 "already exists" first retry | 15s | Node chain indexing race |
| 409 "already exists" second retry | 20s | Longer wait for slow nodes |
| Node RPC timeout retry | 20s | RPC congestion recovery |
| Code 105 inactive retry | 15s | LCD staleness recovery |

---

## Failure Categories and Handling

| Category | Retestable | Permanent | Action |
|----------|-----------|-----------|--------|
| 409 session exists | Yes | No | Wait 15-20s, retry (indexing race) |
| Code 105 inactive | Yes | No | Wait 15s, retry (LCD stale) |
| TCP port dead | No | Maybe | V2Ray proxy down on node |
| Address mismatch | No | Yes | Node config wrong |
| ABCI query failed | Yes | No | RPC congestion, retry after 20s |
| Handshake timeout | Yes | No | Node overloaded |
| SOCKS5 no internet | Yes | No | Tunnel routing dead (intermittent) |
| Database corrupt | No | Yes | Node DB broken, can't self-heal |
| Insufficient funds | No | Yes | Need more P2P |
| Clock drift > 120s | VMess: No | Yes | Use VLess if available |
| domainsocket only | No | Yes | Can't work remotely |

---

## What the SDK Should Provide for One-Shot Buildability

### New SDK Features Needed

1. **`batchStartSessions(client, account, nodes, gigabytes, denom)`**
   - Builds N MsgStartSessionRequest messages, submits single TX
   - Extracts all session IDs from TX events (handles base64 key encoding)
   - Returns Map<nodeAddr, sessionId>
   - Handles fee calculation: 200000 * N udvpn, 800000 * N gas

2. **`SessionManager` class**
   - `buildSessionMap(walletAddress)` — paginated fetch, O(1) lookup map
   - `findExistingSession(nodeAddr)` — returns sessionId or null
   - `saveCredential(nodeAddr, data)` / `getCredential(nodeAddr)` — disk persistence
   - `markPoisoned(nodeAddr, sessionId)` / `isPoisoned()` — session poisoning
   - `markPaid(nodeAddr)` / `isPaid()` — duplicate payment guard

3. **`buildAllV2RayOutbounds(serverHost, metadata, uuid, socksPort)`**
   - Generates ALL outbounds from ALL metadata entries
   - Sorts by transport reliability
   - Handles gun vs grpc, TLS serverName, QUIC settings
   - Returns complete V2Ray config with proper routing

4. **`SpeedTest` class**
   - `measureDirect()` — for WireGuard (multi-request, adaptive, fallback chain)
   - `measureViaSocks5(port)` — for V2Ray (same methodology through SOCKS5)
   - `checkGoogleDirect()` / `checkGoogleViaSocks5(port)` — accessibility check
   - Pre-resolves DNS, caches IPs, handles tunnel DNS failures

5. **`TunnelManager` class (platform-specific)**
   - `installWireGuard(config)` — with watchdog, split tunneling, emergency cleanup
   - `uninstallWireGuard()` — with service cleanup
   - `spawnV2Ray(config, outbound, socksPort)` — process management
   - `cleanupV2Ray(proc)` — kill by PID, not by image name
   - `emergencyCleanupSync()` — safe for process exit handlers

6. **`AuditPipeline` class**
   - `runFullAudit(options)` — the entire 3-phase flow
   - `runRetest(addresses)` — retest specific nodes
   - `runPlanTest(planId)` — test via subscription plan
   - Events: 'log', 'result', 'state', 'progress'
   - Zero-skip retry with failure classification

7. **Clock drift detection in `queryNodeStatus()`**
   - Measure HTTP Date header vs local time
   - Return `clockDriftSec` in status result
   - Helper: `isVMessViable(clockDriftSec)` → boolean

### SDK Documentation Needed

1. **`AI-BUILD-INSTRUCTIONS-TESTER.md`** — this document, formatted for AI consumption
2. **`examples/node-tester/`** — minimal working example with all flows
3. **V2Ray transport reference** — exact config for each transport type
4. **Protobuf encoding reference** — exact field numbers and types for v3 messages
5. **Session management guide** — reuse, caching, poisoning, batch payment
6. **Platform gotchas** — Windows-specific WireGuard, V2Ray, process management

---

## Dashboard UI Specification

The dashboard is a single-page app (`index.html`) with SSE-driven real-time updates.

### Layout

```
Header: Brand + pulse dot + wallet/balance/baseline/cost
Controls: Start / Resume / Stop / Economy / SDK toggle / Plan test
Progress: Bar + percentage + ETA + current node
Stats: Total / Tested / Pass 10 Mbps / Pass Baseline / Failed / Dead Plan Nodes
History: Baseline speed pills + Node speed pills
Log: Scrolling log panel (max 400px, 500 entries)
Results: Table with columns: Proto | Transport | Address | Location | Peers | Speed | Total BW | Max Users | Baseline | SLA
```

### Theme

```css
--bg-base: #080808
--glass-bg: rgba(16, 16, 16, 0.85)
--glass-border: rgba(255, 255, 255, 0.07)
--accent-green: #00c853  (pass, start)
--accent-red: #ff1744    (fail, stop)
Fonts: Inter (body), Outfit (headings/stats)
```

### SSE Connection

```javascript
const evtSource = new EventSource('/api/events');
evtSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  switch (data.type) {
    case 'init': // full state + results
    case 'state': // state update
    case 'result': // single result + state
    case 'log': // log message
  }
};
```

---

## Process Safety Rules

```
NEVER: taskkill /F /IM node.exe         (kills  / the tester itself)
NEVER: Set-ExecutionPolicy Unrestricted (security risk)
NEVER: Modify Windows UAC settings       (use VBS launcher instead)
ALWAYS: Kill V2Ray by PID (taskkill /F /PID <pid>)
ALWAYS: Kill WG by service name (wireguard.exe /uninstalltunnelservice wgsent0)
ALWAYS: Emergency cleanup on ALL exit paths
```

---

## Launch Sequence

The correct way to launch is via `SentinelAudit.vbs`:
```
cscript //nologo SentinelAudit.vbs
```

This VBS script:
1. Launches `cmd.exe` with `runas` verb (triggers single UAC prompt)
2. Changes to project directory
3. Runs `node server.js` as Administrator
4. Waits 4 seconds, opens browser to `http://localhost:3001`

Do NOT use `start.bat` (kills existing processes on port 3001 indiscriminately) or `node server.js` directly (no admin elevation = WireGuard fails silently).

---

## Summary: What the SDK Needs to Enable One-Shot Node Tester Builds

| Priority | Feature | Current State | What's Needed |
|----------|---------|--------------|---------------|
| P0 | Batch payment | Reimplemented locally | SDK function |
| P0 | Session management | Reimplemented locally (~200 lines) | SDK class |
| P0 | V2Ray all-outbound config | Reimplemented locally (~150 lines) | SDK function |
| P0 | Protobuf encoding (v3) | Reimplemented locally (~100 lines) | SDK should register types |
| P1 | Speed test | Reimplemented locally (~600 lines) | SDK class |
| P1 | Tunnel management | Reimplemented locally (~200 lines) | SDK platform module |
| P1 | Clock drift detection | Reimplemented locally in nodeStatusV3 | SDK should include |
| P2 | Failure classification | Reimplemented locally (~50 lines) | SDK utility |
| P2 | VPN interference detection | Windows-specific (~120 lines) | SDK platform module |
| P2 | Audit pipeline orchestration | ~400 lines of glue code | SDK class or documented pattern |

**Total locally reimplemented code that should be in the SDK:** ~1,820 lines across 12 files.

The node tester is effectively a second, parallel implementation of most SDK functionality, with battle-tested adaptations for bulk operations. Merging these back into the SDK would make one-shot builds possible.
