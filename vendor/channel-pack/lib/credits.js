/** 各渠道共用的积分类型、单位与格式化工具。具体网络协议由各渠道注入。 */
/**
 * 把额度规整为两位小数。
 *
 * 用 `Math.round(v * 100) / 100` 而不是 `toFixed` 后 parse：后者对
 * 负数与极大值的行为不一致，且返回字符串会污染数值类型。这里只处理
 * 服务端下发的正数额度，乘法取整足够且结果仍是 number。
 *
 * 导出供其它 provider 复用（`qoder-credits.ts`）：多包相加的浮点尾数噪声
 * 是所有 provider 的共同问题，各写一份必然分叉。
 */
export function roundCredits(value) {
    return Math.round(value * 100) / 100;
}
/**
 * 把单位串归一到**展示口径**，返回 `'token'` 或 `'credit'`。
 *
 * ## 为什么需要它（真实缺陷，2026-10-03）
 *
 * 根因不在「多账号没法合计」，而在**服务端把同一个单位拼成两种写法**（实测逐包
 * 原值）：账号 `…01CC739A` 的包是 `CapacityUnit: 'credit'`（Bonus Pack 241.78）
 * 与 `'credits'`（Free Plan Subscription 100），账号 `…297957E1` 的是 `'credits'`。
 * 客户端的折叠态按**原始字符串**分组 ⇒ `credit` 与 `credits` 各成一组 ⇒ 两个
 * 账号落进两个分组，各自渲染一次「积分」标签。
 *
 * ⚠️ 口径：**分组键必须与展示名同源**。凡是展示层会显示成「积分」的单位串，就必须
 * 落进同一个分组。故分组前一律走本函数，`token` 与积分**不互相折算**（分两组）。
 *
 * ⚠️ 与客户端 `plugin-src/client/credits-format.js` 的 `normalizeUnit`
 * **必须逐字等价**：宿主算套餐读数、客户端算余额分组，两边不一致就会出现
 * 「套餐按一个单位、余额按另一个单位」的自相矛盾。一致性由
 * `tests/unit/usage-badge-client.spec.ts` 逐项比对锁死。
 *
 * ⚠️ **不要用它改写 `CreditPackage.unit`**：那里要保留服务端原值（设置页的逐包
 * 明细、`badgePlanFor` 的包名匹配都依赖它）。归一化只发生在「当分组键/展示名用」
 * 的那一步。
 */
export function normalizeCreditUnit(unit) {
    return unit === 'token' ? 'token' : 'credit';
}
/**
 * 把任意值归一到 {@link ClaimUnit}（缺省 `credit`）。
 *
 * ⚠️ 存在的理由：`ClaimOutcome.unit` 是**可选**字段，且要面对 RPC 传来的
 * 未知值。直接用 `normalizeCreditUnit` 要求调用方先做 `typeof` 判断，
 * 每个消费点各写一遍必然漂移。
 */
export function claimUnitOf(unit) {
    return normalizeCreditUnit(typeof unit === 'string' ? unit : '');
}
/**
 * ★ 额度数值的**单位感知渲染**（宿主侧，2026-10-04）。
 *
 * ## 为什么宿主也需要格式化（真实缺陷，用户报障）
 *
 * 用户报障原文：
 * > 插件的这个一键签到，Zcode 获得的是 token 数量，但是这里显示成获得积分。
 * > 正文「…ZCode（智谱）+100000000（共 +100000100）」
 * > 应当显示为「…ZCode（智谱）+100Mtoken（共 +100Mtoken, +100积分）」
 *
 * 根因不在某一处文案，而在**汇总把不同量纲加成了一个标量**：
 * `computeClaimSummary` 把 1 亿 token 与 100 积分相加得 `totalCredit`，
 * 单位信息在这一层就丢了；下游无论怎么写都只能标一个「积分」。
 * 故修法是**让单位一路传到渲染层**（`totalByUnit`），而不是在文案里猜。
 *
 * ⚠️ 自动签到的逐渠道文字（`auto-checkin.ts` 的 `describeChannel` /
 * `describeRun`）是**宿主侧产出、落盘后原样展示**的字符串，没有机会交给
 * 客户端格式化 —— 故宿主必须自带一份。这与 `normalizeCreditUnit` 的处境
 * 同因（客户端 bundle 不能 import 宿主代码），一致性由
 * `tests/unit/claim-unit-parity.spec.ts` 逐项锁死。
 *
 * ⚠️ **积分不压缩、token 才压缩**：积分余额的现实量级是 `123456.78`
 * （IDE 顶部就是这个精度），压成 `123.46K` 会让用户无法与官方界面核对；
 * 而 token 动辄上亿，不压缩根本读不出量级。这与客户端
 * `credits-format.js` 的 `formatCredits` / `formatTokens` 口径逐字一致。
 */
/** 积分：整数不带小数位，有小数才保留两位（与客户端 `formatCredits` 一致）。 */
export function formatCreditAmount(value) {
    if (!Number.isFinite(value))
        return '?';
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
/** token：`>= 1e6` → `94.54M`；`>= 1e3` → `945.39K`；其余取整（与客户端 `formatTokens` 一致）。 */
export function formatTokenAmount(value) {
    if (!Number.isFinite(value))
        return '?';
    const abs = Math.abs(value);
    if (abs >= 1e6)
        return `${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3)
        return `${(value / 1e3).toFixed(2)}K`;
    return String(Math.round(value));
}
/** 单位的展示名（与客户端 `unitLabel` 一致）。 */
export function claimUnitLabel(unit) {
    return unit === 'token' ? 'Token' : '积分';
}
/**
 * 一个「数值 + 单位」的完整读数，如 `100.00MToken` / `800积分`。
 *
 * ⚠️ **数值与单位之间不留空格**：这是本仓库既有的展示惯例（用量徽标里
 * ZCode 的余额就渲染成 `94.54MToken`，见 `badge-model.js` 的 `readingOf`），
 * 也与用户在本次报障里给出的期望文案 `+100Mtoken` 同形。
 */
export function formatUnitAmount(value, unit) {
    const text = unit === 'token' ? formatTokenAmount(value) : formatCreditAmount(value);
    return `${text}${claimUnitLabel(unit)}`;
}
/**
 * 把按单位分组的**领取所得**拼成一段文案：`+100.00MToken, +100积分`。
 *
 * ⚠️ **每个单位各带一个 `+`**（不是整段共用一个）：这是用户报障时给出的
 * 期望文案的形态 —— 原文「应当显示为 `…ZCode（智谱）+100Mtoken
 * （共 +100Mtoken, +100积分）`」。整段共用会渲染成 `+100Mtoken, 100积分`，
 * 第二个单位看起来像「不是本次领到的」。
 *
 * ⚠️ 函数名带 **Gains**：`+` 是「本次获得」的语义，**不要**拿它渲染余额
 * （余额没有 `+`）。这是把 `+` 放进本函数而不是留给调用方拼的理由 ——
 * 一旦调用方各拼各的，两处界面就会漂移（本仓库已有多次先例）。
 *
 * ⚠️ **顺序固定 token → credit**（不是字母序）：用户给的期望文案就是
 * token 在前。顺序固定也让渲染稳定，不因对象键序变化而抖动。
 *
 * ⚠️ 只列**非零**单位：给「本次没有 token 领取」的渠道渲染 `+0Token` 是噪音。
 * 全为零时返回 `null`，调用方据此**整段不渲染**（而不是渲染一个空括号）。
 */
export function formatClaimGains(totals) {
    if (totals === undefined || totals === null || typeof totals !== 'object')
        return null;
    const parts = [];
    for (const unit of ['token', 'credit']) {
        const value = Number(totals[unit]);
        if (!Number.isFinite(value) || value <= 0)
            continue;
        parts.push(`+${formatUnitAmount(value, unit)}`);
    }
    return parts.length === 0 ? null : parts.join(', ');
}
//# sourceMappingURL=credits.js.map