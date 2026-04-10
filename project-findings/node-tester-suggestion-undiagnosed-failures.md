# Undiagnosed Node Tester Failures — 22 Nodes With Active Peers

**Status:** UNDIAGNOSED — all 22 nodes have active peers (3-48), proving they work for other clients
**Date:** 2026-03-09
**Severity:** HIGH — 2.8% failure rate is entirely our code, not node-side

## Evidence

Every failed node has real users connected. The failures are in our tester, not the nodes.

---

## Category 1: TCP Port Unreachable — 10 nodes

Our TCP pre-check says port is closed, but 3-7 other clients are connected right now.

| Node | Port | Host | Peers |
|------|------|------|-------|
| sentnode1p2uw8hnhzt7… | 23458 | jp.pytonode.my.id | 4 |
| sentnode1zwfqm6zg3nq… | 32183 | suwatt.thddns.net | 3 |
| sentnode19vgpan39wcc… | 8787 | 193.32.163.45 | 5 |
| sentnode1x80sq9rdd9l… | 8787 | 23.95.216.102 | 7 |
| sentnode1se6tex498tf… | 3876 | 77.83.38.237 | 4 |
| sentnode13vxn7mmuxrp… | 8686 | 192.3.229.202 | 4 |
| sentnode1j6tf0scgj5t… | 8686 | 107.173.203.222 | 6 |
| sentnode1kkcf6nv2hs8… | 62059 | 24.32.20.254 | 5 |
| sentnode1kn0j6jpt3cx… | 8686 | 107.173.156.153 | 6 |
| sentnode1crl6mztna2z… | 8686 | 157.254.221.23 | 5 |

**Possible causes (our side):**
- TCP probe timeout too short — node is far away or slow to accept
- Our probe uses raw TCP connect but node may expect TLS handshake first
- DNS resolution difference — we resolve hostname differently than node's peers
- Firewall/ISP blocking from our specific IP/region but not from peers' locations
- Node has rate limiting that rejects our rapid-fire probe approach

---

## Category 2: SOCKS5 No Connectivity — 5 nodes

V2Ray handshake succeeds, process starts, SOCKS5 binds, but no internet flows through tunnel. All 5 have active peers.

| Node | Peers | Transport | Clock Drift | Host |
|------|-------|-----------|-------------|------|
| sentnode1yqyza6uatdt… | 4 | grpc/none + quic/tls | -1s | myra.busur.cc |
| sentnode1x3vm6kunezs… | 4 | grpc/none + quic/tls | -1s | 107.172.92.53 |
| sentnode1xdzszkj3nxj… | 15 | grpc/none + quic/tls | 0s | sg2v2.pytonode.my.id |
| sentnode16zy8qfgt9aa… | 4 | grpc/none + quic/tls | 0s | 107.172.208.210 |
| sentnode1e6q42499unn… | 3 | unknown | -136s | harmonia.busur.cc |

**V2Ray logs show:**
- Connection accepted, outbound created, tunneling request sent
- Then: `context canceled` after 15-18s on every target
- Both transports tried (grpc + quic) — both fail identically

**Possible causes (our side):**
- V2Ray 5.2.1 may have grpc/quic bugs that newer versions fix — peers may use different client versions
- Our SOCKS5 connectivity check targets (google, cloudflare, 1.1.1.1, httpbin) may be blocked by the node's egress policy while other traffic works
- VMess AEAD auth may silently fail (connection appears established but no data flows) — especially the -136s drift node
- Our V2Ray config generation may differ subtly from the official Go SDK client template for these specific transport combos
- The "balancer" section in the generated config routes to wrong outbound for these nodes

---

## Category 3: Clock Drift VMess Skips — 4 nodes

| Node | Peers | Drift |
|------|-------|-------|
| sentnode1vfdgskvj7f0… | 6 | 218s |
| sentnode1d9k7vf7asmt… | 6 | 889s |
| sentnode1ke7kw2kq9pf… | 4 | 272s |
| sentnode1hr5vew7pzu4… | 6 | 183s |

**Why peers work but we skip:**
- Our clock drift measurement may be inaccurate — we compare node's timestamp to ours, but NTP sync issues on our side could inflate the measured drift
- Peers may use VLess (not affected by clock drift) even though we think these are VMess-only
- The node may have both VMess + VLess transports but we fail to detect VLess availability
- Peers may have locally adjusted clocks or use a different VMess auth mechanism

---

## Category 4: V2 Format Metadata — 1 node

| Node | Peers |
|------|-------|
| sentnode1wkgx6exmxfr… | **48** |

48 active peers — this node is heavily used. We reject it because metadata has `ca`/`protocol` fields instead of `proxy_protocol`/`transport_protocol`. But 48 users are connected.

**Possible causes (our side):**
- This may be a dual-format node that serves both v2 and v3 metadata depending on request format
- The 48 peers may be using v2 protocol clients — we should support v2 fallback, not reject
- Our v3 handshake may be triggering v2 response from a node that supports both

---

## Category 5: Handshake Failures — 2 nodes

| Node | Peers | Error |
|------|-------|-------|
| sentnode1rawguk6ujhn… | 3 | ECONNRESET — TLS disconnect during handshake |
| sentnode1e5rjmmkaza7… | 4 | ECONNABORTED — 30s timeout |

**Possible causes (our side):**
- Our TLS client hello may be rejected by certain node configurations (cipher suite mismatch)
- 30s handshake timeout may be too short for distant/slow nodes
- `rejectUnauthorized: false` agent may behave differently than what node expects
- Peers may connect via different network path with lower latency

---

## Summary

All 22 failures are bugs in our tester code, not node problems. Total peers across failed nodes: **~130 active users** connected and working fine.
