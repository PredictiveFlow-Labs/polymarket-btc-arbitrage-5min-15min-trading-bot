import type { TradeRecord, DashboardSnapshot, RiskState } from '../types/index';
export declare class AnalyticsDashboard {
    private readonly log;
    private trades;
    private readonly filePath;
    constructor(analyticsFile: string);
    private loadExisting;
    appendTrade(trade: TradeRecord): void;
    snapshot(riskState: RiskState): DashboardSnapshot;
    private byMinuteBucket;
    private bySignalStrength;
    printDashboard(snap: DashboardSnapshot): void;
}
//# sourceMappingURL=dashboard.d.ts.map