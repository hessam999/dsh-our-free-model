/**
 * Channel Pack 多账号管理的 RPC 端点注册。
 *
 * 使用 DSH 的 connection.fetch.register() 模式注册 HTTP API 端点，
 * 与 dsh-im 的 registerManagementRpc 一致。
 * 通道名 channel-pack → 路径 /api/channel-pack
 * 端点方法：account.list / account.create / account.update / account.delete /
 *           account.reorder / account.refresh / account.retest / account.retestAll /
 *           account.test / account.reset / account.resetAll / login.poll /
 *           credits.status / credits.claimAll / credits.balances /
 *           model.list / model.setDisabled /
 *           captcha.demand / captcha.carrierUrl / captcha.contribute（内部载体，
 *           载体页见 src/zcode-carrier-page.ts 与 src/captcha-carrier-server.ts）/
 *           backup.export / backup.import / backup.status
 * 另有一条 GET 路由 `/api/channel-pack/captcha-carrier`：渲染内部载体的载体页
 * （⚠ 手工诊断用；guest 加载不到它，见该路由注释里的主进程取证）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type CredentialRef } from '@deepseek-ai/dsh-credentials';
import { AccountPool } from './account-pool.js';
import type { LobsteraiAuth } from './lobsterai-auth.js';
import type { QoderAuth } from './qoder-auth.js';
import type { TraeAuth } from './trae-auth.js';
import type { ClineAuth } from './cline-auth.js';
import type { LoomyAuth } from './loomy-auth.js';
import type { RaccoonAuth } from './raccoon-auth.js';
import type { ZcodeAuth } from './zcode-auth.js';
import { type ZcodeLoginProvider } from './zcode-login.js';
import type { RaccoonCredential } from './raccoon.js';
import type { MinimaxAuth } from './minimax-auth.js';
import type { GeminiAuth } from './gemini-auth.js';
import { type CheckinStatus, type ClaimOutcome, type CreditBalance } from './credits.js';
import type { ProviderAccountEntry, RpcCreditsStatusResponse, RpcCreditsClaimAllResponse, RpcCreditsClaimSummary, RpcCreditsBalanceExtra, RpcCreditsBalancesResponse } from './types.js';
/** Channel Pack RPC API 路径 */
export declare const CHANNEL_PACK_API_PATH = "/api/channel-pack";
/**
 * 内部 captcha **载体页**的 GET 路径（与 GUI 同源，故 `<webview>` 能导航过来）。
 *
 * ⚠ 它挂在 `/api/` 前缀下，因而不是「随便一个静态页」：DSH 的 `/api` 路由会先过
 *   Connection 的 Host/Origin 栏与**浏览器会话认证**（`dsh-client-connection` 的
 *   `admit()` ⇒ 未认证回 401）。桌面版的 guest 与 GUI 是否同 partition、
 *   因而带得上那份会话 cookie，属 Task 5 的**实测项**，不在这里放宽。
 */
export declare const CAPTCHA_CARRIER_PATH = "/api/channel-pack/captcha-carrier";
/**
 * ZCode 登录渠道的白名单归一。
 *
 * ## 为什么要有这道
 *
 * `account.create` 的载荷来自**客户端自报**（RPC 入口没有 schema 校验），
 * 而 `ZcodeLoginProvider` 只是个 TypeScript 联合类型 —— 运行时任何字符串都能进来。
 * 原先只写 `req.zcodeProvider ?? 'bigmodel'`：缺省兜底是对的，但**没有校验**，
 * 传入 `zhiPu` / `ZAI`（大小写不同）这类未登记值会被原样送进
 * `startZcodeLogin` → 打到一个不存在的授权端点，表现为
 * 「授权页打不开」或「轮询到超时」这类极难定位的失败。
 *
 * ## 为什么**回落**而不是报错
 *
 * 回落方向与既有的 `?? 'bigmodel'` 兜底一致：老客户端、新客户端、
 * 手改过载荷的用户都还能登录（只是用缺省渠道）。且前端只会下发下拉框里的
 * 两个值，正常路径永远走不到这条分支 —— 它是**兜底**不是**主路径**。
 * 真正非法的输入会留一条 `console.warn`（与本文件其余告警同一惯例），
 * 便于事后发现是哪个客户端在发怪值。
 *
 * @param raw 客户端自报的渠道（可能未登记）
 * @returns 可安全交给 `zcode.startLogin` 的渠道
 */
export declare function normalizeZcodeLoginProvider(raw: string | undefined): ZcodeLoginProvider;
/**
 * 构造 Raccoon 账号的**展示名**：`RaccoonAva (1100)`。
 *
 * ## 为什么要追加手机号尾号
 *
 * 服务端的 `name` 是**自动生成的默认名**（实测本机账号为 `RaccoonAva`，
 * 即「Raccoon」+ 随机串）。实证：
 *
 * - `GET /user_info` 的 `data.name = "RaccoonAva"`；
 * - JWT payload 里同样带 `name: "RaccoonAva"`（官方客户端就是读这个：
 *   `M = () => { ... userName: t.name, id: t.sid }`）；
 * - `wechat_bindings` 只有 `[{id, bound_at}]` —— **没有微信昵称/头像**。
 *   微信扫码走 `snsapi_login`（只给 openid），要昵称需额外申请
 *   `snsapi_userinfo`，这里显然没申请。
 *
 * 所以「显示 `RaccoonAva`」本身与官方一致、**不是取错字段**；但它是默认名，
 * 注册第二个账号时服务端很可能又给一个相近的名字 → 多账号重名、无法区分。
 *
 * 修法参考 Loomy（`Loomy 2222`）：这边有真实名字可用，故**保留原名再挂尾号**，
 * 兼顾「看得出服务端原名字」与「多账号可区分」。
 *
 * 退化顺序：昵称 + 手机号尾号 → 昵称 + 用户 id → 昵称 → 账号 id。
 * ⚠️ 手机号取**后 4 位**（够区分且不完整暴露号码）。
 */
export declare function buildRaccoonNickname(credential: Pick<RaccoonCredential, 'nickname' | 'phone' | 'user_id'>, fallbackId: string): string;
/**
 * 支持「锁定永久积分」的 provider 白名单。
 *
 * ⚠️ **必须与前端 `credits-capabilities.js` 的 `supportsPermanentLock` 一致**：
 * 前端拿它决定要不要渲染按钮、要不要发读取请求；后端拿它拒绝越权写入。
 * 两边不一致的后果是「按钮出现但点了报错」或「功能存在却点不出来」。
 *
 * 当前只有 Loomy 支持锁定永久积分：其服务端给出 dailyBalance 与 balance。
 */
export declare const PERMANENT_LOCK_PROVIDERS: ReadonlySet<string>;
/**
 * 汇总一次批量领取的结果。
 * 纯函数，便于单测；inactive（无资格/活动结束）与 failed 分开计数，
 * 因为前者是正常的业务状态、后者才是需要用户关注的问题。
 *
 * ★ **按单位分开累加**（2026-10-04，真实缺陷）：`totalCredit` 这个标量会把
 * 不同量纲加在一起（ZCode 的 1 亿 token + 100 积分 = `100000100`），单位信息
 * 一旦在这一层丢掉，下游无论怎么写文案都只能标一个「积分」。故同时产出
 * `totalByUnit`，消费方一律用它（见 `RpcCreditsClaimSummary.totalByUnit`）。
 *
 * ⚠️ `totalCredit` **保留原语义**（跨单位求和），只为不破坏既有契约；
 * **不要**在展示路径上用它 —— 那正是本缺陷的成因。
 */
export declare function computeClaimSummary(outcomes: readonly ClaimOutcome[]): RpcCreditsClaimSummary;
/**
 * 积分端点的可注入依赖。
 *
 * 抽出这一层是为了让「逐账号处理」能脱离 `ctx.connection.fetch` 注册流程
 * 单独单测：端点内不做任何业务判断，只负责取账号列表并转交下面的纯函数。
 */
export interface CreditsEndpointDeps<TCredential = unknown, TProduct = unknown> {
    /**
     * 解析凭据引用。
     * 按设计该接口**不可信**（凭据可能已被外部删除、provider 后端异常），
     * 实现允许抛错，调用方必须把异常算在单个账号头上。
     */
    resolve(ref: CredentialRef): Promise<{
        value: string;
    } | undefined>;
    /** 查询对应渠道的签到状态。 */
    fetchStatus?: (credential: TCredential, product: TProduct) => Promise<CheckinStatus | null>;
    /** 执行对应渠道的签到领取。 */
    claim?: (credential: TCredential, product: TProduct, entry: ProviderAccountEntry) => Promise<ClaimOutcome>;
    /** 查询对应渠道的积分余额。 */
    fetchBalance?: (credential: TCredential, product: TProduct) => Promise<CreditBalance | null>;
    /**
     * 余额查询的**带原因**版本（优先于 {@link fetchBalance}）。
     */
    fetchBalanceDetailed?: (credential: TCredential, product: TProduct) => Promise<{
        balance: CreditBalance | null;
        error?: string;
        extra?: RpcCreditsBalanceExtra;
    }>;
    /** 单账号异常时的告警出口（不参与控制流）。 */
    warn?: (message: string) => void;
    /**
     * 领取前是否先查一次签到状态（默认 `true`）。
     *
     * LobsterAI 的领取流程**自身就是多步的**（slot → context → check_in），
     * `claimedToday` / `actions` 判断已在内部完成并会返回对应的
     * `already-claimed` / `inactive`，外部再查一次纯属重复请求 ——
     * 故它传 `false` 跳过预检，直接交给 `claim`。
     */
    precheckStatus?: boolean;
}
/**
 * 逐账号收集签到状态（顺序执行，避免并发触发风控）。
 *
 * **包含已停用账号**：停用只影响账号池的自动选择与限流切换，不改变账号本身
 * 是否已签到。用户要看到的是「这个账号今天领了没」，因此这里不过滤 enabled。
 *
 * 关键约束：**凭据解析也在 try 之内**。`credentialRef()` 会对名称做正则校验
 * （非法名称抛 TypeError），`deps.resolve()` 也可能抛错。若把它们留在 try
 * 之外，任一账号的异常都会冒泡到 handleMethod 外层 catch，使整批请求以
 * `channel-pack/handler-failed` 失败——违背「单个账号失败不中断整体」的设计。
 */
export declare function collectCreditsStatus<TCredential = unknown, TProduct = unknown>(accounts: readonly ProviderAccountEntry[], product: TProduct, deps: CreditsEndpointDeps<TCredential, TProduct>): Promise<RpcCreditsStatusResponse['accounts']>;
/**
 * 逐账号执行一键领取（顺序执行，单个账号失败不中断整体）。
 *
 * **包含已停用账号**：签到领取与「是否参与账号池自动选择」无关 —— 停用的
 * 账号同样有当日积分可领，用户点「一键领取」时期望所有账号都尝试一遍。
 * 停用只影响限流切换时的候选集合，不影响这里。
 *
 * 与 collectCreditsStatus 同理：凭据解析位于每个账号自己的 try 之内，
 * 异常只让该账号记为 failed。
 */
export declare function collectClaimResults<TCredential = unknown, TProduct = unknown>(accounts: readonly ProviderAccountEntry[], product: TProduct, deps: CreditsEndpointDeps<TCredential, TProduct>): Promise<RpcCreditsClaimAllResponse>;
/**
 * 逐账号收集积分余额（顺序执行，避免并发触发风控）。
 *
 * 与 {@link collectCreditsStatus} 的关键差异：**这里保留失败原因**。
 * 余额查不到时用户最需要知道"为什么"（凭据过期？网络不通？），把它降级成
 * 一个 null 会让账号卡片显示成空白或 0 分，反而误导。因此失败时带上 error 文案。
 *
 * **包含已停用账号**：停用只影响账号池的自动选择，与"这个账号还剩多少积分"
 * 无关——用户就是想在同一个列表里看全部账号的余额。
 *
 * 凭据解析同样位于每个账号自己的 try 之内：单个账号的凭据缺失/损坏/名称非法
 * 都不会冒泡中断整批。
 */
export declare function collectCreditBalances<TCredential = unknown, TProduct = unknown>(accounts: readonly ProviderAccountEntry[], product: TProduct, deps: CreditsEndpointDeps<TCredential, TProduct>): Promise<RpcCreditsBalancesResponse['accounts']>;
/** RPC 的可选配置；追加字段以兼容现有 provider / modelAdapters 的位置参数调用。 */
export interface ChannelPackRpcConfig {
    disableOpencode?: boolean;
    /**
     * 渠道出网实现（`src/index.ts` 里的 `network.fetch`）。
     *
     * ⚠️ 余额/配额这类**面板触发的附属查询**必须走它，不能回落到全局裸
     * `fetch`：裸 fetch 不经过插件出口代理，症状正是「登录/续期/推理都正常，
     * 只有配额查询报 fetch failed」（issue #762）。
     */
    fetcher?: typeof fetch;
}
/**
 * 注册 Channel Pack 管理 API 端点。
 *
 * `connection` 服务只存在于 Web bundle；这里用**惰性注入**而非插件级静态
 * `inject`，因此在 headless / CLI profile 下本模块正常加载、只是不注册端点，
 * 而不是把整个插件树卡在 pending（那会让 profile 启动直接失败）。
 */
export declare function registerChannelPackRpc(ctx: Context, pool: AccountPool, lobsterai: LobsteraiAuth, qoder: QoderAuth, 
/** Qoder **中国版**实例（与 `qoder` 同协议、不同 product；RPC 分支按注册表分派）。 */
qoderCn: QoderAuth, trae: TraeAuth, cline: ClineAuth, loomy: LoomyAuth, raccoon: RaccoonAuth, 
/** MiniMax Code **中国版**实例（OAuth 设备码 + PKCE，与 Qoder 同型但协议不同）。 */
minimax: MinimaxAuth, zcode: ZcodeAuth, 
/**
 * Gemini（Google Cloud Code Assist 免费线）实例（本地回调 OAuth）。
 *
 * ⚠️ **必须排在最后一个 provider 形参位**（即 `zcode` 之后、`modelAdapters`
 * 之前）：本仓库全部 `registerChannelPackRpc` 调用点都是**位置传参**，历史上已因
 * 少传/插队错位复发 6 次。新 provider 一律**追加**在末尾，既有的 14 个调用点
 * 才不用逐个补占位。
 */
gemini: GeminiAuth, 
/**
 * provider → 适配器实例（可选）。
 *
 * 用于「显示列表」拿到**不受用户黑名单影响**的全量目录（`listAllModels`），
 * 使被关闭的模型也能显示正确的展示名（含倍率），而不是退化成裸 id。
 * 省略时退化为只用 `ctx.llm.listModels()` 的历史行为。
 */
modelAdapters?: Readonly<Record<string, ModelCatalogSource>>, config?: ChannelPackRpcConfig): void;
/**
 * 「显示列表」所需的最小适配器接口：能给出**不套用户黑名单**的完整目录。
 *
 * 只声明用到的方法（结构化类型），避免让本模块依赖五个具体适配器类。
 */
export interface ModelCatalogSource {
    listAllModels(): readonly {
        id: string;
        name: string;
        isFree?: boolean;
    }[];
}
//# sourceMappingURL=channel-pack-rpc.d.ts.map