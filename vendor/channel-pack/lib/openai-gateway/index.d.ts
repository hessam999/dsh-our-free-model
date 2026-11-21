import type { Context } from '@deepseek-ai/cordis';
/** 账号池里读网关开关的最小接口（避免为此把整个 pool 类型拖进来）。 */
interface GatewaySwitchSource {
    gatewayEnabled(): boolean;
}
/**
 * 启动对外兼容网关，并把关闭动作绑定到插件生命周期。
 *
 * ⚠️ 必须**同时**保护创建（同步）与收敛（异步）：工厂闭包体内的
 * `createOpenAiGateway()` 会同步执行 `resolveGatewayConfig()`（端口 env 非法即抛）
 * 与 `loadOrCreateApiKey()`（home 不可写即抛），只 catch 异步部分接不住 ——
 * 这正是初版只给 `gateway.start()` 加 catch 时留下的缺陷。
 */
export declare function mountOpenAiGateway(ctx: Context, pool?: GatewaySwitchSource): void;
export {};
//# sourceMappingURL=index.d.ts.map