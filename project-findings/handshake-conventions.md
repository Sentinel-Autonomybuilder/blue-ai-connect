# Handshake dVPN — Project Instructions

## Identity
**Handshake dVPN** — a white-themed, Handshake-branded decentralized VPN client built on the Sentinel C# SDK. Default DNS is Handshake (103.196.38.38 / 103.196.38.39). No subscription plans — users connect directly to any node and pay per GB or per hour.

See `MANIFESTO.md` for the full philosophy: dVPN without dDNS is incomplete.

## Architecture
- **C# WPF / .NET 8.0** — Windows desktop application
- **Native mode only** — no daemon dependency, uses C# SDK directly
- **Sentinel C# SDK** — references Core, Node, Tunnel projects
- **Handshake DNS** — hardcoded as tunnel DNS (103.196.38.38, 103.196.38.39)
- **No plan system** — all active Sentinel nodes visible, direct connect
- **Payment models** — per-GB and per-hour pricing shown per node

## Key Differences from Reference Desktop App (EXE)
| Feature | Reference App | Handshake dVPN |
|---------|-----------|---------------|
| Theme | Dark | White/light |
| Branding | Default (blue gradient) | Handshake (purple gradient) |
| DNS | System default | Handshake (HDNS) |
| Node access | Plan-filtered (#42) | All active nodes |
| Payment | Plan subscription | Direct per-GB or per-hour |
| Daemon mode | Yes (dual-mode) | No (native only) |
| Plan overlay | Yes | No |

## File Structure
```
handshake-dvpn/
  HandshakeDVPN.csproj       # References Sentinel C# SDK
  App.xaml / App.xaml.cs      # White theme, native-only init
  MainWindow.xaml / .cs       # Node browser, connection orb, stats
  Services/
    IHnsVpnBackend.cs         # Interface + data models
    NativeVpnClient.cs        # SDK wrapper, all-nodes query, Handshake DNS
  app.manifest                # Admin elevation (WireGuard)
  start.bat                   # Launcher
  .env                        # Wallet mnemonic (NEVER commit)
  MANIFESTO.md                # Project philosophy
  conventions.md              # This file
```

## Branding
- **Primary color:** `#6B3FA0` (Handshake purple)
- **Logo mark:** `/` in purple gradient square — represents Handshake's root zone
- **Theme:** White background, light grays, purple accents
- **Green:** `#00B87A` for online/connected states
- **Font:** Segoe UI (system), Cascadia Code (mono)

## SDK Integration Rules
- **NEVER edit SDK files.** Write findings to `Sentinel SDK/suggestions/`
- Uses `ChainClient.GetActiveNodesAsync()` for ALL nodes (not plan-filtered)
- Uses `SentinelVpnClient.ConnectAsync()` for direct connection (not subscription-based)
- DNS set via `SentinelVpnOptions.Dns` property
- Node pricing from `ChainNode.GigabytePrices` and `ChainNode.HourlyPrices`

## Handshake DNS
- **Primary:** `103.196.38.38`
- **Secondary:** `103.196.38.39`
- Resolves both traditional domains and Handshake TLDs
- Set as tunnel DNS on every connection — user doesn't configure this
- The DNS badge in the topbar confirms Handshake DNS is active

## Build & Run
```bash
dotnet build HandshakeDVPN.csproj
dotnet run --project HandshakeDVPN.csproj
# or: start.bat (runs as admin for WireGuard)
```

## Persistence
- User data: `%LocalAppData%\HandshakeDVPN\user.json`
- Log file: `%LocalAppData%\HandshakeDVPN\app.log`

## Code Standards
Follows root `CLAUDE.md` S2 standards. C# conventions: nullable enabled, section dividers (`// ─── Section ───`), no silent catch for important operations.
