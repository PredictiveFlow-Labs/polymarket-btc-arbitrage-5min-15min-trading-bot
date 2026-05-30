import type { BtcPriceSnapshot } from '../types/index';
export type PriceHandler = (snapshot: BtcPriceSnapshot) => void;
export declare class BinanceWsClient {
    private readonly wsUrl;
    private readonly symbol;
    private ws;
    private readonly handlers;
    private readonly log;
    private reconnectTimer;
    private isShuttingDown;
    private pingTimer;
    constructor(wsUrl: string, symbol: string);
    start(): void;
    stop(): void;
    onPrice(handler: PriceHandler): () => void;
    private connect;
    private startPing;
    private scheduleReconnect;
}
//# sourceMappingURL=binance.d.ts.map