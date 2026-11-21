import type { GenerateOptions, Message, ToolSchema } from '@deepseek-ai/dsh-llm';
import { type AttachmentBridge, type ImageLimits } from './images.js';
export declare class OpenAiGatewayError extends Error {
    readonly status: number;
    readonly type: string;
    readonly code: string;
    constructor(message: string, status?: number, type?: string, code?: string);
}
export interface OpenAiToolCall {
    id?: unknown;
    type?: unknown;
    function?: {
        name?: unknown;
        arguments?: unknown;
    };
}
export interface OpenAiChatMessage {
    role?: unknown;
    content?: unknown;
    tool_calls?: unknown;
    tool_call_id?: unknown;
    /** DeepSeek / Qoder 思考回传。思考模式的工具轮次缺了它，上游会 400。 */
    reasoning_content?: unknown;
    /** Cline 等客户端用的另一个思考字段名。 */
    reasoning?: unknown;
}
/**
 * 档位归一化时发生的一件**用户看不出来**的事，交给调用方记日志。
 *
 * ⚠️ 必须能被记下来：翻译是**有意**的降级（客户端表达不出模型的私有 id），
 * 但没有日志的话，「用户选了 ultra、实际只跑 high」这件事事后无从解释。
 */
export interface ReasoningEffortNotice {
    /** 客户端要的档位（原样）。 */
    requested: string;
    /** `translated` = 就近落到模型声明的一档；`unexpressible` = 模型没有这一族 → 不下发。 */
    outcome: 'translated' | 'unexpressible';
    /** 实际下发的 id（`unexpressible` 时缺省）。 */
    applied?: string;
}
export interface OpenAiChatRequest {
    model?: unknown;
    messages?: unknown;
    stream?: unknown;
    temperature?: unknown;
    max_tokens?: unknown;
    max_completion_tokens?: unknown;
    stop?: unknown;
    reasoning_effort?: unknown;
    tools?: unknown;
    tool_choice?: unknown;
}
export declare function normalizeMaxTokens(value: number | undefined, provider: string, model: string): number | undefined;
/**
 * 把 OpenAI 的 `reasoning_effort` 归一化成本模型**真正支持**的档位。
 *
 * ## 「未声明」与「不支持」必须区别对待
 *
 * 实机报障：ZCode 经网关调 `lobsterai/MiniMax-M3.1-Flash-Preview` 报
 * `provider "lobsterai" model "..." does not support reasoning effort "high"`。
 * 该模型没有 `thinkingConfig` ⇒ 适配器不声明 reasoning ⇒ `supported` 为空。
 * 初版在这里**原样透传**了 `high`，于是 DSH 侧校验拒绝，整轮请求失败。
 *
 * 正确处理是**不下发**该参数：模型没有这组档位，硬塞一个只会换来错误，
 * 而「静默按模型默认走」至少不会让用户的整轮对话失败。
 * （与本仓库「不参与模型请求、不伪造 provider 行为」的既有约定一致。）
 *
 * ## 第二类失败：客户端只认识通用档位名，模型用的是私有 id
 *
 * 各 provider 的档位 id 是**上游 wire 值**：TRAE 是 `light`/`high`/`extra_high`、
 * LobsterAI 是 `off`/`high`/`xhigh`（界面上叫 Max）、Cline 是 `…`/`max`（界面上叫
 * Extra）、Raccoon 是 `on`/`off`。而走 OpenAI 协议的客户端**只有固定 8 档词汇**
 * （Codex 与为它生成模型目录的 CC Switch 都是 `none…ultra`），它**表达不出**
 * 那些私有值 —— 用户照着 DSH 界面上的名字填，`max` 撞 `xhigh`、`xhigh` 撞 `max`，
 * 换来的是一句 400 和**整轮对话不可用**，而两端都看不出为什么。
 *
 * 这正是本仓库已经吃过一次的教训（工具类型不认识就让整轮失败，见 `responses.ts`
 * 文件头）：**拒绝的收益（让用户知道某档没生效）远小于代价（整轮不可用，
 * 且用户无从修复 —— 客户端根本没有能表达私有 id 的写法）**。
 * 故改为**翻译**：见 {@link translateReasoningEffort}，按强度序就近落到模型声明的
 * 同族档位上，并把这件事通过 `onNotice` 交给调用方记日志。
 *
 * ⚠️ 但**完全不认识的值仍然 400**（例如拼错的 `banana`）：那不是「名字不通用」，
 * 是调用方写错了。静默翻译会让拼写错误变成「档位悄悄不生效」。
 *
 * ## 返回值是**三态**，不可混用
 *
 * - `string`：归一化后的档位，下发它；
 * - `undefined`：**用户没传** `reasoning_effort`；
 * - `null`：**用户传了，但本模型不适用** → 明确不下发。
 *
 * ⚠️ `null` 与 `undefined` 必须分开：`toGenerateOptions` 以 `!== undefined`
 * 判定「调用方是否给了值」。若这里用 `undefined` 表示「不下发」，它会被当成
 * 「没给」而回退读 `body.reasoning_effort` —— 归一化的结论被原样抵消，
 * 于是报障原句又回来了。**这是本缺陷第二轮的复发形态**（首轮是原样透传，
 * 二轮是「修好了却被下游回退吃掉」）。
 */
export declare function normalizeReasoningEffort(requested: unknown, modelInfo: unknown, provider?: string, model?: string, onNotice?: (notice: ReasoningEffortNotice) => void): string | null | undefined;
/**
 * 把 OpenAI 的 `content` 转成 DSH 的内容块数组。
 *
 * ⚠️ 图片走 `image_url` → 附件 → `ImageBlock`（见 `./images.ts`），**异步**。
 * 附件服务缺失时（`bridge` 为 undefined）必须抛错而不是静默丢图：静默丢弃会让
 * 用户以为模型看到了图，而答案其实是基于文本生成的。
 *
 * ⚠️ 本函数同时被 `/v1/responses` 复用（`responses.ts` 把 Responses 的内容块
 * 转成 Chat 形状后调它）—— **图片入站只有这一份实现**，两套协议各写一份必然
 * 漂移成「Chat 端能收图、Responses 端报错」。
 */
export declare function partsFromContent(content: unknown, bridge: AttachmentBridge | undefined, limits: ImageLimits): Promise<Message['content']>;
/**
 * 提取纯文本（仅用于需要字符串的场景；带图的 content 走 partsFromContent）。
 *
 * ⚠️ 同样被 `/v1/responses` 复用（`responses.ts` 的 `outputText`）—— 「工具结果
 * 不能带图」这条判据必须两个端点一致。
 */
export declare function textFromContent(content: unknown): string;
/** Produce a fresh V4 source identity for each gateway-owned message (PR #229). */
export declare function gatewaySource(): Message['source'];
/**
 * 造一条 DSH 消息。
 *
 * ⚠️ **导出**给 `responses.ts` 用：两个端点造出来的消息必须同形（同样的 id/source
 * 构造），否则同一份历史在两个端点上的来源标记不同，排查时会误导。
 */
export declare function createGatewayMessage(role: Message['role'], content: Message['content'], source: Message['source']): Message;
/**
 * 委托当前宿主构造工具结果：≤0.1.6 使用 user/tool-result 包裹块，
 * 0.1.7+ 使用一等 tool 消息。外部 provider 没有 channel-pack 的兼容层，
 * 固定其中任何一种形状都会让另一代宿主丢失工具应答或拒绝请求。
 * 工厂在两代内核中均存在，同时负责 id、source 与不可变内容。
 */
export declare function createGatewayToolMessage(toolCallId: string, content: Message['content'], isError?: boolean): Message;
/**
 * Chat 形状的 tools → DSH 的 ToolSchema。
 *
 * ⚠️ 被 `/v1/responses` 复用：`responses.ts` 先把 Responses 的**扁平**工具定义
 * 改写成 Chat 的嵌套形状，再交给这里做校验。工具 schema 的校验口径只有这一份。
 */
export declare function convertTools(raw: unknown): ToolSchema[] | undefined;
export declare function parseModelRoute(value: unknown): {
    provider: string;
    model: string;
};
/**
 * 正整数字段的校验（`max_tokens` / `max_completion_tokens` / `max_output_tokens`）。
 *
 * ⚠️ 被 `/v1/responses` 复用（`responsesMaxOutputTokens`），三个字段的判据必须
 * 完全一致，否则「同一个数字在 Chat 端合法、在 Responses 端报错」会被当成缺陷。
 */
export declare function tokenValue(value: unknown, name: string): number | undefined;
/**
 * @param reasoningEffortOverride 网关归一化后的档位。**三态**：
 * - `string`：用它；
 * - `null`：**明确不下发**（模型未声明思考档位，硬塞只会让 DSH 侧报
 *   `UNSUPPORTED_REASONING_EFFORT`）；
 * - `undefined`：调用方没给 → 回退读 `body.reasoning_effort`（直连调用的老行为）。
 * @param images 图片入站依赖。`bridge` 为 undefined 时收到图片会明确报错而非
 *   静默丢图；`limits` 缺省用附件服务的实测默认值。
 *
 * ⚠️ **本函数是异步的**（图片要经附件服务落盘）。若外部有同步调用方需注意。
 */
export declare function toGenerateOptions(body: OpenAiChatRequest, signal: AbortSignal, reasoningEffortOverride?: string | null, maxTokensOverride?: number, images?: {
    bridge?: AttachmentBridge;
    limits?: ImageLimits;
}): Promise<GenerateOptions>;
//# sourceMappingURL=messages.d.ts.map