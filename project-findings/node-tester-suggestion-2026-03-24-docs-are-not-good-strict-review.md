# The Node Tester Documentation Is Not Good — Strict Review

**Date:** 2026-03-24
**Reviewer:** AI that spent 10+ hours failing to integrate because of these docs
**Tone:** Brutal honesty. The docs need to hear this.

---

## Verdict: The Docs Describe Software That Doesn't Exist

The Node Tester has 7 documentation files totaling ~3,000 lines. They read like they were written by an architect who designed everything but never checked if it was built. An AI reads them, thinks "great, I'll use `NodeTester` class" — and discovers it doesn't exist. The AI then has to reverse-engineer 600 lines of `node-test.js` to figure out what actually works.

**The documentation is fiction presented as fact.**

---

## File-by-File Teardown

### 1. `docs/AI-BUILD-NODE-TEST.md` — Grade: F

**What it claims:**
```
Step 1: Create adapter wrapping your app's connect/disconnect
createNodeTestAdapter(vpnClient)
```

**Reality:** `createNodeTestAdapter` does not exist. It's not in the SDK. It's not in the Node Tester. It's not in any file on disk. An AI reads this, searches for the function, finds nothing, and is lost.

**What it claims:**
```
The SDK provides testNode() that accepts an adapter
```

**Reality:** The SDK does NOT provide `testNode()`. The Node Tester has its own `testNode()` in `audit/node-test.js` but it's a 600-line function with 15 dependencies on Node-Tester-specific state (session map, credential cache, wallet instance, V2Ray process manager, WireGuard service manager, baseline history, economy mode flag, batch payment state...). You cannot "import" it into another project.

**What it claims:**
```
Step 0: Scan your project
Step 1-6: Build adapter, service, dashboard, wire it up
```

**Reality:** These steps reference interfaces (`IVpnTestAdapter`) and classes (`NodeTestService`) that exist only in this document. There is no reference implementation. No example project. No code that compiles. An AI following these steps produces code that calls functions that don't exist.

**What this file should be:**
A file that says:
```
HERE IS THE WORKING CODE TO TEST ONE NODE:

// C# — copy this, it works:
var wallet = SentinelWallet.FromMnemonic(mnemonic);
var chain = new ChainClient();
await chain.InitializeAsync();
var vpn = new SentinelVpnClient(wallet, new SentinelVpnOptions { ForceNewSession = true, Gigabytes = 1 });
var result = await vpn.ConnectAsync(nodeAddress);
// Now run speed test:
var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
var sw = Stopwatch.StartNew();
var data = await http.GetByteArrayAsync("https://speed.cloudflare.com/__down?bytes=1048576");
sw.Stop();
var mbps = (data.Length * 8.0 / 1_000_000) / sw.Elapsed.TotalSeconds;
// Disconnect:
await vpn.DisconnectAsync();
// Result: connected=true, speed=mbps
```

That's it. That's the entire doc. Everything else is noise until this works.

---

### 2. `docs/IN-APP-NODE-TESTING.md` — Grade: F

**What it claims:**
```
SDK provides NodeTester class
App implements IVpnTestAdapter interface
```

**Reality:** `NodeTester` class does not exist in any SDK (JS, C#, Rust, Swift). `IVpnTestAdapter` does not exist. This document describes a module that was designed but never built.

**The dangerous part:** There is NO indication anywhere in the document that this is a spec, not documentation of existing code. It reads identically to how you'd document a working module. An AI cannot tell the difference.

**Specific failures this caused:**
- AI searched for `NodeTester` in C# SDK → found nothing → confused
- AI tried to implement `IVpnTestAdapter` → realized the test function that uses it doesn't exist → wasted 2 hours
- AI tried to follow the "5-phase test flow" → had to rewrite it from scratch because the phases reference functions that don't exist

**What this file should say at the TOP:**
```
⚠️ THIS IS A DESIGN SPEC, NOT DOCUMENTATION OF EXISTING CODE.
None of the classes or interfaces described below exist yet.
To test nodes TODAY, see QUICKSTART.md for working code.
```

---

### 3. `docs/FUNCTION-REFERENCE.md` — Grade: D

**What's good:** It documents every function in execution order with inputs and outputs. This is genuinely useful for understanding the Node Tester's JS code.

**What's bad:**
- Every function is JavaScript. The C# SDK has different names, different patterns, different async behavior.
- No indication of which functions are reusable vs which are Node-Tester-specific.
- No code examples — just function signatures and descriptions.
- Some functions listed don't exist in the current codebase (they're from the spec).

**Specific failure this caused:**
- AI read `nodeStatusV3()` → searched for it in C# SDK → found `NodeClient.GetStatusAsync()` (different name) → had to guess the mapping
- AI read `signAndBroadcastRetry()` → searched for it in C# SDK → found `TransactionBuilder.BroadcastAsync()` (completely different API) → wrong assumptions about retry behavior

**What this file needs:**
A mapping table:
```
| JS Function | C# Equivalent | Notes |
|-------------|--------------|-------|
| nodeStatusV3() | NodeClient.GetStatusAsync() | Returns different object shape |
| signAndBroadcastRetry() | TransactionBuilder.BroadcastAsync() | Has built-in retry |
| extractSessionId() | (handled internally by ConnectAsync) | Not exposed in C# |
```

---

### 4. `docs/CONSUMER-VS-TESTING.md` — Grade: C

**What's good:** Clear separation of consumer vs testing functions. The token cost table is excellent. The "NEVER use in consumer flow" warnings are valuable.

**What's bad:**
- Lists 160+ functions by name only. No imports, no parameters, no return types, no code examples.
- Mixes JS and C# terminology without labeling which is which.
- The result schema at the bottom has 25+ fields but no example JSON.

**Specific failure this caused:**
- AI saw `connectDirect()` in the consumer list → searched for it in C# SDK → found `SentinelVpnClient.ConnectAsync()` (different name) → confused about whether it's the same thing
- AI saw the result schema fields but couldn't tell which were optional, which had different shapes for WG vs V2Ray

**What this file needs:**
- Language labels on every function: `JS: connectDirect()` / `C#: SentinelVpnClient.ConnectAsync()`
- At least one code example per category
- Complete result JSON example (real, from a real test, copy-pasted)

---

### 5. `docs/NODE-TESTING-COMPLETE.md` — Grade: D

**What it claims:**
```
Level 1 (Protocol Testing) — WORKING
Level 2 (Application Testing) — SPEC ONLY
```

**The problem:** "SPEC ONLY" is mentioned once, in passing. The document then proceeds to describe Level 2 in the same tone, same detail, same authority as Level 1. An AI reading the file treats both levels as implemented.

**Specific failure this caused:**
- AI read Level 2 description → assumed the adapter pattern was available → tried to use it → nothing exists

**What this file needs:**
Giant, unmissable warnings:
```
═══════════════════════════════════════════
  LEVEL 2 DOES NOT EXIST YET
  Everything below this line is a DESIGN SPEC
  DO NOT try to import or use these interfaces
═══════════════════════════════════════════
```

---

### 6. `suggestions/one-shot-buildability-analysis.md` — Grade: B

**This is actually useful.** It's an honest assessment of what's missing and what needs to happen. The "7 Walls" section correctly identifies the real problems. The timing requirements table is gold.

**But it's in the wrong place.** A builder looking at `docs/` won't find it. It should be in `docs/` not `suggestions/`.

**And it's 851 lines.** Nobody reads 851 lines before building. The critical information (timing requirements, failure categories, protobuf encoding) should be in a 50-line quick reference, with the full analysis available for deep dives.

---

### 7. `CLAUDE.md` and `MANIFESTO.md` — Grade: B

**Actually good.** Clear purpose, clear rules (peers > 0 = our bug), clear architecture. The CLAUDE.md's "Testing Tools vs Consumer Apps" table is excellent.

**But missing the ONE thing that matters:**
```
## BEFORE INTEGRATING NODE TESTING INTO ANOTHER APP
1. Read docs/AI-BUILD-NODE-TEST.md ← THIS FILE IS A SPEC, NOT WORKING CODE
2. The actual working test flow is in audit/node-test.js::testNode()
3. For C# apps, use SentinelVpnClient.ConnectAsync() + HttpClient speed test
4. There is NO reusable testNode() function you can import — you must build it
```

---

## The Core Problem

**The documentation was written by someone who designed the future, not someone who documented the present.**

Every doc file assumes:
- `NodeTester` class exists (it doesn't)
- `IVpnTestAdapter` interface exists (it doesn't)
- `createNodeTestAdapter()` function exists (it doesn't)
- The adapter pattern is implemented (it isn't)
- Level 2 testing module exists (it doesn't)

The docs read like product documentation for a shipped feature. They are actually architecture specs for a feature that was never built. **There is zero indication of this distinction.**

---

## What Must Change

### Rule 1: Label Every Claim as IMPLEMENTED or SPEC

Every doc file, every class, every function reference must be marked:
```
✅ IMPLEMENTED — this exists, you can use it today
📋 SPEC ONLY — this is a design, the code doesn't exist yet
```

Without this, an AI (or human) has no way to know what's real.

### Rule 2: Provide Working Code, Not Architecture Diagrams

The #1 thing any builder needs:
```
// This code works. Copy it. Run it. You get a test result.
```

Currently zero docs provide this. Every doc provides architecture, interfaces, design patterns, flow diagrams — but no code that compiles and runs.

### Rule 3: One File, One Purpose

Current state:
- `AI-BUILD-NODE-TEST.md` — spec disguised as build instructions
- `IN-APP-NODE-TESTING.md` — spec disguised as documentation
- `NODE-TESTING-COMPLETE.md` — overview mixing implemented + spec
- `FUNCTION-REFERENCE.md` — JS-only reference
- `CONSUMER-VS-TESTING.md` — function list without code

What's needed:
- `QUICKSTART.md` — working code in 3 languages (JS, C#, Swift). Copy, run, get result.
- `REFERENCE.md` — every function with language-specific names and examples
- `ROADMAP.md` — what's designed but not built yet (currently mixed into docs as if it's real)

### Rule 4: Include Real Test Result JSON

From an actual mainnet test. Not a schema. Not a type definition. The actual JSON output. So builders can see exactly what they're building toward.

```json
{
  "address": "sentnode1qxt6hyqutfk620m5j5uvcvk4p8cj3tdjweparf",
  "moniker": "busurnode au 001",
  "country": "Australia",
  "city": "Sydney",
  "protocol": "wireguard",
  "peers": 8,
  "speedMbps": 45.2,
  "speedMethod": "multi-request",
  "googleAccessible": true,
  "googleLatencyMs": 145,
  "connectSeconds": 12.3,
  "pass": true,
  "error": null,
  "timestamp": "2026-03-24T01:00:15Z"
}
```

This JSON should be on the FIRST PAGE of the first doc file a builder opens.

### Rule 5: Cross-Language Function Mapping

For every documented function, show the equivalent in each SDK:

| Purpose | JS SDK | C# SDK | What it returns |
|---------|--------|--------|----------------|
| Connect to node | `connectDirect(mnemonic, { nodeAddress })` | `SentinelVpnClient.ConnectAsync(nodeAddress)` | ConnectionResult |
| Get node status | `nodeStatusV3(url)` | `NodeClient.GetStatusAsync(url)` | NodeStatus |
| Speed test | `speedtestDirect()` | `HttpClient.GetByteArrayAsync(url)` + timer | Mbps (double) |
| Google check | `fetch('https://google.com/generate_204')` | `HttpClient.GetAsync(url)` | bool + latency |

This table would have saved 4+ hours of wrong function mapping.

### Rule 6: Test the Docs by Building From Them

Before publishing any doc update:
1. Give the doc to a fresh AI instance
2. Tell it "build a node test using only this document"
3. If it can't produce working code in 30 minutes → the doc failed
4. Fix the doc, not the AI

The current docs fail this test catastrophically. Zero working code produced after 10 hours.

---

## Summary

| Doc File | Claims | Reality | Grade |
|----------|--------|---------|-------|
| AI-BUILD-NODE-TEST.md | "Create adapter, import NodeTester" | Neither exists | F |
| IN-APP-NODE-TESTING.md | "SDK provides NodeTester class" | Class doesn't exist | F |
| FUNCTION-REFERENCE.md | Every function documented | JS only, no C# mapping | D |
| CONSUMER-VS-TESTING.md | 160+ functions listed | No code examples | C |
| NODE-TESTING-COMPLETE.md | Level 1 working, Level 2 spec | Doesn't label which is which | D |
| one-shot-buildability.md | Honest gap analysis | In wrong directory, too long | B |
| CLAUDE.md + MANIFESTO.md | Clear purpose + rules | Missing "read docs first" | B |

**Overall grade: D.** Volume is impressive. Usability is near zero. An AI with these docs is slower than an AI without them, because the docs create false confidence in code that doesn't exist.

**The fix:** Replace 3,000 lines of specs with 50 lines of working code + clear labels on what's implemented vs what's designed.
