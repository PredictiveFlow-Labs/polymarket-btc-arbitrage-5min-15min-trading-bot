import { loadEnv, loadConfig } from './config/index';
import { GammaClient } from './clients/gamma';
import { SimmerClient } from './clients/simmer';
import { PolymarketClobClient } from './clients/polymarket-clob';
import { BinanceWsClient } from './clients/binance';
import { RiskManager } from './risk/manager';
import { SniperStrategy } from './strategies/sniper';
import { AnalyticsDashboard } from './analytics/dashboard';
import type { ExecutionClient, ParsedMarket } from './types/index';
import { logger } from 'emojiprint-logger';

// ─────────────────────────────────────────────────────────────────────────────

const procLog = {
  info: (msg = '') => console.log(msg),
  warn: (msg = '') => console.log(msg),
  error: (msg = '') => console.log(msg),
};

const importantLog = {
  info: (msg = '') => logger.info(msg),
  warn: (msg = '') => logger.warn(msg),
  error: (msg = '') => logger.error(msg),
};

function printBanner(): void {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║     POLYMARKET LAST-MINUTE SNIPER  v1.0.0            ║');
  console.log('  ║     BTC Fast-Market Expiry Bot  |  High Frequency    ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
}

async function main(): Promise<void> {
  printBanner();

  // ── Config & env ───────────────────────────────────────────────────────────
  let env: ReturnType<typeof loadEnv>;
  let config: ReturnType<typeof loadConfig>;

  try {
    env = loadEnv();
    config = loadConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    importantLog.error(`  [CONFIG ERROR] ${msg}`);
    importantLog.error('  Make sure you have a .env file (copy .env.example → .env) and fill in all required values.');
    process.exit(1);
  }

  // Use console for processing logs; emoji logger only for important notes/warnings.
  const log = procLog;
  const note = importantLog;

  // ── Startup status report ──────────────────────────────────────────────────
  const walletShort = `${env.walletAddress.slice(0, 6)}...${env.walletAddress.slice(-4)}`;
  const keyLoaded   = env.privateKey.length > 10 ? 'loaded ✓' : 'MISSING ✗';

  note.warn(`  Wallet       : ${walletShort}`);
  note.warn(`  Private key  : ${keyLoaded}`);
  log.info(`  Mode         : ${config.dryRun ? 'DRY RUN (paper trading – no real orders)' : 'LIVE (real funds)'}`);
  log.info(
    `  Execution    : ${env.useSimmerApi ? 'Simmer API' : 'Polymarket CLOB (direct wallet)'}`
  );
  log.info(`  Markets      : BTC ${config.windows.join(', ')} fast markets`);
  log.info(`  Entry window : last ${config.entryWindowSecs}s before expiry`);
  log.info(`  Min BTC move : ${config.minMovePct}%  sustained ${config.sustainedMoveSecs}s`);
  log.info(`  Max bet      : ${(config.maxBetPct * 100).toFixed(0)}% of bankroll`);
  log.info(`  Daily stop   : ${(config.dailyStopLossPct * 100).toFixed(0)}% loss limit`);
  log.info('');

  if (config.dryRun) {
    note.warn('  DRY RUN – all trades are simulated, no real money moves.');
  } else {
    note.warn(`  LIVE MODE – trading with real funds from wallet ${walletShort}`);
  }
  log.info('');

  // ── Clients ────────────────────────────────────────────────────────────────
  const gamma = new GammaClient();

  const execution: ExecutionClient = env.useSimmerApi
    ? new SimmerClient(env.simmerApiKey, env.simmerBaseUrl, env.privateKey, env.walletAddress)
    : new PolymarketClobClient(
        env.polymarketClobHost,
        env.privateKey,
        env.polymarketSignatureType,
        env.polymarketFunderAddress
      );

  const binanceWs = new BinanceWsClient(env.binanceWsUrl, env.binanceSymbol);

  // ── Fetch bankroll ─────────────────────────────────────────────────────────
  let bankroll = 1000;
  log.info(
    env.useSimmerApi
      ? '  Connecting to Simmer API for portfolio...'
      : '  Connecting to Polymarket CLOB for USDC balance...'
  );
  try {
    const portfolio = await execution.getPortfolio();
    bankroll = portfolio.balance ?? 1000;
    log.info(`  Bankroll     : $${bankroll.toFixed(2)} ✓`);
  } catch {
    note.warn(`  Bankroll     : could not fetch – using default $${bankroll.toFixed(2)}`);
  }
  log.info('');

  // ── Core modules ──────────────────────────────────────────────────────────
  const riskManager = new RiskManager(config, bankroll);
  const strategy    = new SniperStrategy(config, execution, riskManager);
  const dashboard   = new AnalyticsDashboard(env.analyticsFile);

  const activeMarkets: Map<string, ParsedMarket> = new Map();

  // ── Binance BTC price feed ─────────────────────────────────────────────────
  log.info('  Connecting to Binance WebSocket (BTCUSDT)...');
  let btcConnected = false;
  binanceWs.onPrice((snapshot) => {
    if (!btcConnected) {
      log.info(`  BTC price    : $${snapshot.price.toLocaleString()} – live feed active ✓`);
      btcConnected = true;
    }
    strategy.onBtcPrice(snapshot);
  });
  binanceWs.start();

  // ── Market discovery ───────────────────────────────────────────────────────
  async function discoverMarkets(): Promise<void> {
    try {
      const markets = await gamma.discoverFastMarkets(config.asset, config.windows);

      if (markets.length === 0) {
        // quiet when nothing is found (avoid noisy logs)
        return;
      }

      for (const m of markets) {
        if (!activeMarkets.has(m.id)) {
          log.info(
            `  New market   : [${m.window}] ${m.slug}  – expires in ${m.remainingSecs}s` +
            `  YES=${m.yesPrice.toFixed(3)}  spread=${m.spread.toFixed(3)}`
          );
          strategy.registerMarket(m);
        }
        activeMarkets.set(m.id, m);
      }

      // Prune expired
      const now = Date.now();
      for (const [id, m] of activeMarkets) {
        if (m.endTime.getTime() < now - 60_000) {
          log.info(`  Pruned       : ${m.slug} (expired)`);
          strategy.unregisterMarket(id);
          activeMarkets.delete(id);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      note.warn(`  Market discovery failed: ${msg} – will retry`);
    }
  }

  // ── Sniper evaluation ──────────────────────────────────────────────────────
  async function evaluateMarkets(): Promise<void> {
    const now = Date.now();

    for (const [, market] of activeMarkets) {
      const remainingSecs = (market.endTime.getTime() - now) / 1000;
      if (remainingSecs > config.entryWindowSecs || remainingSecs <= 0) continue;

      const openPos = riskManager.getPosition(market.id);

      if (openPos && remainingSecs <= config.exitBeforeExpirySecs) {
        log.info(`  Pre-exit     : closing position on ${market.slug} (${remainingSecs.toFixed(1)}s left)`);
        await strategy.closeBeforeExpiry(openPos, market);
        continue;
      }

      if (openPos && remainingSecs <= 0) {
        const priceState = strategy.getPriceState(market.id);
        const btcOpen = priceState?.openPrice ?? 0;
        const btcNow  = strategy.getCurrentBtcPrice();
        await strategy.settlePosition(market.id, btcNow, btcOpen);
        continue;
      }

      const result = strategy.evaluateSignal(market);

      if (!result.ok) {
        continue;
      }

      const { signal } = result;
      log.info(
        `  SIGNAL      : ${signal.side}  [${signal.strength}]  ` +
        `move=${signal.movePct > 0 ? '+' : ''}${signal.movePct.toFixed(3)}%  ` +
        `held=${( signal.sustainedMs / 1000).toFixed(1)}s  ` +
        `YES=${signal.yesPrice.toFixed(3)}  ` +
        `${remainingSecs.toFixed(1)}s left`
      );

      const position = await strategy.executeSignal(signal, market);
      if (position) {
        log.info(
          `  TRADE       : BUY ${position.side}  $${position.amount}  ` +
          `@ ${position.entryPrice.toFixed(3)}  market=${market.slug}`
        );
      }
    }
  }

  // ── Analytics print ────────────────────────────────────────────────────────
  function printAnalytics(): void {
    const snap = dashboard.snapshot(riskManager.getState());
    dashboard.printDashboard(snap);
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  log.info('  Scanning for markets... (Ctrl+C to stop)');
  log.info('');

  await discoverMarkets();

  const discoveryTimer = setInterval(discoverMarkets, config.pollIntervalMs * 5);
  const evalTimer      = setInterval(evaluateMarkets, config.pollIntervalMs);
  const analyticsTimer = setInterval(printAnalytics,  60_000);

  await evaluateMarkets();

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  function shutdown(signal: string): void {
    log.info('');
    note.warn(`  Shutdown received (${signal}) – closing gracefully...`);
    clearInterval(discoveryTimer);
    clearInterval(evalTimer);
    clearInterval(analyticsTimer);
    binanceWs.stop();

    const snap = dashboard.snapshot(riskManager.getState());
    dashboard.printDashboard(snap);

    note.warn('  Bot stopped. Goodbye.');
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  importantLog.error('');
  importantLog.error(`  [FATAL] Bot crashed: ${msg}`);
  importantLog.error('  Check your .env file and network connection.');
  process.exit(1);
});
