/**
 * Sentinel AI Path — Zero-Config VPN Connection
 *
 * One function call: await connect({ mnemonic }) -> connected
 *
 * This module wraps the full Sentinel SDK into the simplest possible
 * interface for AI agents. No config files, no setup — just connect.
 *
 * AGENT FLOW (7 steps, each logged):
 *   STEP 1/7  Environment — check OS, V2Ray, WireGuard, admin
 *   STEP 2/7  Wallet — derive address, connect to chain
 *   STEP 3/7  Balance — verify sufficient P2P before paying
 *   STEP 4/7  Node — select + validate target node
 *   STEP 5/7  Session — broadcast TX, create on-chain session
 *   STEP 6/7  Tunnel — handshake + install WireGuard/V2Ray
 *   STEP 7/7  Verify — confirm IP changed, traffic flows
 *
 * ARCHITECTURE: Split into focused modules (2026-04-07):
 *   connect.js          — This file: orchestrator + re-exports (~200 lines)
 *   connect-helpers.js  — Constants, state, logging, IP check, error mapping
 *   connect-session.js  — Stage 4-6: node selection, SDK options, tunnel setup
 *   connect-verify.js   — Stage 7: verify(), verifySplitTunnel(), isVpnActive()
 *   connect-status.js   — status(), disconnect(), onEvent()
 */

import { AiPathError, AiPathErrorCodes, NextActions } from './errors.js';
import {
  createWallet as sdkCreateWallet,
  formatP2P,
} from '../js-sdk/index.js';

// ─── Import from split modules ──────────────────────────────────────────────

import {
  agentLog,
  ensureCleanup,
  ensureAxiosAdapter,
  checkVpnIp,
  humanError,
  preValidateBalance,
  MIN_BALANCE_UDVPN,
  setLastConnectResult,
  setConnectedAt,
  setConnectTimings,
} from './connect-helpers.js';

import {
  resolveNode,
  buildSdkOptions,
  executeConnection,
  buildConnectResult,
} from './connect-session.js';

// ─── Re-export public API from split modules ────────────────────────────────

export { isVpnActive, verify, verifySplitTunnel } from './connect-verify.js';
export { disconnect, status, onEvent } from './connect-status.js';

// ─── connect() ───────────────────────────────────────────────────────────────

/**
 * Connect to Sentinel dVPN. The ONE function an AI agent needs.
 *
 * Every step is logged with numbered phases (STEP 1/7 through STEP 7/7)
 * so an autonomous agent can track progress and diagnose failures.
 *
 * @param {object} opts
 * @param {string} opts.mnemonic - BIP39 mnemonic (12 or 24 words)
 * @param {string} [opts.country] - Preferred country code (e.g. 'US', 'DE')
 * @param {string} [opts.nodeAddress] - Specific node (sentnode1...). Skips auto-pick.
 * @param {string} [opts.dns] - DNS preset: 'google', 'cloudflare', 'hns'
 * @param {string} [opts.protocol] - Preferred protocol: 'wireguard' or 'v2ray'
 * @param {function} [opts.onProgress] - Progress callback: (stage, message) => void
 * @param {number} [opts.timeout] - Connection timeout in ms (default: 120000 — 2 minutes)
 * @param {boolean} [opts.silent] - If true, suppress step-by-step console output
 * @returns {Promise<{
 *   sessionId: string,
 *   protocol: string,
 *   nodeAddress: string,
 *   country: string|null,
 *   city: string|null,
 *   moniker: string|null,
 *   socksPort: number|null,
 *   socksAuth: object|null,
 *   dryRun: boolean,
 *   ip: string|null,
 *   walletAddress: string,
 *   balance: { before: string, after: string|null },
 *   cost: { estimated: string },
 *   timing: { totalMs: number, phases: object },
 * }>}
 */
export async function connect(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    throw new AiPathError(AiPathErrorCodes.INVALID_OPTIONS, 'connect() requires an options object with at least { mnemonic }', null, NextActions.NONE);
  }
  if (!opts.mnemonic || typeof opts.mnemonic !== 'string') {
    throw new AiPathError(AiPathErrorCodes.MISSING_MNEMONIC, 'connect() requires a mnemonic string (12 or 24 word BIP39 phrase)', null, NextActions.CREATE_WALLET);
  }

  const silent = opts.silent === true;
  const log = silent ? () => {} : agentLog;
  const totalSteps = 7;
  const timings = {};
  const connectStart = Date.now();

  // ── STEP 1/7: Environment ─────────────────────────────────────────────────

  let t0 = Date.now();
  log(1, totalSteps, 'ENVIRONMENT', 'Checking OS, tunnel binaries, admin privileges...');

  await ensureAxiosAdapter();
  ensureCleanup();

  // Detect environment for agent visibility
  let envInfo = { os: process.platform, admin: false, v2ray: false, wireguard: false };
  try {
    const { getEnvironment } = await import('./environment.js');
    const env = getEnvironment();
    envInfo = {
      os: env.os,
      admin: env.admin,
      v2ray: env.v2ray?.available || false,
      wireguard: env.wireguard?.available || false,
      v2rayPath: env.v2ray?.path || null,
    };
  } catch { /* environment detection failed */ }

  log(1, totalSteps, 'ENVIRONMENT', `OS=${envInfo.os} | admin=${envInfo.admin} | v2ray=${envInfo.v2ray} | wireguard=${envInfo.wireguard}`);
  timings.environment = Date.now() - t0;

  // ── STEP 2/7: Wallet ──────────────────────────────────────────────────────

  t0 = Date.now();
  log(2, totalSteps, 'WALLET', 'Deriving wallet address from mnemonic...');

  let walletAddress = null;
  try {
    const { account } = await sdkCreateWallet(opts.mnemonic);
    walletAddress = account.address;
    log(2, totalSteps, 'WALLET', `Address: ${walletAddress}`);
  } catch (err) {
    log(2, totalSteps, 'WALLET', `Failed: ${err.message}`);
    throw new AiPathError(AiPathErrorCodes.INVALID_MNEMONIC, 'Invalid mnemonic — wallet derivation failed', null, NextActions.CREATE_WALLET);
  }
  timings.wallet = Date.now() - t0;

  // ── STEP 3/7: Balance Pre-Check ───────────────────────────────────────────

  t0 = Date.now();
  log(3, totalSteps, 'BALANCE', `Checking balance for ${walletAddress}...`);

  const balCheck = await preValidateBalance(opts.mnemonic);
  log(3, totalSteps, 'BALANCE', `Balance: ${balCheck.p2p} | Sufficient: ${balCheck.sufficient}`);

  if (!balCheck.sufficient && !opts.dryRun) {
    throw new AiPathError(
      AiPathErrorCodes.INSUFFICIENT_BALANCE,
      `Insufficient balance: ${balCheck.p2p}. Need at least ${formatP2P(MIN_BALANCE_UDVPN)}. Fund address: ${walletAddress}`,
      { address: walletAddress, balance: balCheck.p2p, minimum: formatP2P(MIN_BALANCE_UDVPN) },
      NextActions.FUND_WALLET,
    );
  }
  timings.balance = Date.now() - t0;

  // ── STEP 4/7: Node Selection ──────────────────────────────────────────────

  t0 = Date.now();

  const { resolvedNodeAddress, discoveredNode } = await resolveNode(opts, envInfo, log, totalSteps);

  timings.nodeSelection = Date.now() - t0;

  // ── STEP 5/7 + 6/7: Session + Tunnel ──────────────────────────────────────

  t0 = Date.now();
  log(5, totalSteps, 'SESSION', 'Broadcasting session transaction...');

  const { sdkOpts, timeoutId } = buildSdkOptions(opts, envInfo, silent, totalSteps);

  try {
    const result = await executeConnection(sdkOpts, resolvedNodeAddress, discoveredNode);

    timings.sessionAndTunnel = Date.now() - t0;

    // ── STEP 7/7: Verify ──────────────────────────────────────────────────

    t0 = Date.now();
    log(7, totalSteps, 'VERIFY', 'Checking VPN IP through tunnel...');

    const ip = await checkVpnIp(result.socksPort || null);
    log(7, totalSteps, 'VERIFY', ip ? `VPN IP: ${ip}` : 'IP check failed (tunnel may still work)');

    timings.verify = Date.now() - t0;
    timings.total = Date.now() - connectStart;

    // ── Build result ──────────────────────────────────────────────────────

    const output = await buildConnectResult(
      result, resolvedNodeAddress, discoveredNode,
      walletAddress, balCheck, opts.mnemonic, timings, ip,
    );

    setLastConnectResult(output);
    setConnectedAt(Date.now());
    setConnectTimings(timings);

    // ── Final summary ──────────────────────────────────────────────────

    log(7, totalSteps, 'COMPLETE', [
      `Session=${output.sessionId}`,
      `Protocol=${output.protocol}`,
      `Node=${output.nodeAddress}`,
      output.country ? `Country=${output.country}` : null,
      `IP=${output.ip || 'unknown'}`,
      `Time=${output.timing.totalFormatted}`,
      `Balance=${output.balance.before} → ${output.balance.after || '?'}`,
    ].filter(Boolean).join(' | '));

    return output;
  } catch (err) {
    timings.total = Date.now() - connectStart;
    const { message, nextAction } = humanError(err);
    const wrapped = new AiPathError(
      err?.code || 'CONNECT_FAILED',
      message,
      { ...(err?.details || {}), timing: { totalMs: timings.total, phases: { ...timings } } },
      nextAction,
    );

    log(5, totalSteps, 'FAILED', `${wrapped.code}: ${message} → nextAction: ${nextAction}`);
    throw wrapped;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
