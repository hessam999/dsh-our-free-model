/** 渠道共用的限流识别、重置时刻解析与等待时间格式化。 */
export declare function formatResetIn(resetAtMs: number, nowMs?: number): string;
export declare function isRateLimited(body: string, status?: number): boolean;
export declare const RATE_LIMIT_FALLBACK_MS = 3600000;
export declare function parseRateLimitError(body: string, currentModel: string, status?: number): {
    modelId: string;
    resetTimeMs: number;
} | null;
//# sourceMappingURL=rate-limit.d.ts.map