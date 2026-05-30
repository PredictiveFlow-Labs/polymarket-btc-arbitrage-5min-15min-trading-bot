"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SniperStrategy = void 0;
const logger_1 = require("../utils/logger");
const PRICE_HISTORY_LIMIT = 300;
class SniperStrategy {
    constructor(config, execution, risk) {
        this.config = config;
        this.execution = execution;
        this.risk = risk;
        this.log = (0, logger_1.getLogger)().child({ module: 'SniperStrategy' });
        // Per-market BTC price state
        this.priceStates = new Map();
        // Per-market open BTC price (set when market is first seen)
        this.openPrices = new Map();
        // Pending limit orders: marketId → { orderId, placedAt }
        this.pendingOrders = new Map();
        // Completed trades for analytics
        this.completedTrades = [];
        this.lastBtcPrice = 0;
    }
    // ── Price ingestion ───────────────────────────────────────────────────────
    onBtcPrice(snapshot) {
        this.lastBtcPrice = snapshot.price;
        // Update all tracked markets
        for (const [marketId, state] of this.priceStates) {
            const movePct = ((snapshot.price - state.openPrice) / state.openPrice) * 100;
            const minMove = this.config.minMovePct;
            const qualifies = Math.abs(movePct) >= minMove;
            if (qualifies) {
                if (state.sustainedSinceMs === null) {
                    state.sustainedSinceMs = snapshot.timestamp;
                }
            }
            else {
                // Reset sustain timer if move dropped below threshold
                state.sustainedSinceMs = null;
            }
            state.current = snapshot.price;
            state.movePct = movePct;
            state.history.push(snapshot);
            if (state.history.length > PRICE_HISTORY_LIMIT)
                state.history.shift();
            this.priceStates.set(marketId, state);
        }
    }
    // ── Market registration ───────────────────────────────────────────────────
    registerMarket(market) {
        if (!this.priceStates.has(market.id)) {
            const openPrice = this.openPrices.get(market.id) ?? this.lastBtcPrice;
            this.openPrices.set(market.id, openPrice);
            this.priceStates.set(market.id, {
                current: this.lastBtcPrice,
                openPrice,
                movePct: 0,
                sustainedSinceMs: null,
                history: [],
            });
            this.log.info({ marketId: market.id, slug: market.slug, openBtc: openPrice }, 'market registered');
        }
    }
    unregisterMarket(marketId) {
        this.priceStates.delete(marketId);
        this.openPrices.delete(marketId);
    }
    // ── Signal evaluation ─────────────────────────────────────────────────────
    evaluateSignal(market) {
        const now = Date.now();
        const remainingSecs = Math.floor((market.endTime.getTime() - now) / 1000);
        // Only enter in last N seconds
        if (remainingSecs > this.config.entryWindowSecs) {
            return { ok: false, reason: 'TOO_EARLY' };
        }
        // Spread filter
        if (market.spread > this.config.maxSpread) {
            return { ok: false, reason: 'SPREAD_TOO_WIDE' };
        }
        // Liquidity filter
        if (market.liquidity < this.config.minLiquidity) {
            return { ok: false, reason: 'LOW_LIQUIDITY' };
        }
        // Risk gates
        const riskCheck = this.risk.canTrade(market.id);
        if (!riskCheck.ok) {
            return { ok: false, reason: riskCheck.reason };
        }
        const priceState = this.priceStates.get(market.id);
        if (!priceState) {
            return { ok: false, reason: 'NO_ACTIVE_MARKET' };
        }
        const { movePct, sustainedSinceMs } = priceState;
        // Move threshold
        if (Math.abs(movePct) < this.config.minMovePct) {
            return { ok: false, reason: 'INSUFFICIENT_MOVE' };
        }
        // Sustained move check
        const sustainedMs = sustainedSinceMs ? now - sustainedSinceMs : 0;
        if (sustainedMs < this.config.sustainedMoveSecs * 1000) {
            return { ok: false, reason: 'MOVE_NOT_SUSTAINED' };
        }
        // Determine side
        let side;
        if (movePct >= this.config.minMovePct) {
            // BTC up → BUY YES
            if (market.yesPrice >= this.config.yesMaxForBuyYes) {
                return { ok: false, reason: 'PRICE_THRESHOLD_MISS' };
            }
            side = 'YES';
        }
        else {
            // BTC down → BUY NO
            if (market.yesPrice <= this.config.yesMinForBuyNo) {
                return { ok: false, reason: 'PRICE_THRESHOLD_MISS' };
            }
            side = 'NO';
        }
        const strength = this.risk.classifySignalStrength(movePct, sustainedMs, side, market.yesPrice, this.config.minMovePct);
        const signal = {
            marketId: market.id,
            slug: market.slug,
            side,
            strength,
            yesPrice: market.yesPrice,
            spread: market.spread,
            movePct,
            sustainedMs,
            timestamp: now,
            reason: `BTC ${movePct > 0 ? '+' : ''}${movePct.toFixed(3)}% over ${(sustainedMs / 1000).toFixed(1)}s`,
        };
        return { ok: true, signal };
    }
    // ── Order execution ───────────────────────────────────────────────────────
    async executeSignal(signal, market) {
        const sizing = this.risk.sizePosition(signal.strength);
        this.log.info({ signal: signal.side, amount: sizing.amount, strength: signal.strength, reason: sizing.reason }, 'executing signal');
        try {
            // Simmer: import into venue; CLOB: no-op
            await this.execution.importMarket(market.slug);
            const placementCtx = {
                slug: market.slug,
                yesTokenId: market.yesTokenId,
                noTokenId: market.noTokenId,
                yesPrice: market.yesPrice,
                noPrice: market.noPrice,
            };
            // Place limit order
            const trade = await this.execution.placeTrade(market.id, signal.side, sizing.amount, this.config.dryRun, placementCtx);
            if (trade.error) {
                this.log.error({ error: trade.error }, 'trade rejected');
                return null;
            }
            const entryPrice = signal.side === 'YES' ? market.yesPrice : market.noPrice;
            const position = {
                id: trade.id,
                marketId: market.id,
                slug: market.slug,
                side: signal.side,
                amount: sizing.amount,
                entryPrice,
                currentPrice: entryPrice,
                openedAt: Date.now(),
                expiresAt: market.endTime.getTime(),
                status: 'OPEN',
                orderId: trade.id,
            };
            this.risk.openPosition(position);
            // Track pending order for stale-cancel logic
            this.pendingOrders.set(market.id, { orderId: trade.id, placedAt: Date.now() });
            // Schedule stale cancel
            if (!this.config.dryRun) {
                setTimeout(() => this.cancelIfStale(market.id), this.config.limitOrderTtlMs);
            }
            return position;
        }
        catch (err) {
            this.log.error({ err }, 'failed to execute signal');
            return null;
        }
    }
    // ── Order lifecycle ───────────────────────────────────────────────────────
    async cancelIfStale(marketId) {
        const pending = this.pendingOrders.get(marketId);
        if (!pending)
            return;
        const age = Date.now() - pending.placedAt;
        if (age < this.config.limitOrderTtlMs)
            return;
        this.log.warn({ marketId, orderId: pending.orderId, ageMs: age }, 'cancelling stale order');
        await this.execution.cancelOrder(pending.orderId);
        this.pendingOrders.delete(marketId);
        // Also remove the open position since order wasn't filled
        this.risk.closePosition(marketId, 0);
    }
    async closeBeforeExpiry(position, market) {
        const remainingSecs = (position.expiresAt - Date.now()) / 1000;
        if (remainingSecs > this.config.exitBeforeExpirySecs)
            return;
        this.log.info({ marketId: position.marketId, remainingSecs: remainingSecs.toFixed(1) }, 'closing position before expiry');
        // Sell the position at current market price
        const exitSide = position.side === 'YES' ? 'NO' : 'YES';
        const currentYesPrice = market.yesPrice;
        const placementCtx = {
            slug: market.slug,
            yesTokenId: market.yesTokenId,
            noTokenId: market.noTokenId,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
        };
        try {
            await this.execution.placeTrade(position.marketId, exitSide, position.amount, this.config.dryRun, placementCtx);
            const closed = this.risk.closePosition(position.marketId, currentYesPrice);
            if (closed)
                this.recordTrade(closed, position.slug, currentYesPrice);
        }
        catch (err) {
            this.log.error({ err }, 'failed to close position before expiry');
        }
    }
    async settlePosition(marketId, btcFinalPrice, openBtcPrice) {
        const pos = this.risk.getPosition(marketId);
        if (!pos)
            return;
        // Determine outcome
        const btcWentUp = btcFinalPrice > openBtcPrice;
        const won = (pos.side === 'YES' && btcWentUp) ||
            (pos.side === 'NO' && !btcWentUp);
        const closed = this.risk.expirePosition(marketId, won);
        if (closed) {
            this.log.info({ marketId, won, pnl: closed.pnl?.toFixed(4) }, 'position settled at expiry');
            this.recordTrade(closed, 'expired', won ? 1.0 : 0.0);
        }
    }
    // ── Analytics helpers ─────────────────────────────────────────────────────
    recordTrade(pos, window, exitPrice) {
        const holdMs = (pos.closedAt ?? Date.now()) - pos.openedAt;
        const minuteBucket = Math.floor((pos.openedAt % (15 * 60 * 1000)) / 60000);
        const record = {
            id: pos.id,
            marketId: pos.marketId,
            slug: pos.slug,
            window,
            side: pos.side,
            entryPrice: pos.entryPrice,
            exitPrice,
            amount: pos.amount,
            pnl: pos.pnl,
            won: (pos.pnl ?? 0) > 0,
            openedAt: pos.openedAt,
            closedAt: pos.closedAt,
            holdMs,
            signalStrength: 'MODERATE', // would be passed from signal in production
            movePct: 0,
            minuteBucket,
        };
        this.completedTrades.push(record);
    }
    getCompletedTrades() {
        return [...this.completedTrades];
    }
    getCurrentBtcPrice() {
        return this.lastBtcPrice;
    }
    getPriceState(marketId) {
        return this.priceStates.get(marketId);
    }
}
exports.SniperStrategy = SniperStrategy;
//# sourceMappingURL=sniper.js.map