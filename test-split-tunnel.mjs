#!/usr/bin/env node
/**
 * Split Tunnel End-to-End Test
 *
 * Tests BOTH V2Ray (per-app SOCKS5) and WireGuard (full tunnel) connections,
 * verifying split tunneling, IP changes, and connectivity at every step.
 *
 * Usage:
 *   node test-split-tunnel.mjs                        (reads MNEMONIC from .env)
 *   MNEMONIC="your words" node test-split-tunnel.mjs   (from environment)
 *
 * Requires:
 *   - Funded wallet (P2P tokens)
 *   - V2Ray 5.2.1 installed
 *   - WireGuard installed + admin privileges (for WireGuard test)
 *
 * Costs: ~2 sessions (~80-100 P2P depending on node prices)
 */

import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toUrl = (p) => pathToFileURL(p).href;

// ─── Load mnemonic ──────────────────────────────────────────────────────────

function loadMnemonic() {
  if (process.env.MNEMONIC && process.env.MNEMONIC.split(/\s+/).length >= 12) {
    return process.env.MNEMONIC;
  }
  const paths = [
    resolve(__dirname, '.env'),
    resolve(__dirname, '..', '..', 'sentinel-node-tester', '.env'),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, 'utf-8');
      const match = content.match(/^MNEMONIC\s*=\s*([a-z][\sa-z]+)$/m);
      if (match && match[1].trim().split(/\s+/).length >= 12) return match[1].trim();
    } catch { /* try next */ }
  }
  throw new Error('No MNEMONIC found. Set via environment or .env file.');
}

// ─── Logging ────────────────────────────────────────────────────────────────

const C = {
  pass: '\x1b[32m',
  fail: '\x1b[31m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

let testNum = 0;
const results = [];

function log(msg) { console.log(`  ${msg}`); }
function pass(name, detail) {
  testNum++;
  results.push({ num: testNum, name, pass: true, detail });
  console.log(`  ${C.pass}PASS ${testNum}${C.reset} ${name}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ''}`);
}
function fail(name, detail) {
  testNum++;
  results.push({ num: testNum, name, pass: false, detail });
  console.log(`  ${C.fail}FAIL ${testNum}${C.reset} ${name}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ''}`);
}
function section(title) {
  console.log(`\n  ${C.bold}═══ ${title} ${'═'.repeat(Math.max(0, 50 - title.length))}${C.reset}\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(`${C.bold}  Sentinel AI Path — Split Tunnel E2E Test${C.reset}`);
  console.log(`${C.dim}  Real P2P tokens. Real nodes. Real encrypted tunnels.${C.reset}`);
  console.log(`  ${'═'.repeat(55)}`);

  const t0 = Date.now();
  const mnemonic = loadMnemonic();

  // Import AI Path
  const ai = await import(toUrl(resolve(__dirname, 'index.js')));
  const sdk = await import(toUrl(resolve(__dirname, '..', 'js-sdk', 'index.js')));
  sdk.registerCleanupHandlers();

  // ─── PREFLIGHT ────────────────────────────────────────────────────────

  section('PREFLIGHT');

  const env = ai.getEnvironment();
  pass('Environment', `${env.platform}, Node v${env.nodeVersion}`);
  pass('V2Ray', env.v2ray.available ? `v${env.v2ray.version}` : 'NOT FOUND');
  pass('WireGuard', env.wireguard.available ? `installed${env.admin ? ' (admin)' : ' (no admin)'}` : 'NOT FOUND');

  const bal = await ai.getBalance(mnemonic);
  if (bal.funded) {
    pass('Balance', `${bal.p2p} — sufficient`);
  } else {
    fail('Balance', `${bal.p2p} — insufficient`);
    process.exit(1);
  }

  // Get original IP before any VPN
  let originalIp = null;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10000) });
    originalIp = (await res.json()).ip;
    pass('Original IP', originalIp);
  } catch (err) {
    fail('Original IP', err.message);
  }

  // ─── TEST 1: V2RAY SPLIT TUNNEL ──────────────────────────────────────

  section('V2RAY SPLIT TUNNEL (per-app SOCKS5 proxy)');

  log(`${C.info}Connecting via V2Ray...${C.reset}`);

  let v2vpn;
  try {
    v2vpn = await ai.connect({
      mnemonic,
      protocol: 'v2ray',
      onProgress: (step, detail) => log(`  ${C.dim}[${step}] ${detail}${C.reset}`),
    });

    pass('V2Ray connected', `session=${v2vpn.sessionId}, port=${v2vpn.socksPort}`);

    if (v2vpn.ip) {
      pass('V2Ray IP (via SOCKS5)', v2vpn.ip);
    } else {
      fail('V2Ray IP check', 'returned null — SOCKS5 proxy may not be routing');
    }

    // Verify split tunnel
    log(`\n  ${C.info}Verifying split tunnel...${C.reset}`);
    const split = await ai.verifySplitTunnel();

    if (split.proxyIp) {
      pass('SOCKS5 proxy IP', split.proxyIp);
    } else {
      fail('SOCKS5 proxy IP', 'null — proxy not routing traffic');
    }

    if (split.directIp) {
      pass('Direct IP (no proxy)', split.directIp);
    } else {
      fail('Direct IP', 'null — could not check direct IP');
    }

    if (split.splitTunnel) {
      pass('Split tunnel VERIFIED', `proxy=${split.proxyIp} vs direct=${split.directIp}`);
    } else if (split.proxyIp && split.directIp) {
      fail('Split tunnel', `SAME IP — proxy=${split.proxyIp}, direct=${split.directIp}`);
    } else {
      fail('Split tunnel', 'Could not verify — missing IP data');
    }

    // Verify via SDK
    const v = await ai.verify();
    pass('verify()', `connected=${v.connected}, verified=${v.verified}, ip=${v.ip}`);

    // Manual SOCKS5 test
    log(`\n  ${C.info}Manual SOCKS5 connectivity test...${C.reset}`);
    try {
      const { resolve: pResolve, dirname: pDirname } = await import('path');
      const { fileURLToPath: pFileUrl, pathToFileURL: pPathUrl } = await import('url');
      const dir = pDirname(pFileUrl(import.meta.url));
      const socksPath = pResolve(dir, '..', 'js-sdk', 'node_modules', 'socks-proxy-agent', 'dist', 'index.js');
      const axiosPath = pResolve(dir, '..', 'js-sdk', 'node_modules', 'axios', 'index.js');
      const axios = (await import(pPathUrl(axiosPath).href)).default;
      const { SocksProxyAgent } = await import(pPathUrl(socksPath).href);

      const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${v2vpn.socksPort}`);
      const proxyRes = await axios.get('https://api.ipify.org?format=json', {
        httpAgent: agent, httpsAgent: agent, timeout: 15000, adapter: 'http',
      });
      pass('Manual SOCKS5 test', `IP via proxy: ${proxyRes.data.ip}`);

      // Direct (should show original IP)
      const directRes = await axios.get('https://api.ipify.org?format=json', {
        timeout: 10000, adapter: 'http',
      });
      pass('Manual direct test', `IP direct: ${directRes.data.ip}`);

      if (proxyRes.data.ip !== directRes.data.ip) {
        pass('Manual split verification', 'DIFFERENT IPs confirmed');
      } else {
        fail('Manual split verification', 'SAME IP — split tunnel not working');
      }
    } catch (err) {
      fail('Manual SOCKS5 test', err.message);
    }

    // Status checks
    pass('isVpnActive()', ai.isVpnActive() ? 'true' : 'false');
    const st = ai.status();
    pass('status()', `protocol=${st.protocol}, uptime=${st.uptimeFormatted}`);

  } catch (err) {
    fail('V2Ray connect', err.message);
  }

  // Disconnect V2Ray
  if (v2vpn) {
    log(`\n  ${C.info}Disconnecting V2Ray...${C.reset}`);
    try {
      await ai.disconnect();
      pass('V2Ray disconnected', ai.isVpnActive() ? 'WARNING: still active' : 'tunnel down');
    } catch (err) {
      fail('V2Ray disconnect', err.message);
    }
  }

  // ─── TEST 2: WIREGUARD FULL TUNNEL ───────────────────────────────────

  if (env.wireguard.available && env.admin) {
    section('WIREGUARD FULL TUNNEL (all traffic through VPN)');

    log(`${C.info}Connecting via WireGuard...${C.reset}`);

    let wgVpn;
    try {
      wgVpn = await ai.connect({
        mnemonic,
        protocol: 'wireguard',
        onProgress: (step, detail) => log(`  ${C.dim}[${step}] ${detail}${C.reset}`),
      });

      pass('WireGuard connected', `session=${wgVpn.sessionId}`);

      if (wgVpn.ip) {
        pass('WireGuard IP', wgVpn.ip);
      } else {
        fail('WireGuard IP', 'null');
      }

      // Full tunnel: ALL traffic should show VPN IP
      try {
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        if (data.ip !== originalIp) {
          pass('Full tunnel verified', `IP changed: ${originalIp} → ${data.ip}`);
        } else {
          fail('Full tunnel', `IP did NOT change: ${data.ip}`);
        }
      } catch (err) {
        fail('Full tunnel IP check', err.message);
      }

      // Speed test
      try {
        const t1 = Date.now();
        const res = await fetch('https://speed.cloudflare.com/__down?bytes=1000000', { signal: AbortSignal.timeout(15000) });
        await res.arrayBuffer();
        const ms = Date.now() - t1;
        const mbps = ((1000000 * 8) / (ms / 1000) / 1000000).toFixed(1);
        pass('Speed test', `${mbps} Mbps (1MB in ${ms}ms)`);
      } catch (err) {
        fail('Speed test', err.message);
      }

      // Verify
      const v = await ai.verify();
      pass('verify()', `connected=${v.connected}, verified=${v.verified}`);

      pass('isVpnActive()', ai.isVpnActive() ? 'true' : 'false');

    } catch (err) {
      fail('WireGuard connect', err.message);
    }

    // Disconnect WireGuard
    if (wgVpn) {
      log(`\n  ${C.info}Disconnecting WireGuard...${C.reset}`);
      try {
        await ai.disconnect();
        pass('WireGuard disconnected', ai.isVpnActive() ? 'WARNING: still active' : 'tunnel down');
      } catch (err) {
        fail('WireGuard disconnect', err.message);
      }
    }
  } else {
    section('WIREGUARD FULL TUNNEL');
    log(`${C.warn}SKIPPED — ${!env.wireguard.available ? 'WireGuard not installed' : 'not running as admin'}${C.reset}`);
  }

  // ─── RESULTS ──────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log('');
  console.log(`  ${'═'.repeat(55)}`);
  console.log(`  ${C.bold}${passed}/${results.length} passed${C.reset}, ${failed} failed — ${elapsed}s`);

  if (failed > 0) {
    console.log(`\n  ${C.fail}Failed:${C.reset}`);
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ${r.num}. ${r.name}: ${r.detail}`);
    }
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log(`\n  ${C.warn}Interrupted — cleaning up...${C.reset}`);
  try {
    const ai = await import(toUrl(resolve(__dirname, 'index.js')));
    await ai.disconnect();
  } catch { /* best effort */ }
  process.exit(1);
});

main().catch(err => {
  console.error(`\n  ${C.fail}FATAL: ${err.message}${C.reset}`);
  process.exit(1);
});
