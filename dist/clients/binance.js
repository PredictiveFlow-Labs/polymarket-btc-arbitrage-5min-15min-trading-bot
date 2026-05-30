"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceWsClient = void 0;
const ws_1 = __importDefault(require("ws"));
const logger_1 = require("../utils/logger");
class BinanceWsClient {
    constructor(wsUrl, symbol) {
        this.wsUrl = wsUrl;
        this.symbol = symbol;
        this.ws = null;
        this.handlers = new Set();
        this.log = (0, logger_1.getLogger)().child({ module: 'BinanceWs' });
        this.reconnectTimer = null;
        this.isShuttingDown = false;
        this.pingTimer = null;
    }
    start() {
        this.isShuttingDown = false;
        this.connect();
    }
    stop() {
        this.isShuttingDown = true;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.pingTimer)
            clearInterval(this.pingTimer);
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        this.log.info('Binance WS stopped');
    }
    onPrice(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    connect() {
        const streamUrl = `${this.wsUrl}/${this.symbol}@trade`;
        this.log.info({ streamUrl }, 'connecting to Binance WebSocket');
        this.ws = new ws_1.default(streamUrl);
        this.ws.on('open', () => {
            this.log.info('Binance WS connected');
            this.startPing();
        });
        this.ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.e !== 'trade')
                    return;
                const price = parseFloat(msg.p);
                if (isNaN(price) || price <= 0)
                    return;
                const snapshot = { price, timestamp: msg.T };
                for (const h of this.handlers)
                    h(snapshot);
            }
            catch {
                // malformed message – ignore
            }
        });
        this.ws.on('error', (err) => {
            this.log.error({ err: err.message }, 'Binance WS error');
        });
        this.ws.on('close', (code, reason) => {
            this.log.warn({ code, reason: reason.toString() }, 'Binance WS closed');
            if (this.pingTimer)
                clearInterval(this.pingTimer);
            if (!this.isShuttingDown) {
                this.scheduleReconnect();
            }
        });
    }
    startPing() {
        if (this.pingTimer)
            clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === ws_1.default.OPEN) {
                this.ws.ping();
            }
        }, 20000);
    }
    scheduleReconnect(delayMs = 3000) {
        this.reconnectTimer = setTimeout(() => {
            this.log.info('reconnecting to Binance WS...');
            this.connect();
        }, delayMs);
    }
}
exports.BinanceWsClient = BinanceWsClient;
//# sourceMappingURL=binance.js.map