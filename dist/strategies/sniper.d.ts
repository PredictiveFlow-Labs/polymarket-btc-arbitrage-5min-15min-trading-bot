import type { ParsedMarket, BtcPriceSnapshot, BtcPriceState, SniperSignal, SignalRejectReason, ActivePosition, SniperConfig, TradeRecord, ExecutionClient } from '../types/index';
import { RiskManager } from '../risk/manager';
export type SignalResult = {
    ok: true;
    signal: SniperSignal;
} | {
    ok: false;
    reason: SignalRejectReason;
};
export declare class SniperStrategy {
    private readonly config;
    private readonly execution;
    private readonly risk;
    private readonly log;
    private readonly priceStates;
    private readonly openPrices;
    private readonly pendingOrders;
    private readonly completedTrades;
    private lastBtcPrice;
    constructor(config: SniperConfig, execution: ExecutionClient, risk: RiskManager);
    onBtcPrice(snapshot: BtcPriceSnapshot): void;
    registerMarket(market: ParsedMarket): void;
    unregisterMarket(marketId: string): void;
    evaluateSignal(market: ParsedMarket): SignalResult;
    executeSignal(signal: SniperSignal, market: ParsedMarket): Promise<ActivePosition | null>;
    private cancelIfStale;
    closeBeforeExpiry(position: ActivePosition, market: ParsedMarket): Promise<void>;
    settlePosition(marketId: string, btcFinalPrice: number, openBtcPrice: number): Promise<void>;
    private recordTrade;
    getCompletedTrades(): TradeRecord[];
    getCurrentBtcPrice(): number;
    getPriceState(marketId: string): BtcPriceState | undefined;
}
//# sourceMappingURL=sniper.d.ts.map