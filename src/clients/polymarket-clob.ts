import { Wallet } from '@ethersproject/wallet';
import type { ClobClient, TickSize } from '@polymarket/clob-client';
import type {
  ExecutionClient,
  SimmerPortfolio,
  SimmerTradeResponse,
  TradePlacementContext,
} from '../types/index';
import { getLogger } from '../utils/logger';

const POLYGON_CHAIN_ID = 137;

type ClobModule = typeof import('@polymarket/clob-client');

function roundPriceToTick(price: number, tick: TickSize): number {
  const step = parseFloat(tick);
  if (step <= 0 || !Number.isFinite(price)) return price;
  const max = 1 - step;
  const min = step;
  let x = Math.round(price / step) * step;
  if (x < min) x = min;
  if (x > max) x = max;
  return parseFloat(x.toFixed(8));
}

export class PolymarketClobClient implements ExecutionClient {
  private readonly log = getLogger().child({ module: 'PolymarketClob' });
  private clob: ClobClient | null = null;
  private clobMod: ClobModule | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly host: string,
    private readonly privateKey: string,
    /** Same values as Polymarket `SignatureType` enum: 0 = EOA, 1 = proxy, 2 = Gnosis Safe */
    private readonly signatureType: number,
    private readonly funderAddress?: string
  ) {}

  /** ESM-only package: load via dynamic import so Node can execute it from CJS output. */
  private async getClobModule(): Promise<ClobModule> {
    if (!this.clobMod) {
      this.clobMod = await import('@polymarket/clob-client');
    }
    return this.clobMod;
  }

  private async ensureClob(): Promise<ClobClient> {
    if (this.clob) return this.clob;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const mod = await this.getClobModule();
        const signer = new Wallet(this.privateKey);
        const base = new mod.ClobClient(this.host, POLYGON_CHAIN_ID, signer);
        const creds = await base.createOrDeriveApiKey();
        this.clob = new mod.ClobClient(
          this.host,
          POLYGON_CHAIN_ID,
          signer,
          creds,
          this.signatureType as import('@polymarket/clob-client').SignatureType,
          this.funderAddress
        );
      })().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
    return this.clob!;
  }

  async importMarket(_slug: string): Promise<void> {
    // Gamma already provides condition + token IDs; CLOB does not need Simmer import.
    return Promise.resolve();
  }

  async getPortfolio(): Promise<SimmerPortfolio> {
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

  async placeTrade(
    marketId: string,
    side: 'YES' | 'NO',
    amount: number,
    dryRun: boolean,
    ctx?: TradePlacementContext
  ): Promise<SimmerTradeResponse> {
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
    const tickSize = (await clob.getTickSize(tokenID)) as TickSize;
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

    const posted = await clob.createAndPostOrder(
      {
        tokenID,
        price,
        size,
        side: mod.Side.BUY,
      },
      { tickSize, negRisk },
      mod.OrderType.GTC
    );

    const orderID =
      typeof posted?.orderID === 'string'
        ? posted.orderID
        : typeof posted?.orderId === 'string'
          ? posted.orderId
          : typeof posted?.id === 'string'
            ? posted.id
            : '';

    const errMsg =
      typeof posted?.errorMsg === 'string' && posted.errorMsg
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

    const txHash =
      Array.isArray(posted?.transactionsHashes) && posted.transactionsHashes.length > 0
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

  async cancelOrder(orderId: string): Promise<void> {
    try {
      const clob = await this.ensureClob();
      await clob.cancelOrder({ orderID: orderId });
      this.log.info({ orderId }, 'CLOB order cancelled');
    } catch (err) {
      this.log.warn({ orderId, err }, 'CLOB cancel failed (may already be filled)');
    }
  }
}
