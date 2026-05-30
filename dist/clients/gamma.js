"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GammaClient = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
// Slug segment patterns for fast markets, e.g. "will-btc-5m-...", "-15m-"
const WINDOW_SLUG_MAP = {
    '5m': '-5m-',
    '15m': '-15m-',
};
const ASSET_PATTERNS = {
    BTC: /bitcoin|btc/i,
};
class GammaClient {
    constructor() {
        this.log = (0, logger_1.getLogger)().child({ module: 'GammaClient' });
    }
    async fetchMarkets(limit = 30) {
        const url = `${GAMMA_BASE}/markets`;
        const { data } = await axios_1.default.get(url, {
            params: {
                limit,
                closed: false,
                tag: 'crypto',
                order: 'createdAt',
                ascending: false,
            },
            timeout: 8000,
        });
        return Array.isArray(data) ? data : [];
    }
    async discoverFastMarkets(asset, windows) {
        const raw = await this.fetchMarkets(50);
        const assetPattern = ASSET_PATTERNS[asset.toUpperCase()];
        if (!assetPattern)
            throw new Error(`Unknown asset: ${asset}`);
        const results = [];
        for (const market of raw) {
            if (market.closed)
                continue;
            if (!market.slug)
                continue;
            if (!assetPattern.test(market.question))
                continue;
            for (const window of windows) {
                const slugFragment = WINDOW_SLUG_MAP[window];
                if (!market.slug.includes(slugFragment))
                    continue;
                const parsed = this.parseMarket(market, window);
                if (parsed)
                    results.push(parsed);
            }
        }
        this.log.debug({ count: results.length }, 'discovered fast markets');
        return results;
    }
    parseMarket(raw, window) {
        try {
            const endTime = this.extractEndTime(raw);
            if (!endTime)
                return null;
            const now = Date.now();
            const remainingSecs = Math.floor((endTime.getTime() - now) / 1000);
            if (remainingSecs <= 0)
                return null;
            const prices = this.parsePrices(raw);
            if (!prices)
                return null;
            const tokenIds = this.parseTokenIds(raw);
            const spread = Math.abs(prices.yesPrice - (1 - prices.noPrice));
            return {
                id: raw.id,
                question: raw.question,
                slug: raw.slug,
                window,
                endTime,
                remainingSecs,
                yesPrice: prices.yesPrice,
                noPrice: prices.noPrice,
                spread,
                liquidity: raw.liquidity ?? 0,
                volume: raw.volume ?? 0,
                yesTokenId: tokenIds[0] ?? '',
                noTokenId: tokenIds[1] ?? '',
            };
        }
        catch (err) {
            this.log.warn({ slug: raw.slug, err }, 'failed to parse market');
            return null;
        }
    }
    extractEndTime(market) {
        // Primary: ISO date in endDate field
        if (market.endDate) {
            const d = new Date(market.endDate);
            if (!isNaN(d.getTime()))
                return d;
        }
        // Fallback: parse from question text e.g. "...by 14:35 UTC?"
        const timeMatch = market.question.match(/(\d{1,2}):(\d{2})\s*UTC/i);
        if (timeMatch) {
            const now = new Date();
            const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0));
            if (candidate.getTime() > Date.now() - 60000)
                return candidate;
        }
        return null;
    }
    parsePrices(raw) {
        try {
            if (raw.outcomePrices) {
                const arr = JSON.parse(raw.outcomePrices);
                if (arr.length >= 2) {
                    return { yesPrice: arr[0], noPrice: arr[1] };
                }
            }
            // Fallback to bid/ask mid
            if (raw.bestBid !== undefined && raw.bestAsk !== undefined) {
                const mid = (raw.bestBid + raw.bestAsk) / 2;
                return { yesPrice: mid, noPrice: 1 - mid };
            }
            return null;
        }
        catch {
            return null;
        }
    }
    parseTokenIds(raw) {
        if (raw.tokenIds && raw.tokenIds.length >= 2)
            return raw.tokenIds;
        return ['', ''];
    }
}
exports.GammaClient = GammaClient;
//# sourceMappingURL=gamma.js.map