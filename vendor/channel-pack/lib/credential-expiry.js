export function credentialExpiresAtMs(credential) {
    const raw = credential.expires_at;
    if (typeof raw === 'string' && raw.length > 0) {
        // 纯数字：视为时间戳。> 1e12 为毫秒，否则为秒。
        if (/^\d+$/.test(raw)) {
            const value = Number(raw);
            return value > 1_000_000_000_000 ? value : value * 1000;
        }
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed))
            return parsed;
    }
    return jwtExpiresAtMs(credential.access_token);
}
/**
 * 从 JWT 的 payload 读取 `exp`（秒）并换算为毫秒；非 JWT 或解析失败返回 undefined。
 * 仅做 base64url 解码，不验签——该值只用于展示与续期调度。
 */
export function jwtExpiresAtMs(token) {
    if (typeof token !== 'string' || token.length === 0)
        return undefined;
    const parts = token.split('.');
    if (parts.length < 2)
        return undefined;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=credential-expiry.js.map