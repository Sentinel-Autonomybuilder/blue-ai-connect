# Sentinel dVPN Node Tester — Handoff Document
Generated: 2026-03-04 (updated 2026-03-08)

---

## What This Project Does
**Founder-level network audit tool for Sentinel dVPN.** The user is the founder of Sentinel — this is their primary instrument for three things:

1. **Node QA:** Tests every active node on the blockchain for real VPN throughput (WireGuard + V2Ray)
2. **SDK validation:** Built on the Sentinel JS SDK — every audit run is a live integration test of SDK functionality against real chain data
3. **Protocol verification:** Exercises the full v3 pipeline end-to-end (LCD discovery → session creation → handshake → tunnel → bandwidth)

Runs as an Express server on port 3001 with a dashboard UI + SSE real-time stream.

---

## Current Status — EVERYTHING WORKING

| Component | Status |
|-----------|--------|
| WireGuard | ✅ VERIFIED — IP changed confirmed via probe.js |
| V2Ray | ✅ VERIFIED — IP changed confirmed via test-v2ray.js |
| Parallel scan (30 workers) | ✅ Working in both server.js and test-v2ray.js |
| Batch payment (5 nodes/tx) | ✅ Working in server.js |
| SOCKS5 speedtest | ✅ Fixed — uses axios (native fetch silently ignores SOCKS5 agents) |
| Dashboard SSE | ✅ Working |
| Log scrolling | ✅ Fixed — max-height: 400px on .logs |

### Last confirmed test results (2026-03-08)
- **443 nodes tested** — scan ongoing for ~575 remaining (~921 total on chain)
- **Clock drift detection** added — VMess AEAD nodes with >±120s drift auto-skipped
- V2Ray binary: 5.2.1 (`bin/v2ray.exe`), 5.44.1 saved as `bin/v2ray-5.44.1.exe`

---

## Directory Structure
```
sentinel-node-tester/
├── server.js              — Express API + Sentinel v3 pipeline + SSE dashboard
├── probe.js               — CLI single-node test (WireGuard + V2Ray, good for debugging)
├── test-v2ray.js          — Standalone V2Ray test (find node → pay → handshake → test IP)
├── lib/
│   ├── v3protocol.js      — ALL v3 protocol logic (handshake, config building, protobuf)
│   ├── wireguard-win.js   — Windows WireGuard adapter
│   └── speedtest.js       — Cloudflare speedtest (direct + SOCKS5)
├── bin/
│   └── v2ray.exe          — V2Ray 5.2.1 binary (V2Fly build, go1.19.4 windows/amd64)
├── results/
│   └── results.json       — Persistent test results (7 results so far)
├── .env                   — Wallet mnemonic + RPC config
├── start.bat              — Launch server as Admin (WireGuard requires elevation)
└── HANDOFF.md             — This file
```

---

## Environment (.env)
```
MNEMONIC=<REDACTED — never commit real mnemonics>
RPC=https://rpc.sentinel.co:443
DENOM=udvpn
GAS_PRICE=0.2udvpn
GIGABYTES_PER_NODE=1
TEST_MB=10
MAX_NODES=0
NODE_DELAY_MS=1000
```

---

## Wallet
- **Address:** `<REDACTED — use your own wallet>`
- **Balance:** ~47,690 DVPN (as of end of session — spent ~2,100 DVPN in testing across sessions)
- **Node price:** Typical nodes charge ~40 DVPN/GB (40,152,030 udvpn/GB)
- **Gas per tx:** 200,000 udvpn (0.2 DVPN) flat fee per tx

---

## Running
```bash
# Dashboard server (MUST run as Administrator for WireGuard):
start.bat
# Then open: http://localhost:3001

# Standalone V2Ray test (no admin needed):
node test-v2ray.js

# Single-node connection probe (WireGuard + V2Ray):
node probe.js
```

---

## What Still Needs Work

### 1. Balance & Estimated Cost display (REPORTED BUG — not yet fixed)
The user reported "balance and estimated cost is wrong" at end of session.
- `estimatedTotalCost` in server.js = sum of ALL viable node prices → can be 10,000+ DVPN
  (e.g. 500 nodes × 40 DVPN = 20,000 DVPN shown as "Est. Cost" which looks insane)
- `state.balance` shows correctly after the fix (gas fees now included in spentUdvpn, broadcasts on payment)
- Fix needed: Change "Est. Cost" to show actual spent this session, or cost per node,
  or cap/format the estimated total differently.

### 2. V2Ray speedtest — FIXED (was 0% success rate, 411/411 failing)
**Root cause:** Two bugs combined:
1. The preflight (1KB download) consumed V2Ray's SOCKS5 connection via a separate SocksProxyAgent.
   When the speedtest then created a SECOND agent, the V2Ray tunnel couldn't handle the new TLS connection,
   causing "Client network socket disconnected before secure TLS connection was established" for ALL nodes.
2. The speedtest used `responseType: 'stream'` which interacts differently with SocksProxyAgent than
   `arraybuffer` mode (which the working preflight and test-v2ray.js used).

**Fix (2026-03-05):**
- Removed the separate preflight entirely — the speedtest probe (2MB) acts as the connectivity test
- Switched speedtestViaSocks5 to `arraybuffer` mode (matching what works in test-v2ray.js)
- Fresh SocksProxyAgent per request with `agent.destroy()` after each — no connection reuse
- Increased port release delays (500ms → 1500ms for taskkill, 500ms → 1000ms after proc.kill)
- V2Ray stderr now always logged on failure (was only logged on preflight failure before)

### 3. WireGuard DNS failures — FIXED (was 56/338 failing with ENOTFOUND)
**Root cause:** `speedtestDirect` tried hostname-based URLs first, then fell back to IP on DNS failure.
But the fallback wasn't reliably triggering for some WireGuard tunnels that broke DNS.

**Fix (2026-03-05):**
- Reversed the fallback order: now tries IP-based URL FIRST when `cachedCfIp` is available
- Falls back to hostname only if IP connection fails
- This avoids DNS resolution entirely when behind WireGuard tunnels

### 4. probe.js — V2Ray path fixed but untested end-to-end
probe.js V2Ray section was using raw handshake metadata as the V2Ray config (bug).
Fixed this session to call `buildV2RayClientConfig`. But probe.js always hits WireGuard
first (WG nodes appear first in LCD list), so the V2Ray path hasn't been exercised by probe.js.

---

## V2Ray — Critical Protocol Details (HARD-WON, DO NOT CHANGE)

### Proxy Protocol Mapping (sentinel-go-sdk/types/proxy.go, iota from 1)
```
ProxyProtocolVLess = 1
ProxyProtocolVMess = 2
```
```js
// CORRECT:
const protocol = proxyProto === 1 ? 'vless' : 'vmess';
// The OLD wrong code had these swapped — don't revert
```

### Transport Protocol Mapping (sentinel-go-sdk/types/transport.go)
```
1 = domainsocket
2 = gun
3 = grpc
4 = http
5 = mkcp
6 = quic
7 = tcp      ← was wrongly filtered out before fix
8 = websocket
```
```js
const networkMap = { 1:'domainsocket', 2:'gun', 3:'grpc', 4:'http', 5:'mkcp', 6:'quic', 7:'tcp', 8:'ws' };
```

### Transport Security
```
0 = Unspecified (treat as none)
1 = None (plaintext)
2 = TLS
```

### Transport Preference Order (in buildV2RayClientConfig)
```js
let entry = supported.find(e => e.transport_protocol === 8 && e.transport_security === 2)  // WS+TLS
  || supported.find(e => e.transport_protocol === 8 && e.transport_security <= 1)          // WS+plain
  || supported.find(e => e.transport_security === 2)                                        // any TLS
  || supported.find(e => e.transport_security <= 1)                                         // any plain
  || supported[0];
```

### VLESS Flow — MUST be empty string
```js
flow: ''   // ALWAYS empty — xtls-rprx-vision is Xray-only, V2Ray 5.x rejects it
```

### UUID — Go [16]byte = integer array
Go `uuid.UUID` is `[16]byte`. Go JSON encodes fixed byte arrays as integer arrays, NOT base64.
```js
const hex = uuid.replace(/-/g, '');
const uuidBytes = Array.from(Buffer.from(hex, 'hex'));  // [168, 203, 45, ...]
// Body field name: "uuid" (NOT "uid")
// Send as: { uuid: uuidBytes }
```

### SOCKS5 Speedtest — MUST use axios
Node.js native `fetch` (undici) silently ignores the `agent` option for SOCKS5.
`speedtestViaSocks5` in lib/speedtest.js uses axios with `httpAgent` + `httpsAgent` set. Do NOT switch to fetch.

### VMess AEAD Clock Drift — Auto-Detection (added 2026-03-08)
VMess AEAD auth requires client and server clocks within ±120 seconds. If drift exceeds this,
the server silently reads random bytes for ~16s then closes ("drain" pattern).

**Symptoms:** Tunneling request sent → 10-16s silence → "context canceled"

**Detection:** `nodeStatusV3()` in `lib/v3protocol.js` measures the node's HTTP Date header
vs local time (`status.clockDriftSec`). `server.js` lines 1062-1074 skip V2Ray nodes with >±120s drift.

**Confirmed failing nodes (clock drift):**
- `dike.busur.cc` — +215s ahead
- `38.247.3.160` — -887s behind

### V2Ray Binary Versions
- `bin/v2ray.exe` — V2Ray 5.2.1 (23.9MB, V2Fly build, go1.19.4) — **primary, used for all scans**
- `bin/v2ray-5.44.1.exe` — V2Ray 5.44.1 (36.3MB) — backup, works but warns about missing observatory
- `bin/v2ray-5.2.1.bak.exe` — backup of 5.2.1
- Both 5.2.1 and 5.44.1 work correctly. 5.44.1's leastping balancer warns "cannot find observatory"
  but falls back to default route. Stick with 5.2.1 for consistency.

### After Handshake — Wait 5s for UUID Registration
After `initHandshakeV3V2Ray()` succeeds, wait 5 seconds before starting v2ray.
The node's V2Ray API needs time to register the UUID or connections will fail.
```js
await sleep(5_000);  // after handshake, before spawning v2ray process
```

---

## Blockchain / Chain Details

### Chain Info
- **Chain:** Sentinel Hub (Cosmos SDK)
- **RPC:** `https://rpc.sentinel.co:443`
- **LCD endpoints (in order of reliability):**
  1. `https://sentinel-api.polkachu.com`
  2. `https://api.sentinel.quokkastake.io`
  3. `https://sentinel-rest.publicnode.com`
- **Denom:** `udvpn` (1 DVPN = 1,000,000 udvpn)
- **Protocol:** v3 (single MsgStartSession tx — no separate subscribe)

### Message Type
```
/sentinel.node.v3.MsgStartSessionRequest
```
Fields: `from`, `node_address`, `gigabytes`, `hours`, `max_price`

### CosmJS Registry Pattern (required — do NOT simplify)
```js
const MsgStartSessionV3 = {
  fromPartial: (value) => value,
  encode: (instance) => ({ finish: () => encodeMsgStartSession(instance) }),
  decode: () => ({}),
};
new Registry([...defaultRegistryTypes, [V3_MSG_TYPE, MsgStartSessionV3]])
```

### max_price.base_value — sdk.Dec format (multiply by 10^18)
```js
function decToScaledInt(decStr) {
  const dotIdx = decStr.indexOf('.');
  if (dotIdx === -1) return decStr + '0'.repeat(18);
  const int = decStr.slice(0, dotIdx);
  const frac = (decStr.slice(dotIdx + 1) + '0'.repeat(18)).slice(0, 18);
  return ((int || '') + frac).replace(/^0+/, '') || '0';
}
```

### Signature (for node handshake POST)
```js
// Message = BigEndian uint64 session ID (8 bytes) ++ data bytes
const idBuf = Buffer.alloc(8);
idBuf.writeBigUInt64BE(BigInt(sessionId));
const msg = Buffer.concat([idBuf, dataBytes]);
const hash = sha256(msg);
const sig = await Secp256k1.createSignature(hash, cosmosPrivKey);
const sigBytes = Buffer.from(sig.toFixedLength()).slice(0, 64);  // EXACTLY 64 bytes
```

### Public Key Encoding
```js
const compressedPubKey = nobleSecp.getPublicKey(cosmosPrivKey, true);  // COMPRESSED 33 bytes
const pubKeyEncoded = 'secp256k1:' + Buffer.from(compressedPubKey).toString('base64');
// Field: pub_key
```

### Session Reuse (avoid double-paying)
```
GET /sentinel/session/v3/sessions?address=<addr>&status=1&pagination.limit=100
```
Reuse if session exists for node AND (gigabytes=0 OR consumed < allocated).

---

## server.js Architecture

### Optimised Pipeline (3 phases)
1. **Phase 1:** `getAllNodes()` — full paginated LCD fetch of all ~950 nodes
2. **Phase 2:** `scanNodesParallel(nodes, 30)` — 30 concurrent workers, ~36s for 950 nodes
3. **Phase 3:** Batched payment (5 nodes/tx) + sequential test with payment pipeline

### Key Helper Functions (added this session)
- `scanNodesParallel(nodes, concurrency=30)` — worker pool, returns `{node, status}[]`
- `extractAllSessionIds(txResult)` — extracts all session IDs from multi-message batch tx
- `submitBatchPayment(client, account, denom, gigabytes, batch)` — 5-node batch tx, returns `Map<nodeAddr, BigInt>`
- `waitForBatchSessions(nodeAddrs, walletAddr, maxWaitMs)` — polls LCD for all sessions at once
- `waitForSessionActive(nodeAddr, walletAddr, maxWaitMs)` — wraps above for single node

### Balance Tracking
- `state.balanceUdvpn` — fetched from chain once at run start
- `state.spentUdvpn` — accumulated: node price × gigabytes + 200,000 gas per tx
- `state.balance` — computed as `(balanceUdvpn - spentUdvpn) / 1_000_000 + ' DVPN (est. remaining)'`
- Frontend strips `(est. remaining)` via `.replace(/\(.*\)/g, '').trim()`
- Both `submitBatchPayment` and individual `testNode` payment broadcast state after updating

---

## Dashboard UI (index.html)

### Theme
- Background: `#080808`, text: `#f0f0f0`
- Only 2 accent colors: `--accent-green: #00c853` (Start, PASS), `--accent-red: #ff1744` (Stop, FAIL)
- Font: Inter + Outfit from Google Fonts
- Glass panels: `rgba(16,16,16,0.85)` with `rgba(255,255,255,0.07)` border

### Header Stats
- Wallet address (truncated)
- Balance (live, strips "(est. remaining)")
- Avg Baseline (average of `state.baselineHistory`)
- Est. Cost (from `state.estimatedTotalCost` — currently shows total of all viable nodes, BUG)

### Log Panel
- `.logs { max-height: 400px; overflow-y: auto; }` — scrolls internally, does not push page
- Auto-scrolls to bottom on each new entry

---

## Known Broken Nodes
Skip list in `test-v2ray.js` BROKEN_NODES Set:
- `sentnode1qqktst6793vdxknvvkewfcmtv9edh7vvdvavrj` — nil UUID state bug on node
- `sentnode1qx2p7kyep6m44ae47yh9zf3cfxrzrv5zt9vdnj` (us04.quinz.top) — handshake OK but proxy always fails

---

## Quick Debug Checklist

### V2Ray not connecting
1. Set `loglevel: 'debug'` in `buildV2RayClientConfig`
2. Check v2ray stderr for "proxy/vless" or "proxy/vmess" errors
3. "json: cannot unmarshal string" → UUID sent as string not int array
4. "failed: VLESS"/"failed: VMess" → check proxy_protocol mapping
5. "gun tunnel > EOF" → gRPC transport issue; TCP or WS entries preferred
6. "xtls" errors → set flow: '' (not 'xtls-rprx-vision')
7. IP not changing → wait 5s after handshake; node needs time to register UUID
8. "tunneling request → 15s silence → context canceled" → **clock drift** (VMess AEAD drain)
9. V2Ray "context canceled" after a SUCCESSFUL request is NORMAL cleanup, NOT an error

### curl on Windows (lesson learned 2026-03-08)
Node.js `execSync()` uses cmd.exe, where `/dev/null` doesn't exist. Curl exits with code 23
(write error) and `execSync` throws — even though the HTTP request succeeded. Use `NUL`
instead of `/dev/null`, or check `error.stdout` in the catch block. Git Bash emulates
`/dev/null` so bash-only tests work fine. **This does NOT affect server.js** (uses axios).

### WireGuard not connecting
1. Must run as Administrator (start.bat handles this)
2. `wireguard.exe` at `C:\Program Files\WireGuard\wireguard.exe`
3. Command: `/installtunnelservice` (NOT `/installtunnel`)
4. Tunnel name: `wgsent0` — uninstall with `/uninstalltunnelservice wgsent0`

### Session ID not found in tx
- Check `txResult.events` for type containing "session"
- Keys may be base64-encoded — decode with `Buffer.from(key, 'base64').toString('utf8')`
- Look for `session_id` or `id` attribute key

---

## Dependencies
```json
{
  "@cosmjs/proto-signing": "^0.32.2",
  "@cosmjs/stargate": "^0.32.2",
  "@cosmjs/crypto": "(included via stargate)",
  "@cosmjs/amino": "(included via stargate)",
  "@noble/curves": "^2.0.1",
  "axios": "^1.6.8",
  "dotenv": "^16.4.5",
  "express": "^4.18.2",
  "socks-proxy-agent": "^8.0.4"
}
```

Runtime: Node.js v24.14.0, npm 11.9.0, Windows 11
