"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolymarketClobClient = void 0;
const wallet_1 = require("@ethersproject/wallet");
const logger_1 = require("../utils/logger");
const POLYGON_CHAIN_ID = 137;
function roundPriceToTick(price, tick) {
    const step = parseFloat(tick);
    if (step <= 0 || !Number.isFinite(price))
        return price;
    const max = 1 - step;
    const min = step;
    let x = Math.round(price / step) * step;
    if (x < min)
        x = min;
    if (x > max)
        x = max;
    return parseFloat(x.toFixed(8));
}
class PolymarketClobClient {
    constructor(host, privateKey, 
    /** Same values as Polymarket `SignatureType` enum: 0 = EOA, 1 = proxy, 2 = Gnosis Safe */
    signatureType, funderAddress) {
        this.host = host;
        this.privateKey = privateKey;
        this.signatureType = signatureType;
        this.funderAddress = funderAddress;
        this.log = (0, logger_1.getLogger)().child({ module: 'PolymarketClob' });
        this.clob = null;
        this.clobMod = null;
        this.initPromise = null;
    }
    /** ESM-only package: load via dynamic import so Node can execute it from CJS output. */
    async getClobModule() {
        if (!this.clobMod) {
            this.clobMod = await import('@polymarket/clob-client');
        }
        return this.clobMod;
    }
    async ensureClob() {
        if (this.clob)
            return this.clob;
        if (!this.initPromise) {
            this.initPromise = (async () => {
                const mod = await this.getClobModule();
                const signer = new wallet_1.Wallet(this.privateKey);
                const base = new mod.ClobClient(this.host, POLYGON_CHAIN_ID, signer);
                const creds = await base.createOrDeriveApiKey();
                this.clob = new mod.ClobClient(this.host, POLYGON_CHAIN_ID, signer, creds, this.signatureType, this.funderAddress);
            })().catch((err) => {
                this.initPromise = null;
                throw err;
            });
        }
        await this.initPromise;
        return this.clob;
    }
    async importMarket(_slug) {
        // Gamma already provides condition + token IDs; CLOB does not need Simmer import.
        return Promise.resolve();
    }
    async getPortfolio() {
        const mod = await this.getClobModule();
        const clob = await this.ensureClob();
        const r = await clob.getBalanceAllowance({ asset_type: mod.AssetType.COLLATERAL });
        const balance = parseFloat(r.balance);
        return {
            balance: Number.isFinite(balance) ? balance : 0,
            equity: Number.isFinite(balance) ? balance : 0,
            positions: [],
        };
    }
    async placeTrade(marketId, side, amount, dryRun, ctx) {
        if (!ctx) {
            return {
                id: '',
                status: 'ERROR',
                market_id: marketId,
                side,
                amount,
                error: 'Missing trade context (token IDs) for Polymarket CLOB execution',
            };
        }
        const tokenID = side === 'YES' ? ctx.yesTokenId : ctx.noTokenId;
        const rawPrice = side === 'YES' ? ctx.yesPrice : ctx.noPrice;
        if (!tokenID) {
            return {
                id: '',
                status: 'ERROR',
                market_id: marketId,
                side,
                amount,
                error: `Missing ${side} token ID for market ${ctx.slug} – check Gamma tokenIds`,
            };
        }
        if (dryRun) {
            this.log.info({ marketId, side, amount, tokenID, slug: ctx.slug }, '[DRY RUN] would place CLOB order');
            return {
                id: `dry-clob-${Date.now()}`,
                status: 'SIMULATED',
                market_id: marketId,
                side,
                amount,
                price: rawPrice,
            };
        }
        const mod = await this.getClobModule();
        const clob = await this.ensureClob();
        const tickSize = (await clob.getTickSize(tokenID));
        const negRisk = await clob.getNegRisk(tokenID);
        const price = roundPriceToTick(rawPrice, tickSize);
        const book = await clob.getOrderBook(tokenID);
        const minSz = parseFloat(book.min_order_size ?? '0');
        let size = price > 0 ? amount / price : 0;
        if (Number.isFinite(minSz) && minSz > 0) {
            size = Math.max(size, minSz);
        }
        size = parseFloat(size.toFixed(6));
        if (!Number.isFinite(size) || size <= 0) {
            return {
                id: '',
                status: 'ERROR',
                market_id: marketId,
                side,
                amount,
                error: 'Computed order size is invalid (check amount and price)',
            };
        }
        this.log.info({ marketId, side, amount, price, size, tokenID, slug: ctx.slug }, 'placing CLOB order');
        const posted = await clob.createAndPostOrder({
            tokenID,
            price,
            size,
            side: mod.Side.BUY,
        }, { tickSize, negRisk }, mod.OrderType.GTC);
        const orderID = typeof posted?.orderID === 'string'
            ? posted.orderID
            : typeof posted?.orderId === 'string'
                ? posted.orderId
                : typeof posted?.id === 'string'
                    ? posted.id
                    : '';
        const errMsg = typeof posted?.errorMsg === 'string' && posted.errorMsg
            ? posted.errorMsg
            : typeof posted?.error === 'string'
                ? posted.error
                : undefined;
        if (!orderID || errMsg) {
            return {
                id: '',
                status: 'ERROR',
                market_id: marketId,
                side,
                amount,
                price,
                error: errMsg ?? 'CLOB post did not return orderID',
            };
        }
        const txHash = Array.isArray(posted?.transactionsHashes) && posted.transactionsHashes.length > 0
            ? String(posted.transactionsHashes[0])
            : undefined;
        return {
            id: orderID,
            status: typeof posted?.status === 'string' ? posted.status : 'OPEN',
            market_id: marketId,
            side,
            amount,
            price,
            tx_hash: txHash,
        };
    }
    async cancelOrder(orderId) {
        try {
            const clob = await this.ensureClob();
            await clob.cancelOrder({ orderID: orderId });
            this.log.info({ orderId }, 'CLOB order cancelled');
        }
        catch (err) {
            this.log.warn({ orderId, err }, 'CLOB cancel failed (may already be filled)');
        }
    }
}
exports.PolymarketClobClient = PolymarketClobClient;
//# sourceMappingURL=polymarket-clob.js.map