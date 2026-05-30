export type MarketWindow = '5m' | '15m';
export type TradeSide = 'YES' | 'NO';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'STALE';
export type PositionStatus = 'OPEN' | 'CLOSED' | 'EXPIRED';
export type SignalStrength = 'WEAK' | 'MODERATE' | 'HIGH';
export interface GammaMarket {
    id: string;
    question: string;
    slug: string;
    closed: boolean;
    endDate: string;
    bestBid?: number;
    bestAsk?: number;
    volume?: number;
    liquidity?: number;
    outcomePrices?: string;
    outcomes?: string;
    tokenIds?: string[];
    tags?: Array<{
        id: string;
        label: string;
    }>;
}
export interface ParsedMarket {
    id: string;
    question: string;
    slug: string;
    window: MarketWindow;
    endTime: Date;
    remainingSecs: number;
    yesPrice: number;
    noPrice: number;
    spread: number;
    liquidity: number;
    volume: number;
    yesTokenId: string;
    noTokenId: string;
}
export interface BtcPriceSnapshot {
    price: number;
    timestamp: number;
}
export interface BtcPriceState {
    current: number;
    openPrice: number;
    movePct: number;
    sustainedSinceMs: number | null;
    history: BtcPriceSnapshot[];
}
export interface SniperSignal {
    marketId: string;
    slug: string;
    side: TradeSide;
    strength: SignalStrength;
    yesPrice: number;
    spread: number;
    movePct: number;
    sustainedMs: number;
    timestamp: number;
    reason: string;
}
export type SignalRejectReason = 'TOO_EARLY' | 'INSUFFICIENT_MOVE' | 'MOVE_NOT_SUSTAINED' | 'SPREAD_TOO_WIDE' | 'LOW_LIQUIDITY' | 'PRICE_THRESHOLD_MISS' | 'DUPLICATE_POSITION' | 'MAX_POSITIONS_REACHED' | 'DAILY_LOSS_LIMIT' | 'NO_ACTIVE_MARKET';
export interface PlaceOrderRequest {
    marketId: string;
    side: TradeSide;
    amount: number;
    price?: number;
    isAggressive: boolean;
}
export interface PlaceOrderResponse {
    orderId: string;
    marketId: string;
    side: TradeSide;
    amount: number;
    price: number;
    status: OrderStatus;
    createdAt: number;
    filledAt?: number;
    txHash?: string;
}
export interface SimmerTradeRequest {
    market_id: string;
    side: 'YES' | 'NO';
    amount: number;
    venue: 'polymarket';
    source: string;
    wallet_address?: string;
}
export interface SimmerTradeResponse {
    id: string;
    status: string;
    market_id: string;
    side: string;
    amount: number;
    price?: number;
    tx_hash?: string;
    error?: string;
}
/** Token IDs and prices from Gamma (required for Polymarket CLOB execution). */
export interface TradePlacementContext {
    slug: string;
    yesTokenId: string;
    noTokenId: string;
    yesPrice: number;
    noPrice: number;
}
/** Routes orders through Simmer or directly via Polymarket CLOB. */
export interface ExecutionClient {
    importMarket(slug: string): Promise<void>;
    placeTrade(marketId: string, side: 'YES' | 'NO', amount: number, dryRun: boolean, ctx?: TradePlacementContext): Promise<SimmerTradeResponse>;
    cancelOrder(orderId: string): Promise<void>;
    getPortfolio(): Promise<SimmerPortfolio>;
}
export interface SimmerImportRequest {
    polymarket_url: string;
}
export interface SimmerMarket {
    id: string;
    slug: string;
    question: string;
    yes_price: number;
    no_price: number;
    liquidity: number;
}
export interface SimmerPortfolio {
    balance: number;
    equity: number;
    positions: SimmerPosition[];
}
export interface SimmerPosition {
    market_id: string;
    side: string;
    shares: number;
    avg_price: number;
    current_price: number;
    pnl: number;
}
export interface ActivePosition {
    id: string;
    marketId: string;
    slug: string;
    side: TradeSide;
    amount: number;
    entryPrice: number;
    currentPrice: number;
    openedAt: number;
    expiresAt: number;
    status: PositionStatus;
    orderId: string;
    pnl?: number;
    closedAt?: number;
}
export interface RiskState {
    bankroll: number;
    dailyPnl: number;
    dailyTrades: number;
    openPositions: number;
    dailyStopHit: boolean;
    lastResetDate: string;
}
export interface PositionSizeResult {
    amount: number;
    pct: number;
    reason: string;
}
export interface TradeRecord {
    id: string;
    marketId: string;
    slug: string;
    window: MarketWindow;
    side: TradeSide;
    entryPrice: number;
    exitPrice?: number;
    amount: number;
    pnl?: number;
    won?: boolean;
    openedAt: number;
    closedAt?: number;
    holdMs?: number;
    signalStrength: SignalStrength;
    movePct: number;
    minuteBucket: number;
}
export interface MinuteBucketStats {
    bucket: number;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    avgPnl: number;
}
export interface DashboardSnapshot {
    asOf: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    roi: number;
    avgHoldMs: number;
    avgHoldSec: number;
    bankroll: number;
    dailyPnl: number;
    byMinuteBucket: MinuteBucketStats[];
    bySignalStrength: Record<SignalStrength, {
        trades: number;
        wins: number;
        pnl: number;
    }>;
    recentTrades: TradeRecord[];
}
export interface SniperConfig {
    entryWindowSecs: number;
    sustainedMoveSecs: number;
    exitBeforeExpirySecs: number;
    minMovePct: number;
    yesMaxForBuyYes: number;
    yesMinForBuyNo: number;
    maxSpread: number;
    minLiquidity: number;
    limitOrderTtlMs: number;
    aggressiveFillThreshold: SignalStrength;
    maxOpenPositions: number;
    dailyStopLossPct: number;
    baseBetPct: number;
    maxBetPct: number;
    windows: MarketWindow[];
    asset: string;
    pollIntervalMs: number;
    dryRun: boolean;
    logLevel: string;
}
//# sourceMappingURL=index.d.ts.map