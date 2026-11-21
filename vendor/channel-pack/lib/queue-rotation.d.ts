import type { AccountPool } from './account-pool.js';
import { type IdentitySlot } from './opencode-auth.js';
interface QueueOptions {
    accountPool?: AccountPool;
    resolveCredential?: (model?: string) => Promise<unknown>;
    refresh?: (accountId?: string, reason?: 'auth') => Promise<unknown>;
    currentAccountId?: () => string | undefined;
    nextAccount?: (model: string, tried: ReadonlySet<string>) => Promise<{
        accountId: string;
        credential: unknown;
    } | undefined>;
    identitySlots?: (model?: string) => Promise<readonly IdentitySlot[]>;
}
/** OpenCode 的槽在适配器内部选择，按实际发送的槽回报，不能猜账号池默认值。 */
export declare function reportQueueSlot(slot: IdentitySlot): void;
/** 凭据覆盖只活在本次迭代的异步上下文，绝不改适配器的共享默认账号。 */
export declare function withQueueAccountRotation<O extends QueueOptions, A extends object>(provider: string, options: O, create: (options: O) => A, timing?: {
    now?: () => number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): A;
export {};
//# sourceMappingURL=queue-rotation.d.ts.map