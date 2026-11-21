/** 账号渠道共用的令牌凭据结构与到期时间解析，不执行网络或存储操作。 */
export interface StoredTokenCredential {
    /** 访问令牌（Authorization: Bearer <access_token>）。 */
    access_token: string;
    /** 刷新令牌。 */
    refresh_token: string;
    /** token 过期时间（原始值，可能为毫秒时间戳或 ISO 字符串）。 */
    expires_at?: string;
}
export declare function credentialExpiresAtMs(credential: StoredTokenCredential): number | undefined;
/**
 * 从 JWT 的 payload 读取 `exp`（秒）并换算为毫秒；非 JWT 或解析失败返回 undefined。
 * 仅做 base64url 解码，不验签——该值只用于展示与续期调度。
 */
export declare function jwtExpiresAtMs(token: string): number | undefined;
//# sourceMappingURL=credential-expiry.d.ts.map