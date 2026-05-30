import type { ExecutionClient, SimmerPortfolio, SimmerTradeResponse, TradePlacementContext } from '../types/index';
export declare class PolymarketClobClient implements ExecutionClient {
    private readonly host;
    private readonly privateKey;
    /** Same values as Polymarket `SignatureType` enum: 0 = EOA, 1 = proxy, 2 = Gnosis Safe */
    private readonly signatureType;
    private readonly funderAddress?;
    private readonly log;
    private clob;
    private clobMod;
    private initPromise;
    constructor(host: string, privateKey: string, 
    /** Same values as Polymarket `SignatureType` enum: 0 = EOA, 1 = proxy, 2 = Gnosis Safe */
    signatureType: number, funderAddress?: string | undefined);
    /** ESM-only package: load via dynamic import so Node can execute it from CJS output. */
    private getClobModule;
    private ensureClob;
    importMarket(_slug: string): Promise<void>;
    getPortfolio(): Promise<SimmerPortfolio>;
    placeTrade(marketId: string, side: 'YES' | 'NO', amount: number, dryRun: boolean, ctx?: TradePlacementContext): Promise<SimmerTradeResponse>;
    cancelOrder(orderId: string): Promise<void>;
}
//# sourceMappingURL=polymarket-clob.d.ts.map