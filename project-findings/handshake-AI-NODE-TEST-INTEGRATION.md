# In-App Node Testing — AI Build Instructions

## What This Is

An automated node testing feature BUILT INTO the Handshake dVPN application. It tests the APPLICATION'S OWN connect/disconnect functions against real Sentinel dVPN nodes.

This is **Level 2 testing**:
- **Level 1 (Node Tester CLI):** Tests raw protocol — handshake construction, V2Ray config building, transport selection, clock drift handling. Lives at `Desktop\sentinel-node-tester`. Finds SDK/protocol edge cases.
- **Level 2 (This):** Tests the APPLICATION itself — does `ConnectDirectAsync()` actually work? Does `Disconnect()` clean up properly? Does the app handle all edge cases that Level 1 discovered?

## Why This Exists

The Node Tester CLI found 17+ protocol bugs. Those bugs get fixed in the SDK. The application uses the SDK. But there may be bugs in HOW the application uses the SDK — wrong parameters, missing error handling, UI state corruption, tunnel cleanup failures. Level 2 catches those.

## Architecture

The app already has everything needed:
- `NativeVpnClient.ConnectDirectAsync(nodeAddress)` — connects to a node
- `NativeVpnClient.Disconnect()` — disconnects
- `NativeVpnClient.GetAllNodesAsync()` — gets node list
- `SentinelVpnClient` — manages WireGuard/V2Ray tunnels
- Status polling, session management, error handling

The test layer is a **thin orchestrator** that:
1. Gets the node list (already implemented)
2. For each node: calls the app's own `ConnectDirectAsync()`
3. Once connected: runs a connectivity check + speed test through the tunnel
4. Calls `Disconnect()`
5. Records the result
6. Moves to next node

**It does NOT reimplement handshake/tunnel logic.** It uses the app's existing functions exactly as a user would.

## Implementation Guide

### Step 1: Create `Services/NodeTestService.cs`

```csharp
public class NodeTestService
{
    private readonly IHnsVpnBackend _backend;
    private readonly CancellationTokenSource _cts = new();

    // Events for UI binding
    public event Action<NodeTestResult>? OnNodeTested;
    public event Action<string>? OnLog;
    public event Action<NodeTestSummary>? OnComplete;

    public bool IsRunning { get; private set; }
    public int Tested { get; private set; }
    public int Passed { get; private set; }
    public int Failed { get; private set; }

    public NodeTestService(IHnsVpnBackend backend) => _backend = backend;

    public async Task RunAsync(List<HnsNodeInfo> nodes, NodeTestOptions options)
    {
        IsRunning = true;
        Tested = Passed = Failed = 0;

        foreach (var node in nodes)
        {
            if (_cts.IsCancellationRequested) break;

            var result = await TestSingleNodeAsync(node, options);
            Tested++;
            if (result.Success) Passed++; else Failed++;
            OnNodeTested?.Invoke(result);
        }

        IsRunning = false;
        OnComplete?.Invoke(new NodeTestSummary { Tested, Passed, Failed });
    }

    public void Stop() => _cts.Cancel();
}
```

### Step 2: `TestSingleNodeAsync()` — The Core

This method calls the APP'S OWN functions. It does not bypass anything.

```csharp
private async Task<NodeTestResult> TestSingleNodeAsync(HnsNodeInfo node, NodeTestOptions options)
{
    var result = new NodeTestResult { NodeAddress = node.Address, Moniker = node.Moniker };
    var sw = Stopwatch.StartNew();

    try
    {
        // Phase 1: CONNECT — uses the app's own ConnectDirectAsync
        OnLog?.Invoke($"Connecting to {node.Moniker}...");
        using var connectCts = new CancellationTokenSource(options.ConnectTimeoutMs);
        await _backend.ConnectDirectAsync(node.Address, connectCts.Token);
        result.ConnectTimeMs = sw.ElapsedMilliseconds;
        OnLog?.Invoke($"Connected in {result.ConnectTimeMs}ms");

        // Phase 2: CONNECTIVITY CHECK — can we reach the internet through the tunnel?
        OnLog?.Invoke("Checking connectivity...");
        result.ConnectivityResult = await CheckConnectivityAsync(options.ConnectivityTargets);

        // Phase 3: SPEED TEST — how fast is the tunnel?
        if (result.ConnectivityResult.Reachable)
        {
            OnLog?.Invoke("Running speed test...");
            result.SpeedResult = await RunSpeedTestAsync();
        }

        // Phase 4: DISCONNECT — uses the app's own Disconnect
        OnLog?.Invoke("Disconnecting...");
        await _backend.DisconnectAsync();
        result.DisconnectClean = true;

        result.Success = result.ConnectivityResult.Reachable;
        result.TotalTimeMs = sw.ElapsedMilliseconds;
    }
    catch (Exception ex)
    {
        result.Success = false;
        result.Error = ex.Message;
        result.ErrorCode = (ex as SentinelException)?.Code;
        result.TotalTimeMs = sw.ElapsedMilliseconds;

        // IMPORTANT: Always try to disconnect on failure
        try { await _backend.DisconnectAsync(); } catch { }
    }

    return result;
}
```

### Step 3: Connectivity Check (through the app's tunnel)

```csharp
private async Task<ConnectivityResult> CheckConnectivityAsync(string[] targets)
{
    // The tunnel is already up (the app connected it).
    // All HTTP traffic goes through the tunnel automatically.
    // Just try to reach websites — if they work, the tunnel works.

    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
    foreach (var target in targets)
    {
        try
        {
            var sw = Stopwatch.StartNew();
            var response = await http.GetAsync(target);
            return new ConnectivityResult
            {
                Reachable = true,
                Target = target,
                LatencyMs = sw.ElapsedMilliseconds,
                StatusCode = (int)response.StatusCode
            };
        }
        catch { }
    }
    return new ConnectivityResult { Reachable = false };
}
```

### Step 4: Speed Test (through the app's tunnel)

```csharp
private async Task<SpeedResult> RunSpeedTestAsync()
{
    // Download a known file through the tunnel and measure throughput.
    // The tunnel routes all traffic — no SOCKS5 proxy needed.

    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    var url = "https://speed.cloudflare.com/__down?bytes=5000000"; // 5MB
    var sw = Stopwatch.StartNew();
    var data = await http.GetByteArrayAsync(url);
    var elapsed = sw.Elapsed.TotalSeconds;
    var mbps = Math.Round(data.Length * 8.0 / elapsed / 1_000_000, 2);

    return new SpeedResult { Mbps = mbps, Bytes = data.Length, Seconds = elapsed };
}
```

### Step 5: Data Models

```csharp
public class NodeTestResult
{
    public string NodeAddress { get; set; }
    public string? Moniker { get; set; }
    public string? Country { get; set; }
    public string? City { get; set; }
    public string? NodeType { get; set; } // WireGuard or V2Ray
    public int? Peers { get; set; }

    public bool Success { get; set; }
    public string? Error { get; set; }
    public string? ErrorCode { get; set; }

    public long ConnectTimeMs { get; set; }
    public long TotalTimeMs { get; set; }
    public bool DisconnectClean { get; set; }

    public ConnectivityResult? ConnectivityResult { get; set; }
    public SpeedResult? SpeedResult { get; set; }
}

public class NodeTestOptions
{
    public int ConnectTimeoutMs { get; set; } = 120_000; // 2 min
    public int MaxNodes { get; set; } = 0; // 0 = all
    public string[] ConnectivityTargets { get; set; } = new[]
    {
        "https://www.google.com",
        "https://www.cloudflare.com",
        "https://httpbin.org/ip",
    };
    public string? DnsPreset { get; set; } // "hns", "google", "cloudflare"
    public bool TestWireGuardOnly { get; set; }
    public bool TestV2RayOnly { get; set; }
}

public class NodeTestSummary
{
    public int Tested { get; set; }
    public int Passed { get; set; }
    public int Failed { get; set; }
    public double PassRate => Tested > 0 ? (double)Passed / Tested * 100 : 0;
}
```

### Step 6: UI Integration

Add a "Node Test" tab or modal to MainWindow:
- Start/Stop button
- Progress bar (Tested/Total)
- Live results table (Node, Type, Speed, Result)
- Filter: WG only, V2Ray only, specific country
- Export results to CSV
- DNS selector (HNS, Google, Cloudflare)

### Key Principles

1. **Use the app's own functions.** `ConnectDirectAsync()`, not raw handshake. `Disconnect()`, not tunnel kill.
2. **Test what the USER experiences.** Connect, check internet, measure speed, disconnect. That's the user flow.
3. **Record everything.** Connect time, error codes, disconnect cleanliness, speed. This data reveals app-level bugs.
4. **Always disconnect.** Even on error. Leaked tunnels = internet dies for the user.
5. **Compare with Level 1.** If the Node Tester CLI passes a node but the app fails, that's an APP bug (not a protocol bug).
6. **Edge cases from Level 1 to verify:**
   - Clock drift nodes (alterId handling)
   - 409 session conflicts (fresh session payment)
   - Stale credential reuse
   - V2Ray port changes (metadata vs actual)
   - Address mismatch nodes
   - WireGuard service cleanup
   - DNS resolution through tunnel (HNS domains)

### What NOT To Do

- Do NOT reimplement handshake logic — the SDK does this
- Do NOT spawn V2Ray directly — the app's `SentinelVpnClient` does this
- Do NOT manage WireGuard services — the app's tunnel layer does this
- Do NOT parse V2Ray config — the SDK builds it
- Do NOT query the chain directly — use `_backend.GetAllNodesAsync()`

The app is the black box. The test layer pokes it and records what happens.

### Comparison Flow: Level 1 vs Level 2

```
Level 1 (Node Tester CLI):           Level 2 (In-App Test):
─────────────────────────             ─────────────────────────
1. LCD query nodes                    1. app.GetAllNodesAsync()
2. Batch payment (5/tx)               2. (app handles internally)
3. Raw handshake + sign               3. app.ConnectDirectAsync(addr)
4. Parse metadata manually            4. (app handles internally)
5. Build V2Ray config from scratch    5. (app handles internally)
6. Spawn V2Ray process                6. (app handles internally)
7. SOCKS5 speedtest                   7. Direct HTTP speedtest (tunnel routes all traffic)
8. Kill V2Ray process                 8. app.DisconnectAsync()
9. Record to results.json             9. Record to test results

Level 1 tests: Does the PROTOCOL work?
Level 2 tests: Does the APP work?
```
