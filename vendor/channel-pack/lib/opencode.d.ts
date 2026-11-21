/**
 * OpenCode 凭据结构、指纹派生与代理地址归一。
 *
 * ## 指纹依据（v2 客户端形状，2026-10-14 起）
 *
 * 免费车道自 2026-10-14 起按 **v2 客户端**校验，本文件与
 * `src/upstream.js`（插件自己的免费车道）保持同一套形状：
 *
 * - `User-Agent` 必须是 `opencode/<channel>/<version>/<client>`，major ≥ 2；
 *   旧的 `opencode/1.18.x` 被按名字拒掉（403 FreeTierError）。
 * - 头集是 `x-opencode-session` + `x-opencode-session-id` + `x-session-affinity`
 *   + `x-session-id`（四个同值）+ `x-opencode-project` + `x-opencode-client`。
 * - **不发 `x-opencode-request`**：那是 v1 专用头，v2 收到即 403。
 *
 * ⚠️ 本文件旧注释（1.18.22 源码逐行核对）说「不发 x-session-affinity /
 * x-session-id」—— 那条结论属于 v1 客户端，v2 已反过来要求它们，故删除。
 *
 * ## 为什么 project id 用 40 hex
 *
 * 真实取值是 `sha1("git-remote:" + 归一化 remote URL)`
 * （`packages/core/src/project.ts` 的 `resolve()`），本机 opencode.db 实测
 * 形如 `895debfe16b1fcca5ebfa2e24b7b914797e632ec`。
 * opencode2dsh 用的是 `prj_<24hex>`（无依据的服务端形状猜测），我们跟真实 CLI 同形。
 *
 * ## session id 的形状不是随意选的
 *
 * Zen 的 FreeTier 门禁对 session id 做了正则校验：
 * `ses_` + 12 位小写 hex + 14 位 base62（见 `deriveSessionId`）。形状不对就是
 * 403 FreeTierError；12 位 hex 还必须是**铸造形状**（`~(ms·0x1000+seq)`），
 * 且 seq 必须很小（上游实测 0–16 通过、≥100 拒绝）。
 */
/** 一份可持久化的指纹。 */
export interface OpencodeFingerprint {
    /** 40 位小写 hex，与真实 CLI project id 同形。 */
    projectId: string;
    /** 轮换代次；+1 后 project id 整体变化。 */
    generation: number;
}
/** 账号凭据（存 `ctx.credentials`，不进 settings 明文）。 */
export interface OpencodeCredential {
    /** Zen API key（`sk-…`），身份本体；匿名槽用字面量 `public`。 */
    api_key: string;
    nickname?: string;
    /** 首次添加时生成；旧账号缺失时由 `newAccountFingerprint` 补。 */
    fingerprint?: OpencodeFingerprint;
    /** 代理 URL；空/缺省 = 直连（与其它无代理账号共享本机出口）。 */
    proxy?: string;
}
/**
 * 派生 project id。
 *
 * @param identity  账号标识（接线层传 API key；匿名槽传固定串 `'anonymous'`）。
 * @param generation 轮换代次。
 *
 * 刻意**不**把 key 全文直接进哈希链的明文位置：identity 先过 SHA-256，
 * 再以 `git-remote:` 前缀走 SHA-1 —— 既复用真实 CLI 的派生外形，
 * 又使明文 key 片段不出现在任何可从 project id 反推的中间量。
 */
export declare function deriveProjectId(identity: string, generation: number): string;
/**
 * 派生 session id：`ses_` + 12 位小写 hex（6 字节时间戳）+ **14** 位 base62。
 *
 * ## ⚠️⚠️ 尾段是 14 而不是 26（真实报障 2026-10-01）
 *
 * 官方 `id/index.ts` 里写的是 `const LENGTH = 26`，但那是**整段尾部长度**
 * （`randomBase62(LENGTH - 12)`），不是随机段长度。我第一版误读成「随机 26 位」，
 * 产出 `ses_` + 38 字符，形状不对 ⇒ 匿名通道一律 403 `FreeTierError`
 * （"free tier can only be used from within OpenCode"）。此外，前 12 位也不能
 * 只是任意随机 hex，网关会校验它是否来自官方的时间铸造算法。
 *
 * ⚠️ **每次调用都是新值**：调用方负责在**一次 DSH 会话内**缓存复用
 * （见 `opencode-adapter.ts` 的 `sessionIds`）。每次都随机会让同一会话
 * 在服务端被看成多个独立会话，反而破坏亲和。
 */
export declare function deriveSessionId(): string;
/** UA：本机版本探测值（若已是 v2 形状）或产品常量。 */
export declare function opencodeUserAgent(override?: string): string;
/**
 * 本机 `opencode --version` 的输出（形如 `2.0.26`）→ v2 UA。
 *
 * ⚠️ 旧实现直接拼 `opencode/${version}`，那是 v1 形状，v2 门禁一律 403。
 * 探测不到版本（本机没装 opencode 是**正常情况**）时返回 undefined，由
 * {@link opencodeUserAgent} 回落到产品常量。
 */
export declare function opencodeUserAgentForVersion(version?: string): string | undefined;
/** 构造发往 Zen 的完整指纹头集（v2 形状）。 */
export declare function opencodeHeaders(fingerprint: OpencodeFingerprint, sessionId: string, userAgent: string): Record<string, string>;
export type OpencodeProxyKind = 'http' | 'socks5';
export interface NormalizedProxy {
    kind: OpencodeProxyKind;
    /** 可直接交给 dispatcher 的完整 URL。 */
    url: string;
    /** 展示用（脱敏，密码以 *** 代替）。 */
    label: string;
}
/**
 * 归一用户输入的代理地址。
 *
 * 接受三类（设计文档 §3）：本地代理客户端端口（裸 `host:port`）、HTTP(S)、SOCKS5。
 * 空串表示「清除代理」，返回 `ok: false` 让调用方走清理分支。
 */
export declare function normalizeProxy(input: string): {
    ok: true;
    proxy: NormalizedProxy;
} | {
    ok: false;
    reason: string;
};
//# sourceMappingURL=opencode.d.ts.map