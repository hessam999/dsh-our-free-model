/**
 * 「锁定永久积分」开关表的**独立**持久化文档。
 *
 * ## 为什么不与账号池同放一份 state.json（真实风险，用户 2026-09-29 定案）
 *
 * `$DSH_HOME/channel-pack/state.json` 是 **dsh home 级、全局共享**的：同机上多个
 * profile 用的是同一个 home，于是一台机器上的 `desktop` 与 `web` / `tui` /
 * `headless` 读到的是**同一份**账号池文档。
 *
 * 而本插件的存储是**整体替换**语义（`store.save(全量 state)`）。于是：
 *
 * ⚠️ 后果不是显示问题，而是**行为**问题：解锁后选号继续消耗永久积分，
 * 而积分烧掉**不可撤回**。这与本文件反复记录的那类缺陷（"整体写入漏带字段
 * 就会被静默抹掉"）同源，区别只是这次漏带的一方是**另一条工作区里我们无法
 * 修改的旧版本代码**（用户刻意把 desktop 与 web 分成两个互不影响的工作区）。
 *
 * ⇒ 结论：**把锁定表拆到本文件这份独立文档**，旧代码从不读写它，两个工作区
 * 因此在这一点上真正互不干扰。
 *
 * ## 与旧版 state.json 的兼容（单向迁移，只认"文件不存在"）
 *
 * 该字段早先住在 state.json 的 `loomyPermanentLocked` 里，老用户磁盘上只有它。
 * 故本文档**不存在**时读老字段（保住升级前的状态）；一旦本文档存在，它就是
 * **唯一权威**，不再回看老字段 —— 否则用户在 desktop 里解锁 Loomy 后，会被
 * 老字段里那个陈旧的 `true` 重新拉回锁定态（写侧同时同步老字段，见 AccountPool）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PermanentLockMap } from './channel-pack-store.js';
/** 独立文档的文件名（与 state.json 同目录）。 */
export declare const PERMANENT_LOCKS_FILE = "permanent-locks.json";
/** 锁定表后端的种类：文件（正常）或内存（无法定位 home 时的显式降级）。 */
export type PermanentLockStoreKind = 'file' | 'memory';
/** 读取结果：区分「文档不存在」与「存在但是空表」—— 见文件头的迁移判据。 */
export type PermanentLockRead = {
    exists: false;
    locks: PermanentLockMap;
} | {
    exists: true;
    locks: PermanentLockMap;
};
/**
 * 独立文档的读写接口（同步读、异步写，与 `ChannelPackStore` 同款约定）。
 */
export interface PermanentLockStore {
    readonly kind: PermanentLockStoreKind;
    /** 载入锁定表；文档不存在时 `exists: false`（让调用方决定如何迁移）。 */
    load(): PermanentLockRead;
    /** 整体写入锁定表（原子写）。 */
    save(locks: PermanentLockMap): Promise<void>;
}
/**
 * 创建锁定表后端。
 *
 * home 的解析与账号池**同一个函数**（`resolveChannelPackHome`），保证两份文档
 * 永远落在同一目录 —— 否则会出现「账号池在 A 处、锁定表在 B 处」的分裂。
 */
export declare function createPermanentLockStore(ctx: Context): PermanentLockStore;
//# sourceMappingURL=permanent-lock-store.d.ts.map