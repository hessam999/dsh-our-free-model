/**
 * OpenAI chat payload 构造 + FreeTier 形状门禁注入（**v2 指纹**）。
 *
 * ## 门禁依据（v2，2026-10-14 起）
 *
 * 匿名通道按 **v2 客户端**校验工具形状，与 `src/upstream.js`（插件自己的免费
 * 车道）同一套规则：
 *
 * 1. 必须声明 `read` 与 `shell` **两个**工具，且 description 与参数 schema
 *    与官方客户端**逐字一致**（下面的常量即逐字副本）；
 * 2. 调用方自己的工具原样保留，含 `Read`/`Bash` 这类大小写变体；
 * 3. 调用方若**正好**用了 `read`/`shell` 这个名字但定义不同，改名成
 *    `<name>_client[N]`，响应侧再还原；
 * 4. `tool_choice: 'none'` 一律 403，绝不下发；
 * 5. 注入的工具会被模型真的调用（v2 的定义是真工具），所以注入后要补一句
 *    系统提示「别调它们」。
 *
 * ⚠️ v1 的四个名字（`bash`/`glob`/`grep`/`read`）+「空 schema 补一个占位
 * property」已失效：v2 比对定义本身，桩描述与空 properties 都会 403。
 * ⚠️ 门禁参数**收敛在本文件**，不散落到适配器 —— 服务端再收紧时只改一处。
 * ⚠️ 账号槽（带 API key）**同样注入**：免费通道与认证通道的服务端策略
 * 可能共用同一层形状检查，多注入一层对认证通道无害（官方 CLI 本来也带
 * 全套工具），但缺了它就可能让匿名槽整体失效。
 */
/** DSH 的工具 schema（`GenerateOptions.tools` 的形状）。 */
export interface OpencodeHarnessTool {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}
/** OpenAI wire 侧的工具定义。 */
export interface OpencodeWireTool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}
/** 门禁工具名（服务端按这两个名字**及其定义**识别官方客户端形状）。 */
export declare const FREE_LANE_GATE_TOOLS: readonly ["read", "shell"];
/** wire 名称 → 调用方名称；响应工具调用时需要还原调用方名称。 */
export type OpencodeToolNameMap = ReadonlyMap<string, string>;
/**
 * DSH 工具 → wire 工具（**不改名**）。
 *
 * ⚠️ 这是 `options.tools` 的**唯一出口**。不下发它，模型在 wire 上看不到
 * 任何函数定义，只能用正文里的 XML 臆造工具调用 —— qoder 的用户报障
 * 「执行任务出现任务调用 xml 泄露任务终止」就是这个根因。
 *
 * ⚠️ v2 起这里**不再做大小写归并**：上游接受 `Read`/`Bash` 与注入的
 * `read`/`shell` 并存，而归并会把调用方的 `Read` 变成 `read` —— 正好撞上
 * 「同名但定义不同」的判定，反而需要改名。改名与注入统一在
 * {@link ensureFreeLaneShape} 里做。
 */
export declare function buildOpencodeTools(tools: readonly OpencodeHarnessTool[] | undefined): OpencodeWireTool[];
/**
 * 满足 v2 门禁：注入 `read`/`shell`，冲突的调用方工具改名。
 *
 * @param toolNameMap 改名表（`别名 → 调用方原名`），由响应侧用来还原名字。
 * @returns 满足门禁的 body；**已满足**时返回同一引用。
 */
export declare function ensureFreeLaneShape(payload: Record<string, unknown>, toolNameMap?: Map<string, string>): Record<string, unknown>;
export interface OpencodePayloadInput {
    model: string;
    messages: ReadonlyArray<Record<string, unknown>>;
    system?: string;
    tools?: readonly OpencodeHarnessTool[];
    temperature?: number;
    maxTokens?: number;
    /**
     * 思考档位（issue IKJJ0V）。
     *
     * ⚠️ 取自 `GenerateOptions.reasoningEffort`（品牌类型 `ReasoningEffortId`，
     * 传进来前转成普通字符串）。声明了档位就**必须真的发出去**，否则选择器只是
     * UI 装饰 —— 用户选了「高」却没有任何效果。
     */
    reasoningEffort?: string;
}
/** 构造一次 chat 请求的完整 body（已过门禁）。 */
export declare function buildOpencodePayloadWithToolMap(input: OpencodePayloadInput): {
    payload: Record<string, unknown>;
    toolNameMap: OpencodeToolNameMap;
};
/** 构造一次 chat 请求的完整 body（已过门禁）。 */
export declare function buildOpencodePayload(input: OpencodePayloadInput): Record<string, unknown>;
//# sourceMappingURL=opencode-messages.d.ts.map