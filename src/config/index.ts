import dotenv from 'dotenv';
import type { SniperConfig, SignalStrength, MarketWindow } from '../types/index';

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function parseBoolEnv(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v == null || v === '') return defaultVal;
  const s = v.toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

export interface AppEnv {
  privateKey: string;
  walletAddress: string;
  /** When true, orders go through Simmer; when false, Polymarket CLOB (wallet). */
  useSimmerApi: boolean;
  simmerApiKey: string;
  simmerBaseUrl: string;
  polymarketClobHost: string;
  polymarketSignatureType: number;
  polymarketFunderAddress: string | undefined;
  binanceWsUrl: string;
  binanceSymbol: string;
  analyticsFile: string;
}

export function loadEnv(): AppEnv {
  const privateKey = requireEnv('PRIVATE_KEY');
  const walletAddress = requireEnv('WALLET_ADDRESS');
  const useSimmerApi = parseBoolEnv('USE_SIMMER_API', true);

  // Normalise: ensure 0x prefix
  const normPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const normWallet = walletAddress.startsWith('0x') ? walletAddress : `0x${walletAddress}`;

  const simmerApiKey = useSimmerApi ? requireEnv('SIMMER_API_KEY') : optionalEnv('SIMMER_API_KEY', '');

  const sigRaw = parseInt(optionalEnv('POLYMARKET_SIGNATURE_TYPE', '0'), 10);
  if (sigRaw < 0 || sigRaw > 2) {
    throw new Error('POLYMARKET_SIGNATURE_TYPE must be 0 (EOA), 1 (POLY_PROXY), or 2 (POLY_GNOSIS_SAFE)');
  }

  const funder = optionalEnv('POLYMARKET_FUNDER_ADDRESS', '').trim();

  return {
    privateKey: normPrivateKey,
    walletAddress: normWallet,
    useSimmerApi,
    simmerApiKey,
    simmerBaseUrl: optionalEnv('SIMMER_API_BASE', 'https://api.simmer.markets'),
    polymarketClobHost: optionalEnv('POLYMARKET_CLOB_HOST', 'https://clob.polymarket.com'),
    polymarketSignatureType: sigRaw,
    polymarketFunderAddress: funder.length > 0 ? funder : undefined,
    binanceWsUrl: optionalEnv('BINANCE_WS_URL', 'wss://stream.binance.com:9443/ws'),
    binanceSymbol: optionalEnv('BINANCE_SYMBOL', 'btcusdt'),
    analyticsFile: optionalEnv('ANALYTICS_FILE', './sniper-trades.jsonl'),
  };
}

export function loadConfig(): SniperConfig {
  const windows = (optionalEnv('MARKET_WINDOWS', '5m,15m').split(',') as MarketWindow[]);

  return {
    entryWindowSecs: parseInt(optionalEnv('ENTRY_WINDOW_SECS', '45'), 10),
    sustainedMoveSecs: parseInt(optionalEnv('SUSTAINED_MOVE_SECS', '10'), 10),
    exitBeforeExpirySecs: parseInt(optionalEnv('EXIT_BEFORE_EXPIRY_SECS', '5'), 10),

    minMovePct: parseFloat(optionalEnv('MIN_MOVE_PCT', '0.20')),
    yesMaxForBuyYes: parseFloat(optionalEnv('YES_MAX_FOR_BUY_YES', '0.72')),
    yesMinForBuyNo: parseFloat(optionalEnv('YES_MIN_FOR_BUY_NO', '0.30')),

    maxSpread: parseFloat(optionalEnv('MAX_SPREAD', '0.03')),
    minLiquidity: parseFloat(optionalEnv('MIN_LIQUIDITY', '50')),

    limitOrderTtlMs: parseInt(optionalEnv('LIMIT_ORDER_TTL_MS', '2000'), 10),
    aggressiveFillThreshold: optionalEnv('AGGRESSIVE_FILL_THRESHOLD', 'HIGH') as SignalStrength,

    maxOpenPositions: parseInt(optionalEnv('MAX_OPEN_POSITIONS', '1'), 10),
    dailyStopLossPct: parseFloat(optionalEnv('DAILY_STOP_LOSS_PCT', '0.10')),
    baseBetPct: parseFloat(optionalEnv('BASE_BET_PCT', '0.02')),
    maxBetPct: parseFloat(optionalEnv('MAX_BET_PCT', '0.05')),

    windows,
    asset: optionalEnv('ASSET', 'BTC'),
    pollIntervalMs: parseInt(optionalEnv('POLL_INTERVAL_MS', '2000'), 10),

    dryRun: optionalEnv('DRY_RUN', 'false') === 'true',
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
  };
}
