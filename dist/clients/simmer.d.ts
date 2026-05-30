import type { SimmerTradeResponse, SimmerMarket, SimmerPortfolio, SimmerPosition, TradePlacementContext, ExecutionClient } from '../types/index';
export declare class SimmerClient implements ExecutionClient {
    private readonly walletAddress?;
    private readonly http;
    private readonly log;
    /** Private key stored for future direct CLOB signing (currently routed via Simmer) */
    readonly privateKey: string | undefined;
    constructor(apiKey: string, baseUrl: string, privateKey?: string, walletAddress?: string | undefined);
    importMarket(slug: string): Promise<void>;
    getMarket(marketId: string): Promise<SimmerMarket>;
    placeTrade(marketId: string, side: 'YES' | 'NO', amount: number, dryRun: boolean, _ctx?: TradePlacementContext): Promise<SimmerTradeResponse>;
    getPortfolio(): Promise<SimmerPortfolio>;
    getPositions(): Promise<SimmerPosition[]>;
    cancelOrder(orderId: string): Promise<void>;
}
//# sourceMappingURL=simmer.d.ts.map