"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimmerClient = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
class SimmerClient {
    constructor(apiKey, baseUrl, privateKey, walletAddress) {
        this.walletAddress = walletAddress;
        this.log = (0, logger_1.getLogger)().child({ module: 'SimmerClient' });
        this.privateKey = privateKey;
        this.http = axios_1.default.create({
            baseURL: baseUrl,
            timeout: 10000,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                ...(walletAddress ? { 'X-Wallet-Address': walletAddress } : {}),
            },
        });
        this.http.interceptors.response.use((r) => r, (err) => {
            const status = err.response?.status ?? 'network';
            const msg = err.response?.data?.message ?? err.message;
            this.log.error({ status, msg }, 'Simmer API error');
            return Promise.reject(err);
        });
    }
    async importMarket(slug) {
        const url = `https://polymarket.com/event/${slug}`;
        this.log.info({ slug }, 'importing market');
        await this.http.post('/api/sdk/markets/import', {
            polymarket_url: url,
        });
    }
    async getMarket(marketId) {
        const { data } = await this.http.get(`/api/sdk/markets/${marketId}`);
        return data;
    }
    async placeTrade(marketId, side, amount, dryRun, _ctx) {
        const req = {
            market_id: marketId,
            side,
            amount,
            venue: 'polymarket',
            source: 'sdk:sniper',
            ...(this.walletAddress ? { wallet_address: this.walletAddress } : {}),
        };
        if (dryRun) {
            this.log.info({ req }, '[DRY RUN] would place trade');
            return {
                id: `dry-${Date.now()}`,
                status: 'SIMULATED',
                market_id: marketId,
                side,
                amount,
                price: side === 'YES' ? 0.65 : 0.35,
            };
        }
        this.log.info({ marketId, side, amount }, 'placing trade');
        const { data } = await this.http.post('/api/sdk/trade', req);
        return data;
    }
    async getPortfolio() {
        const { data } = await this.http.get('/api/sdk/portfolio');
        return data;
    }
    async getPositions() {
        const { data } = await this.http.get('/api/sdk/positions');
        return data.positions ?? [];
    }
    async cancelOrder(orderId) {
        try {
            await this.http.delete(`/api/sdk/orders/${orderId}`);
            this.log.info({ orderId }, 'order cancelled');
        }
        catch (err) {
            this.log.warn({ orderId, err }, 'cancel order failed (may already be filled)');
        }
    }
}
exports.SimmerClient = SimmerClient;
//# sourceMappingURL=simmer.js.map