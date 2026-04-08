#!/usr/bin/env node
/**
 * WireGuard End-to-End Test — REQUIRES ADMIN
 *
 * Run: cscript run-admin.vbs test-wireguard.mjs
 * Or:  (from admin terminal) node test-wireguard.mjs
 *
 * Tests: setup → wallet → connect via WireGuard → verify IP → disconnect
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Admin Check ─────────────────────────────────────────────────────────────

function isAdmin() {
  try { execSync('net session', { stdio: 'pipe' }); return true; }
  catch { return false; }
}

if (!isAdmin()) {
  console.error('\n  ERROR: This test requires Administrator privileges.');
  console.error('  Run: cscript run-admin.vbs test-wireguard.mjs\n');
  process.exit(1);
}

// ─── Load Mnemonic ───────────────────────────────────────────────────────────

function loadMnemonic() {
  const paths = [
    resolve(__dirname, '.env'),
    resolve(__dirname, '..', '..', 'sentinel-node-tester', '.env'),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, 'utf-8');
      // Match MNEMONIC= followed by actual words (not comments or empty)
      const match = content.match(/^MNEMONIC\s*=\s*([a-z][\sa-z]+)$/m);
      if (match && match[1].trim().split(/\s+/).length >= 12) return match[1].trim();
    } catch { /* try next */ }
  }
  throw new Error('No MNEMONIC found in any .env file');
}

// ─── Logging ─────────────────────────────────────────────────────────────────

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const INFO = '\x1b[36mINFO\x1b[0m';

function test(name, passed, detail) {
  console.log(`  ${passed ? PASS : FAIL} ${name}${detail ? ' — ' + detail : ''}`);
  return passed;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('\x1b[1m  Sentinel AI Path — WireGuard Test (Admin)\x1b[0m');
  console.log('  ' + '═'.repeat(50));
  console.log('');

  // Import SDK — use pathToFileURL for Windows ESM compatibility
  const sdk = await import(pathToFileURL(resolve(__dirname, '..', 'js-sdk', 'index.js')).href);
  const { getEnvironment } = await import(pathToFileURL(resolve(__dirname, 'environment.js')).href);

  // Environment check
  const env = getEnvironment();
  test('Admin privileges', true, 'elevated');
  test('V2Ray available', env.v2ray.available, env.v2ray.version);
  test('WireGuard available', env.wireguard.available, env.wireguard.path);

  if (!env.wireguard.available) {
    console.log(`\n  ${FAIL} WireGuard not installed. Run: cscript run-admin.vbs setup.js`);
    process.exit(1);
  }

  // Connect via WireGuard
  const mnemonic = loadMnemonic();
  sdk.registerCleanupHandlers();

  console.log(`\n  ${INFO} Connecting via WireGuard (real P2P, real node)...`);
  const startTime = Date.now();

  try {
    const conn = await sdk.connectAuto({
      mnemonic,
      serviceType: 'wireguard',
      maxAttempts: 3,
      onProgress: (step, detail) => {
        console.log(`    \x1b[2m[${step}] ${detail}\x1b[0m`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    test('WireGuard connected', true, `session=${conn.sessionId} in ${elapsed}s`);

    // Verify IP
    console.log(`\n  ${INFO} Verifying tunnel...`);
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      test('IP through WireGuard', !!data.ip, data.ip);
    } catch (err) {
      test('IP through WireGuard', false, err.message);
    }

    // Check status
    const st = sdk.getStatus();
    test('Protocol is wireguard', st?.serviceType === 'wireguard' || st?.serviceType === 2, st?.serviceType);
    test('isConnected()', sdk.isConnected(), 'yes');

    // Speed check (simple — just one request)
    console.log(`\n  ${INFO} Quick speed check...`);
    try {
      const t0 = Date.now();
      const res = await fetch('https://speed.cloudflare.com/__down?bytes=1000000', { signal: AbortSignal.timeout(15000) });
      await res.arrayBuffer();
      const ms = Date.now() - t0;
      const mbps = ((1000000 * 8) / (ms / 1000) / 1000000).toFixed(1);
      test('Speed test', parseFloat(mbps) > 0.5, `${mbps} Mbps (1MB download in ${ms}ms)`);
    } catch (err) {
      test('Speed test', false, err.message);
    }

    // Disconnect
    console.log(`\n  ${INFO} Disconnecting...`);
    await sdk.disconnect();
    test('Disconnected', !sdk.isConnected(), 'tunnel down');

  } catch (err) {
    test('WireGuard connected', false, err.message);
    if (err.details) console.log('  Details:', JSON.stringify(err.details, null, 2));
    try { await sdk.disconnect(); } catch { /* best effort */ }
  }

  console.log('');
  console.log('  ' + '═'.repeat(50));
  console.log('  Done.');
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error(`\n  FATAL: ${err.message}\n`);
  process.exit(1);
});
