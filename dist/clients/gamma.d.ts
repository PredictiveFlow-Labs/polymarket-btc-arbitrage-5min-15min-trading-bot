import type { GammaMarket, ParsedMarket, MarketWindow } from '../types/index';
export declare class GammaClient {
    private readonly log;
    fetchMarkets(limit?: number): Promise<GammaMarket[]>;
    discoverFastMarkets(asset: string, windows: MarketWindow[]): Promise<ParsedMarket[]>;
    parseMarket(raw: GammaMarket, window: MarketWindow): ParsedMarket | null;
    private extractEndTime;
    private parsePrices;
    private parseTokenIds;
}
//# sourceMappingURL=gamma.d.ts.map