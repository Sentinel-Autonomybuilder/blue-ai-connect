# Handshake dVPN — Application Standards & Customizations

All decisions, customizations, and lessons learned building this pure P2P direct-connect dVPN.

---

## Identity
- **Pure P2P app** — no plans, no subscriptions, no operators, no fee grants
- User connects directly to any Sentinel node and pays per GB or per hour
- Handshake DNS default — decentralized naming + decentralized transport
- Black & white theme with Inter font

## Node Loading
- **Load on app open** — probing starts immediately when app launches, before login
- **Single probe per session** — nodes cached in memory, reused across login/logout
- **No re-query on login** — if nodes already loaded, render from cache
- **Only re-probe on Refresh button** — user controls when to re-query
- **Only show online nodes** — nodes that didn't respond during probe are hidden
- **Progress logged every 200 nodes** — not every 100 (reduces log spam)
- Probe: 30 parallel workers, 6s timeout each, ~25s for 1000+ nodes

## Welcome Screen
- **Always shows first** — never auto-skip via .env mnemonic reading
- Split layout: brand hero left, auth card right
- HNS crystalline slash logo (official, from SVG path data)
- "Handshake" bold + "dVPN" light title
- 3 feature bullets
- "Powered by Sentinel" with Sentinel shield logo (from Cosmos chain registry)
- Import Wallet / Create Wallet tabs
- Test Wallet button (no balance shown)
- Empty mnemonic field — no pre-fill from saved data

## Topbar
- HNS logo + "Handshake dVPN" (bold + light)
- No badges (removed dVPN badge, removed HNS DNS badge)
- Wallet address + balance + Settings gear + Logout

## Sidebar
- **Two top tabs:** Nodes | Sessions
- Nodes: filter row (All, WG, V2, Per GB, Per Hour)
- Search across country, city, moniker
- Countries collapsed by default with chevron + flag image + online/total count
- **Flag images from flagcdn.com** — WPF can't render emoji flags
- Cached to %LocalAppData%/HandshakeDVPN/flags/
- 120+ country name variants with fuzzy matching
- Sessions: shows active sessions with usage bars + Connect buttons

## Node Info Card (on select)
- Row 1: flag + name + location
- Row 2: protocol badge + peers | Per GB [price] | Per Hour [price]
- Row 3: amount input + total cost calculation
- Row 4: existing session bar (green, shows remaining allocation)
- User chooses GB or Hour mode + amount before connecting

## Connection Orb
- HNS crystalline slash logo inside the circle (not power icon)
- Gray when disconnected, black when connected
- Light background on connected state

## Buttons
- Connect: solid black, white text, no icon
- Disconnect: white background, black border
- Connecting: gray background, disabled

## Allocation Display
- Shows on dashboard when connected: "DATA REMAINING 450 MB / 1.00 GB (45% used)"
- Progress bar with proportional fill
- Updates every 30 seconds (not every poll)
- Shows on node select if existing session: "Active session #ID — X remaining"
- Hidden on disconnect

## Settings (inline overlay, not separate window)
- DNS: radio buttons — Handshake / Google / Cloudflare / Custom
- Custom DNS text input
- LCD endpoints: 4 defaults shown, custom override input
- RPC endpoints: 3 defaults shown, custom override input
- Read-only info: tunnel, WireGuard, V2Ray, session, chain, auto-reconnect
- Save button persists to %LocalAppData%/HandshakeDVPN/settings.json

## Payment
- Per-GB: locks amount × GB_price upfront. Not refundable.
- Per-Hour: locks amount × hourly_price. SDK currently hardcodes 1 hour.
- User sees total cost before connecting
- Use QuoteValue (not BaseValue) for prices — BaseValue has 18 decimal garbage
- Price format: trim trailing zeros (0.05, not 0.0500000)

## SDK Integration
- ForceNewSession = true — avoids stale session 404 errors
- No fee grant auto-detection — pure P2P, user pays own gas
- WireGuard cleanup before connect — uninstall stale wgsent0 tunnel
- DNS from settings (defaults to Handshake 103.196.38.38)
- ChainClient usable without wallet (for node loading on app open)

## Bandwidth Optimization
- Status poll: 3s (in-memory, no chain call, FREE)
- Allocation check: 120s (chain query, ~2KB — node posts to chain every ~5min anyway)
- IP check: 60s (ipify.org, ~0.5KB)
- Balance check: 5min (chain query, ~2KB — doesn't change mid-session)
- Nodes: cached to disk, refresh in background on login (~10MB)
- Plans: cached to disk, refresh with nodes
- Sessions: cached to disk, refresh on login
- Flags: once ever (cached to disk, ~35KB)
- Total daily overhead when connected: ~3MB

## Persistence
- User wallet: %LocalAppData%/HandshakeDVPN/user.json
- Settings: %LocalAppData%/HandshakeDVPN/settings.json
- Flags: %LocalAppData%/HandshakeDVPN/flags/*.png
- Log: %LocalAppData%/HandshakeDVPN/app.log

## Plans Tab
- Browse available plans via `DiscoverPlansAsync(maxId: 100)`
- Show plan ID, price, node count, subscriber count
- Subscribe button calls `MessageBuilder.StartSubscription(address, planId)`
- After subscribe, fee grant auto-detected from plan owner
- Connect via `ConnectViaSubscriptionAsync(subscriptionId, nodeAddress)`
- Subscriber pays ZERO gas — plan owner's fee grant covers TX fees
- Plan nodes shown via `GetPlanNodesAsync(planId)`

## Three Sidebar Tabs
1. **Nodes** — all online nodes, direct connect, pay per GB/hour
2. **Sessions** — active sessions with remaining allocation
3. **Plans** — browse/subscribe to plans, connect via subscription with fee grant

## UX & Frontend Standards

### Vertical Alignment Rule
Every horizontal row with mixed-height elements MUST have `VerticalAlignment = Center` on ALL children:
- Chevron arrows (8-9px text)
- Flag images (18px border)
- Country names (11.5px text)
- Count badges (9.5px text)
If any child lacks `VerticalAlignment.Center`, the row looks jagged.

### Grid Column Rule
Every Grid with left + right content MUST have explicit ColumnDefinitions:
```xml
<Grid>
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="*"/>      <!-- left content -->
        <ColumnDefinition Width="Auto"/>   <!-- right content -->
    </Grid.ColumnDefinitions>
</Grid>
```
NEVER put two elements in a Grid without columns — they overlap.

### Spacing Constants
- Country header padding: `8, 9, 8, 9`
- Node row padding: `12, 9, 12, 9`
- Session card padding: `12, 10, 12, 10`
- Card margins: `4, 3, 4, 3`
- Chevron → flag gap: `8px` (margin-right on chevron)
- Flag → text gap: `6px` (margin-left on text)
- Sidebar content margin: `8, 0` (horizontal)

### Font Hierarchy (Inter embedded)
| Element | Weight | Size | Color |
|---------|--------|------|-------|
| Page title | Bold | 36px | T1 |
| Section header | SemiBold | 12-13px | T1 |
| Body text | Regular | 11-12px | T2 |
| Captions/hints | Regular | 10px | T3 |
| Mono values | Regular | 10-11px | T2 |
| Log text | Mono Regular | 10px | T2/Red |

### Button Styles
| Button | Background | Foreground | Border |
|--------|-----------|-----------|--------|
| Primary (Connect) | Black (#000) | White | None |
| Disconnect | White | Black | Black 1.5px |
| Connecting | Gray (Bg4) | Gray (T3) | None |
| Ghost (Settings, etc) | Transparent | T3 | Bdr 1px |
| Filter active | — | Acc (black) | — |
| Filter inactive | — | T3 (gray) | — |

### Progress Bar Pattern
Use star-sized grid columns for proportional fill:
```csharp
// ALWAYS clamp to 0.01-0.99
var pct = Math.Max(0.01, Math.Min(0.99, value / 100.0));
grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(pct, GridUnitType.Star) });
grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1 - pct, GridUnitType.Star) });
```
NEVER use `Math.Max(2, ...)` — creates negative widths that crash.

### Tab Indicator Pattern
Active tab: T1 foreground + SemiBold + Acc bottom border (2px)
Inactive tab: T2 foreground + Medium weight + Transparent border

### Country Header Pattern
```
[▶] [flag] Country Name    123/150
```
- Chevron: 8px, T3, VerticalAlignment.Center, margin-right 8
- Flag: 26x18 border, CornerRadius 2, ClipToBounds, VerticalAlignment.Center
- Country: 11.5px, T1, SemiBold, VerticalAlignment.Center, margin-left 6
- Count: 9.5px, Mono, T3, right-aligned, VerticalAlignment.Center
- All in Grid with 2 columns (star + auto)
- Starts collapsed, chevron toggles

### Color System
| Key | Hex | Usage |
|-----|-----|-------|
| Bg0 | #FFFFFF | Page background |
| Bg1 | #FAFAFA | Sidebar, cards |
| Bg2 | #F2F2F2 | Input fields, inactive buttons |
| Bg3 | #E8E8E8 | Disabled, placeholders |
| Bg4 | #D9D9D9 | Strong disabled |
| Bdr | #E0E0E0 | Borders |
| T1 | #000000 | Primary text, Accent |
| T2 | #555555 | Secondary text |
| T3 | #999999 | Tertiary text |
| Green | #22C55E | Online, connected, subscribed |
| Red | #DC2626 | Errors, logout |

## Errors Encountered & Fixed
1. Stale session 404 → ForceNewSession = true
2. WireGuard tunnel already running → pre-connect cleanup
3. Either GB or hours must be > 0 → Gigabytes = 1 fallback for hourly
4. BaseValue 18 decimals → use QuoteValue
5. Emoji flags invisible in WPF → flagcdn.com PNG images
6. Country name variants → 120+ entry map with fuzzy match
7. Double probing → _initDone guard + _nodesLoaded cache
8. Fee grant auto-detection → removed entirely
9. TextChanged fires during init → null check on UI elements
10. Connection dropped on app close → _isClosing flag
11. GridLength negative crash → Math clamp to 0.01-0.99
12. Grid overlapping text → always use ColumnDefinitions for left/right layouts
13. Session tab blank → MakeSessionRow crash from negative GridLength
14. Double probing → removed background loader, single probe after login
15. Plans tab probing expensive → cache results, don't re-query on tab switch
16. Per GB/Hr filters on Nodes useless → all nodes have both prices, removed
17. PreferHourly SDK bug → silently creates GB sessions, documented
18. Session not showing after disconnect → save to local cache instantly on disconnect
19. Page flickering → never re-render during user interaction, use fixed heights
20. CheckExistingSession was async → made synchronous using cached data
21. Triple LCD probe → LoadBalance + RefreshAllAsync + preload all init separately
22. JSON string/number mismatch → GbPriceUdvpn serializes as int, breaks deserialization

## Caching Strategy
| Data | Show From | Refresh When | TTL |
|------|-----------|-------------|-----|
| Nodes | Disk cache on login | Background after login | 30min |
| Plans | Disk cache on tab | Background after login | 10min |
| Sessions | Memory cache on tab | After connect/disconnect | On demand |
| Balance | Last value | Every 5min | — |
| Allocation | Chain query | Every 120s when connected | — |
| Flags | Disk permanent | Never | Forever |
| Settings | Disk permanent | On save | Forever |

## Rule: Never Re-render While User Interacts
- Background refresh updates `_allNodes` but does NOT call `RenderNodes()`
- User clicks Refresh button to see updated list
- SelectNode does NOT re-render — only updates info card
- Connection state changes update orb/button/stats only, not node list
- Fixed heights on all containers — nothing shifts or jumps
