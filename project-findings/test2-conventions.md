# Test2 — The Proving Ground

> *"An SDK is only as good as the app that breaks it."*

---

## Why Test2 Exists

The Sentinel SDK makes a bold promise: one function call connects you to a decentralized VPN. But promises written in code are only worth the tests that verify them. The SDK has 540+ unit tests — they prove the pieces work in isolation. Test2 proves they work together, under real conditions, with a real user staring at a real screen.

Test2 is the SDK's first consumer. Its first critic. Its most demanding user. Every SDK function that ships to builders gets exercised here first — not in a test harness, but in a living application with wallet state, node caches, SSE streams, and a user who expects things to just work.

When something breaks in Test2, it breaks visibly. That's the point.

---

## The Purpose

Test2 is the **integration proving ground** for the Sentinel JavaScript SDK. It serves three roles:

### 1. SDK Consumer Zero
Every SDK export gets called from Test2 before any external builder touches it. If the DX is awkward, Test2 feels it first. If an error message is cryptic, Test2 suffers it first. If a function signature changes, Test2 breaks first.

**What this means in practice:**
- `connect()`, `connectAuto()`, `connectViaPlan()`, `connectViaSubscription()` — all exercised through real UI flows
- `listNodes()` → parsed, cached, displayed, filtered, favorited
- `createWallet()`, `generateWallet()` → full lifecycle from import to balance check to disconnect
- `speedtestViaSocks5()` → real bandwidth measurement through real tunnels
- `events` EventEmitter → piped to SSE, displayed live in the browser
- `lcd`, `LCD_ENDPOINTS` → used for balance queries with real failover

### 2. Edge Case Discovery Lab
Unit tests cover expected paths. Test2 discovers the unexpected ones:
- What happens when a node goes offline mid-handshake?
- What if the wallet has zero balance and tries to subscribe?
- What if the LCD endpoint times out during a connection sequence?
- What if the user clicks connect, then disconnect, then connect again in 3 seconds?
- What if the node cache is stale and the chain has 50 new nodes?

Every bug found here becomes a fix in the SDK that benefits every builder downstream. The 22 production bugs documented in the SDK manifesto? Many were found right here.

### 3. Builder Experience Mirror
Test2 is built *exactly* like an external builder would build a Sentinel app: one `import` from the SDK, Express server, single-page HTML frontend. No internal APIs. No backdoors. No special privileges. If a builder can't do it, Test2 can't do it.

This constraint is sacred. Test2 must never use SDK internals. The moment it needs a workaround, that's a signal the SDK is missing a feature — and the fix goes into the SDK, not into Test2.

---

## Architecture

```
TEST2/
  server.js       Express backend — SDK consumer, API layer, SSE hub
  index.html       Single-file frontend — dark mode VPN client UI
  package.json     ESM, port 3006
  start.bat        Windows launcher
  favorites.json   User's bookmarked nodes (generated)
  nodes-cache.json Cached node list (generated, 5min TTL)
  wallet.json      Encrypted wallet state (generated)
  bin/             V2Ray binary (external)
```

**One import. That's the contract.**
```js
import {
  connect, connectAuto, connectViaPlan, connectViaSubscription,
  listNodes, disconnect, isConnected, getStatus,
  registerCleanupHandlers, createWallet, generateWallet,
  speedtestViaSocks5, verifyDependencies, events, lcd, LCD_ENDPOINTS,
} from '../Sentinel SDK/code/index.js';
```

Everything Test2 does flows through this single SDK surface. If something can't be done through these exports, the SDK needs a new export — Test2 does not get a shortcut.

---

## Principles

### The SDK is the API. Period.
Test2 talks to the Sentinel network through the SDK and only the SDK. Direct LCD calls, raw protobuf encoding, manual handshakes — all forbidden. If it's not in `index.js`, it doesn't exist.

**Exception:** Wallet balance queries hit LCD directly because the SDK doesn't yet expose a balance function. This is a tracked gap, not an accepted pattern.

### Break things loudly.
Silent failures are the enemy. Every SDK event gets broadcast to SSE. Every error gets surfaced in the UI. Every unexpected state gets logged. Test2's job is to make problems visible, not to hide them behind retry logic.

### Stay simple. Stay buildable.
Test2 must look like something a solo developer built in a weekend using the SDK docs. No frameworks. No build tools. No TypeScript. One HTML file. One server file. If the complexity grows beyond what a builder would tolerate, it's time to push that complexity down into the SDK.

### Findings flow upstream.
Every bug, every awkward API, every missing feature discovered in Test2 gets documented in `Sentinel SDK/suggestions/`. Test2 is not a product — it's a feedback loop. Its value is measured not by its own polish, but by how much better it makes the SDK.

---

## What Test2 Is Not

- **Not a production VPN app.** It has no update mechanism, no telemetry, no crash reporting.
- **Not a demo.** It's a real, functional VPN client — but its purpose is testing, not showcasing.
- **Not a second SDK.** Business logic belongs in the SDK. Test2 is a thin consumer layer.
- **Not permanent.** If the SDK reaches a point where Test2 has nothing left to teach it, Test2 has succeeded.

---

## The Contract with the SDK

| Test2 promises | SDK promises |
|---------------|-------------|
| Use only public exports | Stable, documented public surface |
| Report every bug upstream | Fix bugs, not symptoms |
| Never work around SDK gaps | Expose missing features as new exports |
| Stay simple enough to read in one sitting | Stay simple enough to import in one line |
| Break loudly when something is wrong | Provide typed errors with actionable `.code` |

---

## Port & Config

| Key | Value |
|-----|-------|
| Port | 3006 |
| SDK path | `../Sentinel SDK/js-sdk/index.js` |
| Protocol support | WireGuard + V2Ray |
| Cache TTL | 5 minutes |
| Wallet storage | `wallet.json` (local) |

---

## SDK Boundary Rule

**Test2 agents MUST NOT edit Sentinel SDK files directly.**

When Test2 finds SDK bugs, the correct process is:
1. Document the bug in `Sentinel SDK/suggestions/` with a timestamped markdown file
2. Include: what broke, exact error, reproduction steps, which SDK file/line, suggested fix
3. Only the SDK's own agents edit SDK code — they read suggestions and apply fixes

**Why:** The SDK is shared across all projects (Test2, Node Tester, Web Proxy, DVPN, etc.). Edits from consumer-project agents create version confusion, bypass the SDK's test/review process, and risk breaking other consumers. Test2's role is to FIND bugs, not fix them in the SDK.

**What Test2 agents CAN do:**
- Edit `TEST2/server.js` and `TEST2/index.html` freely
- Add workarounds in Test2 code (with `// WORKAROUND:` comment noting the SDK bug)
- Write suggestion files to `Sentinel SDK/suggestions/`
- Read SDK code for debugging (read-only)

---

*Test2 exists so that when a builder in Nairobi or Bucharest or Jakarta opens the SDK docs and writes their first `connect()` call, it just works. Because it already worked here first.*
