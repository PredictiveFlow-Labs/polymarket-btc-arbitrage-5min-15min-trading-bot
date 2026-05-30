import type { SniperConfig } from '../types/index';
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
export declare function loadEnv(): AppEnv;
export declare function loadConfig(): SniperConfig;
//# sourceMappingURL=index.d.ts.map