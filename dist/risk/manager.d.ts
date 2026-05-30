import type { RiskState, ActivePosition, PositionSizeResult, SniperConfig, TradeSide, SignalStrength } from '../types/index';
export declare class RiskManager {
    private readonly config;
    private readonly log;
    private state;
    private readonly openPositions;
    constructor(config: SniperConfig, initialBankroll: number);
    tick(): void;
    canTrade(marketId: string): {
        ok: boolean;
        reason?: string;
    };
    sizePosition(strength: SignalStrength): PositionSizeResult;
    openPosition(position: ActivePosition): void;
    closePosition(marketId: string, exitPrice: number): ActivePosition | null;
    expirePosition(marketId: string, won: boolean): ActivePosition | null;
    private calculatePnl;
    getState(): Readonly<RiskState>;
    getOpenPositions(): ActivePosition[];
    getPosition(marketId: string): ActivePosition | undefined;
    updateBankroll(newBankroll: number): void;
    isOpenForMarket(marketId: string): boolean;
    classifySignalStrength(movePct: number, sustainedMs: number, side: TradeSide, yesPrice: number, minMovePct: number): SignalStrength;
    private todayStr;
}
//# sourceMappingURL=manager.d.ts.map