# Logging Standards — Every Integration Must Log Identically

**Date:** 2026-03-24
**Source:** Handshake dVPN tested 135 nodes (118 pass, 17 fail) but failures weren't saved to disk properly
**Rule:** Every app that integrates node testing must produce the EXACT same log files as the standalone Node Tester

---

## The Standalone Node Tester Produces These Files

```
results/
  results.json              ← Complete test results array (all nodes, pass + fail)
  failures.jsonl            ← One JSON per line, ONLY failures, timestamped
  session-credentials.json  ← Cached sessions for reuse
  transport-cache.json      ← V2Ray transport success/failure history
  .state-snapshot.json      ← Scan state (position, counts, baseline)
  runs/                     ← Archived runs with summary
```

## Every Integration MUST Produce At Minimum

### 1. `test-results.json` — Complete Results

Array of all test results. Format must match the standalone Node Tester's `results.json` EXACTLY:

```json
[
  {
    "timestamp": "2026-03-24T00:05:03Z",
    "address": "sentnode1ldh7ke5x9896px23muen32twcyaykd8rf5a8hd",
    "type": "WireGuard",
    "moniker": "Fra7593fvi",
    "country": "",
    "city": "",
    "peers": 4,
    "actualMbps": 8.6,
    "speedMethod": "multi-request",
    "googleAccessible": true,
    "googleLatencyMs": 823,
    "connectSeconds": 20.5,
    "pass": true,
    "error": null,
    "sdk": "csharp",
    "os": "Windows"
  }
]
```

**NOT wrapped in `{"Data": [...]}`.** The Node Tester's results.json is a raw array. Integrations must match.

### 2. `test-failures.jsonl` — Failure Log (CRITICAL)

One JSON object per line. ONLY failures. This is the file operators and developers use to diagnose issues.

```jsonl
{"ts":"2026-03-24T00:07:03Z","node":"sentnode1abc...","moniker":"NodeName","peers":6,"type":"V2Ray","error":"Handshake rejected: invalid session status \"inactive_pending\"","country":"USA","city":"","connectSeconds":15.2}
{"ts":"2026-03-24T00:07:48Z","node":"sentnode1def...","moniker":"NodeName2","peers":4,"type":"WireGuard","error":"WireGuard tunnel did not become active within 15s","country":"Germany","city":"Berlin","connectSeconds":22.0}
{"ts":"2026-03-24T00:24:42Z","node":"sentnode1ghi...","moniker":"NodeName3","peers":3,"type":"V2Ray","error":"VMess-only node with clock drift 245s","country":"","city":"","connectSeconds":0}
{"ts":"2026-03-24T01:13:37Z","node":"sentnode1jkl...","moniker":"NodeName4","peers":8,"type":"V2Ray","error":"Node address mismatch","country":"","city":"","connectSeconds":12.0}
```

**Why JSONL not JSON:** Append-only. No need to parse entire file to add one failure. Survives crashes mid-write. Can `tail -f` for live monitoring.

**Fields per failure:**
| Field | Required | Description |
|-------|----------|-------------|
| ts | YES | ISO 8601 timestamp |
| node | YES | sentnode1... address |
| moniker | YES | Node name or "" |
| peers | YES | Peer count at time of test (0 = truly dead) |
| type | YES | "WireGuard" or "V2Ray" |
| error | YES | Full error message string |
| country | NO | From status check |
| city | NO | From status check |
| connectSeconds | NO | How far into connection it failed |
| transport | NO | V2Ray transport attempted (e.g., "tcp/tls") |
| sessionId | NO | If session was created before failure |

### 3. `test-state.json` — Scan State

Persisted after every node test. Allows resume on restart.

```json
{
  "status": "testing",
  "totalNodes": 1006,
  "testedNodes": 135,
  "passedNodes": 118,
  "failedNodes": 17,
  "startedAt": "2026-03-24T00:04:43Z",
  "lastTestedNode": "sentnode1abc...",
  "lastTestedAt": "2026-03-24T01:18:49Z",
  "baselineHistory": [120.5, 115.2, 118.8],
  "nodeSpeedHistory": [8.6, 20.3, 19.3, 4.1, 2.9, 4.2],
  "tokensSpent": 622.75
}
```

---

## Failure Categories (From Handshake dVPN's 17 Failures)

These are the REAL failures found testing 135 nodes on mainnet 2026-03-24:

| Category | Count | Error Pattern | Peers > 0? | Our Bug? |
|----------|-------|--------------|-----------|---------|
| Stale session ("inactive_pending") | 2 | `invalid session status "inactive_pending"` | YES | YES — ForceNewSession should handle this |
| WireGuard tunnel timeout | 1 | `did not become active within 15s` | YES | MAYBE — could be node-side WG config |
| V2Ray transport failed | 2 | `All N transport/protocol combinations failed` | YES | YES — need transport fallback or config fix |
| Clock drift >120s | 2 | `VMess-only node with clock drift Xs` | YES | NO — node's clock is wrong, but we should try VLess |
| Node address mismatch | 1 | `node address mismatch` | YES | NO — node's chain record is stale |
| 0 Mbps (connected, no throughput) | 5 | Connected but speed test returned 0 | YES | MAYBE — tunnel up but traffic blocked |
| Low speed (<1 Mbps) | 4 | Speed below pass threshold | YES | NO — node is genuinely slow |

**Iron Rule check:** 13 of 17 failures have peers > 0. At least 5 are definitely our bugs. The Node Tester would investigate every one.

---

## What Handshake dVPN Must Add

### Immediate: Failure Logging

Add to `TestNodeAsync` — append to failures.jsonl on every failure:

```csharp
private static readonly string FailureLog = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "HandshakeDVPN", "test-failures.jsonl");

private static void LogFailure(NodeTestResult result)
{
    if (result.Pass) return;
    try
    {
        var entry = JsonSerializer.Serialize(new
        {
            ts = result.Timestamp.ToString("o"),
            node = result.Address,
            moniker = result.Moniker ?? "",
            peers = result.Peers ?? 0,
            type = result.Protocol ?? "",
            error = result.Error ?? "Unknown",
            country = result.Country ?? "",
            city = result.City ?? "",
            connectSeconds = result.ConnectSeconds,
        });
        var dir = Path.GetDirectoryName(FailureLog)!;
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        File.AppendAllText(FailureLog, entry + "\n");
    }
    catch { }
}
```

Call `LogFailure(result)` at the end of `TestNodeAsync`, after setting the result.

### Immediate: State Persistence

Save scan state after every node test so resume works:

```csharp
DiskCache.Save("test-state", new
{
    status = _testRunning ? "testing" : "idle",
    totalNodes = _testTotal,
    testedNodes = _testDone,
    passedNodes = _testResults.Count(r => r.Pass),
    failedNodes = _testResults.Count(r => !r.Pass),
    startedAt = _testStartTime,
    lastTestedNode = result.Address,
    lastTestedAt = DateTime.UtcNow,
});
```

### Future: Resume Support

On "Resume" button click:
1. Load test-state.json
2. Load test-results.json
3. Find nodes not yet tested
4. Continue from where we left off

### Future: Run Archives

After scan completes, archive to `runs/` folder with timestamp:
```
runs/
  2026-03-24T00-04-43/
    results.json
    failures.jsonl
    summary.txt (pass rate, avg speed, duration)
```

---

## Logging Format Compatibility

The Node Tester and every integration must produce compatible log files so that:

1. **Results can be compared across apps:** JS Node Tester result vs C# Handshake dVPN result for same node = same format
2. **Failures can be aggregated:** Combine failures.jsonl from multiple sources for network-wide analysis
3. **State can be shared:** One app's test-state.json can be read by another app to avoid re-testing

**The format is the contract.** If the Node Tester changes its format, all integrations break. If an integration uses a different format, its results can't be compared.

**Recommendation:** Add `FORMAT-VERSION: 1` header to each file. When format changes, increment version. Integrations check version before parsing.

---

## Summary

| File | Node Tester Has It | Handshake dVPN Has It | Priority |
|------|-------------------|---------------------|----------|
| results.json (array) | ✅ | ✅ (but wrapped in Data:{}) | Fix format |
| failures.jsonl | ✅ | ❌ | Add NOW |
| test-state.json | ✅ (.state-snapshot) | ❌ | Add for resume |
| session-credentials.json | ✅ | ❌ (uses ForceNewSession) | Future |
| transport-cache.json | ✅ | ❌ | Future |
| runs/ archive | ✅ | ❌ | Future |

**The failure log is the most important missing piece.** Without it, the 17 failures we found are just numbers in the console. With it, they're actionable diagnostics that can drive SDK fixes.
