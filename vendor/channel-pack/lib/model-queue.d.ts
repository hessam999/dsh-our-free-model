/**
 * **模型排队**错误的共享解析（Qoder 业务码 `10605`）。
 *
 * ## 为什么单独成模块
 *
 * 排队错误的**识别**发生在两个地方，而**解析逻辑必须只有一份**（否则必然漂移）：
 *
 * | 位置 | 场景 |
 * |---|---|
 * | `openai-compat.ts` 的 SSE 消费器 | HTTP **200** + 流内 `{code:"10605",…}` 帧 |
 * | `qoder-adapter.ts` 的 HTTP 分支 | HTTP **403** + 排队 JSON 体 |
 *
 * ⚠️ 放在这里而不是 `qoder-adapter.ts`：后者 import 前者，反向依赖会成环。
 *
 * ## 关键结构：`message` 是「一个 JSON 字符串」
 *
 * ```json
 * {"code":"10605","message":"{\"isQueued\":true,…,\"retryAfterSeconds\":30,…}"}
 * ```
 * 必须**二次解析** —— 客户端 `lFc()` 正是为此递归遍历
 * `data`/`result`/`message`/`body`，字符串再 `JSON.parse`。
 * **只读顶层 `code` 永远拿不到排队参数**（这是第一版修复漏掉 SSE 通道的根因）。
 *
 * ## 客户端权威实现（obf 产物取证）
 *
 * - 排队码 `mRA="10605"` → `model_queued`；认证码 `MF="105"` → `auth_error`
 *   —— **互相独立**（`rJc()`），绝不能合并；
 * - 延迟优先序（`kJa()`/`EV()`/`IRA()`）：`retry_after_ms` → `retryAfterMs`
 *   → `retryAfterSeconds × 1000` → 兜底 `Retry-After` 响应头；
 * - 决策（`W7c()`）：**有延迟就精确等它**，没有才退回指数退避。
 *
 * 取证脚本：`scripts/probe-qoder-queue-error.mjs`。
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Qoder 的排队业务码（客户端 obf 产物里的 `mRA`）。 */
export declare const QUEUE_BUSINESS_CODE = "10605";
export declare class ModelQueuedError extends LlmError {
    readonly queueInfo: Readonly<Record<string, unknown>>;
    readonly retryAfterMs: number | undefined;
    constructor(message: string, options: {
        queueInfo: Readonly<Record<string, unknown>>;
        retryAfterMs?: number;
    });
}
/**
 * Qoder 的**额度用尽**业务码（`Billing daily count exceeded`）。
 *
 * ## 为什么必须与排队**分开**处理（真实缺陷，用户报障 2026-09-27）
 *
 * 排队修好后，会话继续自动执行目标时出现：
 * ```
 * 重试延迟：7220毫秒
 * 失败原因：qoder: Billing daily count exceeded (110/model_error)
 * ```
 * 它原先被归成 **`SERVER`**，而 `SERVER` **在** harness 的
 * `DEFAULT_RETRYABLE_CODES` 里 → **白重试 5 次**（≈15.5 秒），
 * 用户看到的 `7220毫秒` 就是其中一步。
 *
 * ## 客户端权威依据（obf 产物原文，已用探针取证）
 *
 * ```js
 * function vpt(e){
 *   let t = e === "authentication_failed" || e === "billing_error" ? "permission"
 *         : e === "rate_limit"      ? "rate_limited"
 *         : e === "invalid_request" ? "invalid_request"
 *         : "unavailable";
 *   return new Tt(t, `Qoder assistant failed: ${e}`)
 * }
 * ```
 * **`billing_error` → `permission`**（不可重试），与 **`rate_limit` → `rate_limited`**
 * （可重试）**明确分开**。
 *
 * ⚠️ 语义差异是本质的，不是风格问题：
 * - `10605` 排队：**暂时**受阻 —— 等待若干秒即可通过（故内部等待重试）；
 * - `110` 额度：**当天耗尽** —— 立刻重试、等 15 秒重试、等 30 分钟重试，
 *   结果都一样（故**必须立即失败**，并把真实原因如实告诉用户）。
 *
 * 取证脚本：`scripts/probe-qoder-code-110b.mjs`（只读，打印上述客户端映射原文）。
 */
export declare const BILLING_BUSINESS_CODE = "110";
/**
 * 额度用尽的其他业务码。
 *
 * `112` 是 Qoder CN 在同一语义下下发的第二个码值（issue #721 实测：
 * `{ code: 112, model_error: … }` 且响应体带 `pricingUrl`，是「该模型的额度/
 * 套餐已耗尽，去购买」的引导页形态）。只认 `110` 时这条路径完全不匹配，
 * `switchAccountOnQuota` 永不触发，死号每轮都被重新选中，整段不可用。
 */
export declare const BILLING_BUSINESS_CODES: readonly string[];
/** 业务码是否命中**额度用尽**（兼容字符串与数字两种编码）。 */
export declare function isBillingBusinessCode(code: unknown): boolean;
/**
 * Qoder 的计费日界时区（**固定 UTC+8**）。
 *
 * ## 为什么写死 UTC+8 而不取本机时区
 *
 * ⚠️ Qoder 是**服务端**按自己的账期结算「每日次数」，不是按用户机器时区。
 * 服务端的其他每日语义已实测为 UTC+8（每日领取活动的说明原文就是
 * 「每日 10:00（UTC+8）刷新」）。故受限时间必须按 **UTC+8 的当日 24:00** 算 ——
 * 取本机时区会在用户出差/改系统时区时算出**错的解禁时刻**：
 * 时区偏东会让标记过早失效（马上再撞一次额度墙），偏西则白等几小时。
 *
 * 这里刻意**不**用 `Intl` 做通用时区换算：需求就是「固定的 UTC+8 日界」，
 * 写死偏移量（`8 * 3600_000`）比引入时区数据库更可预测、也便于单测。
 */
export declare const QODER_BILLING_UTC_OFFSET_MS: number;
/**
 * 算出「**UTC+8 的当日 24:00**」对应的 UTC 毫秒时间戳。
 *
 * 语义：额度按**自然日**重置，故受限时间取「今天（UTC+8）结束的那一刻」——
 * 即次日 00:00:00.000（UTC+8）。
 *
 * ⚠️ 用**算术**而非 `setHours`：`Date` 的 `setHours` 按**本机时区**运算，
 * 在非 UTC+8 的机器上会得到错的时间。这里先把时间戳平移到 UTC+8 的「墙上时间」，
 * 取到该日末尾，再平移回来。
 *
 * @param nowMs - 当前 UTC 毫秒时间戳（注入以便单测；默认 `Date.now()`）。
 * @returns UTC+8 次日 00:00 的 UTC 毫秒时间戳（**严格大于** `nowMs`）。
 */
export declare function nextUtc8DayStartMs(nowMs?: number): number;
/**
 * 从错误体里提取**额度类**文案（客户端映射之外的兜底判据）。
 *
 * ⚠️ **为什么要文案兜底**：`110` 这个码值在客户端产物里**没有硬编码**
 * （探针搜 `X="110"` 与 `daily count exceeded` 均未命中），说明它由服务端下发。
 * 若上游哪天改用别的码值表达同一语义，只认码就会漏判 —— 故两者都认：
 * **码值命中 110，或文案含 billing/额度语义**。
 *
 * ⚠️ 关键词必须**窄**：`balance` / `quota` 之类泛词会误伤正常内容（如模型正文
 * 里恰好讨论「余额」）。故只认明确的英文错误短语。
 */
export declare function looksLikeBillingError(text: string): boolean;
/**
 * 错误体是否带**购买引导**（`pricingUrl` / `pricing_url`）。
 *
 * Qoder CN 的额度耗尽还有第三种形态：没有 `110`/`112` 码，而是一个
 * 「去开通/去购买」的错误对象，里面带 `pricingUrl`（issue #721 的实测体）。
 * 这个字段在正常响应里从不出现，所以它本身就是额度类判据，不需要再猜文案。
 *
 * ⚠️ 只认**键名**，不认 URL 里的文字：模型正文里出现 "pricing" 是常事。
 */
export declare function hasPricingHint(value: unknown): boolean;
/**
 * 同一个判据的**文本**版本：错误被压成一句话后，`pricingUrl` 只剩键名。
 *
 * ⚠️ 只认 `"pricingUrl":` 这种**带引号与冒号的键名形态**，不认裸词
 * "pricing"：模型正文里讨论定价是常事，裸词会误伤。
 */
export declare function hasPricingHintText(text: string): boolean;
/**
 * 单次排队等待的**封顶**（毫秒）。
 *
 * 用户要求：服务端给的排队时间 **< 10 秒按它的值**，**≥ 10 秒按 10 秒** ——
 * 避免一次阻塞 30 秒让 UI 长期停在「运行中」且无法区分「排队」与「卡死」。
 */
export declare const QUEUE_MAX_DELAY_MS = 10000;
export declare const QUEUE_MAX_ATTEMPTS = 180;
/** 排队错误里我们关心的字段（客户端 `PJa()` 的裁剪版）。 */
export interface QueueInfo {
    isQueued?: boolean;
    modelKey?: string;
    queueCount?: number;
    queueType?: string;
    serviceAvailable?: boolean;
    retryAfterSeconds?: number;
    waitTime?: number;
    /** 毫秒口径的延迟（客户端 `kJa()` 优先取这个）。 */
    retry_after_ms?: number;
    retryAfterMs?: number;
}
/** 业务码是否命中排队（兼容字符串与数字两种编码）。 */
export declare function isQueueBusinessCode(code: unknown): boolean;
export declare function parseQueueError(body: unknown): QueueInfo | undefined;
/** 跨渠道只认明确排队字段或错误类型，状态码和繁忙文案仍由渠道自己处理。 */
export declare function throwIfModelQueued(body: unknown, headers?: {
    get(name: string): string | null;
}): void;
/** 保留原响应体供渠道原有鉴权、额度错误处理消费。 */
export declare function checkQueuedResponse(response: Response): Promise<Response>;
/**
 * 算出本次排队该等多久（毫秒）；无法判定时返回 undefined（交调用方退避）。
 *
 * 取值优先序：`retry_after_ms` → `retryAfterMs` → `retryAfterSeconds × 1000`，
 * 命中即用并**封顶** {@link QUEUE_MAX_DELAY_MS}。
 *
 * ⚠️ **非法值一律忽略而不是当 0**：客户端 `W7c()` 对非有限/负值直接判 fail。
 * 当 0 会变成「立即重试」的忙循环，把机会瞬间烧掉。
 */
export declare function queueDelayMs(info: QueueInfo | undefined): number | undefined;
//# sourceMappingURL=model-queue.d.ts.map