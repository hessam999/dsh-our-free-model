# EAC Gateway (Cloudflare Worker) Deployment & Rotation

The Worker is the **sole secret holder** for the co-paid lane: what's sealed in the plugin is only this gateway's address and a signing secret — the relay's real key lives only in the Worker's environment variables. Reverse-engineering the plugin yields nothing but an indirect entry that can be revoked instantly.

```
Plugin (signed request, no key) → Worker (verify sig/allowlist/ratelimit, inject real key) → Relay
```

## Signature Contract (implemented and locked in worker.js)

```
x-ofm-timestamp: <unix ms>
x-ofm-signature: hex(HMAC-SHA256(secret, "<ts>\n<METHOD>\n<path>\n<hex(sha256(body))>"))
```

- Timestamp drift beyond `CLOCK_SKEW_SECONDS` (default 600s) = rejected (anti-replay);
- Constant-time signature comparison; any secret in `SIGNING_SECRETS` matching = admitted (new and old coexist during rotation);
- Only `GET /v1/models` and `POST /v1/chat/completions` allowed; everything else 404;
- Models outside `MODELS` allowlist = 403; request body exceeding `MAX_BODY_BYTES` = 413;
- Optional `RATE_LIMITER` binding for per-IP rate limiting.

## Admin Dashboard & Rate Limiting (self-hosted gateway only)

Self-hosted deployments (method zero) include three layers of abuse protection, all configured in `.env`:

- `CONCURRENCY_PER_IP=5` — per-IP concurrency limit (counts only chat forwards; over limit = 429). Default 5: a single LLM stream occupies an upstream connection for tens of seconds to minutes; free relays can't handle large concurrent spikes. The old default of 20 let a single IP saturate the upstream connection pool and bring down the whole machine (the dashboard itself became inaccessible);
- `RATE_LIMIT_PER_MINUTE=60` / `RATE_LIMIT_PER_DAY=1000` — per-IP rate and daily quota;
- `POOL_PRESSURE_BUSY=30` / `POOL_PRESSURE_OVER=80` — global in-flight concurrency thresholds for load verdicts (0 = off): snapshot reports "busy"/"overloaded" to the plugin's pool panel; event loop mean delay ≥100ms/≥300ms forces the same verdicts regardless of counters. Tune to your server's actual capacity;
- `ADMIN_TOKEN=<random string>` — admin dashboard token. Once set, open `https://<gateway-domain>/eac/stats?t=<ADMIN_TOKEN>`: request heatmap (weekday×hour), 72-hour request curve, token usage pie charts by IP and by model, per-IP detail table (requests, frequency, tokens, rejections, concurrency peaks). Dashboard auto-refreshes every 30s; stats persisted to `stats.json` (survives restart); IPs stored as salted hashes (non-reversible).

**SSE Pre-flush** (`SSE_PRELUDE_SECONDS=15`, 0 = off) enabled by default: once a chat turn passes verification, immediately return 200 + `text/event-stream` headers + `: keepalive` comment frames; real frames follow when upstream produces tokens. This is for Cloudflare (~100s origin timeout, unadjustable on free plan) and nginx (default 60s read timeout) — reasoning models often need 30–140s for first token; without pre-flush the middle layer cuts it as 504/524 HTML error pages. Post-pre-flush upstream refusals (e.g., relay 5xx) delivered as in-stream `data: {"error":…}` frames, classified by plugin same as error envelopes; gateway logs and dashboard still record real upstream status codes.

The New API dashboard itself doesn't account by IP; these views are provided by the gateway. Cloudflare deployment (method one) has no in-process state; these three layers are self-hosted only.

## GitHub Authorization Gate (self-hosted)

The gate answers "who can use EAC", not "is this request from the plugin". The signing secret sealed in the plugin is extractable by anyone, so the real per-person gate must sit at the gateway — the only place holding the relay key.

```
Plugin (signature + x-ofm-user token) → Gateway (verify sig + verify token + verify star) → Relay
```

- Only `POST /v1/chat/completions` requires token; `GET /v1/models` stays open so plugin can list EAC models pre-login (with lock indicator).
- Token issued by gateway after browser GitHub login **and starring the repo** (32 random bytes, server stores only SHA-256); plugin auto-collects; no copy-paste needed.
- Star checked via `GET /user/starred/<REQUIRE_STAR_REPO>`: 204 = starred, 404 = not starred. Unstarred logins retain a "recheck" ticket (30 min); user stars then clicks once, no re-login needed.
- **Periodic recheck**: every `STAR_RECHECK_HOURS` (default 12) using stored GitHub auth; removed star = token revoked. GitHub network errors/rate limits (5xx, 403, timeout) preserve existing verdict — never wrongly revoke authorized users; GitHub 401 (user revoked app auth) = invalid, requires re-login.
- **Per-account rate limits**: `TOKEN_RATE_LIMIT_PER_MINUTE` / `TOKEN_RATE_LIMIT_PER_DAY` / `TOKEN_CONCURRENCY_PER_USER` each default to their per-IP counterparts — shared tokens can't bypass quotas by switching IPs.
- User store `users.json` (0600, same dir as `stats.json`): GitHub id / login / token hash / star verdict; GitHub auth encrypted with AES-256-GCM (key `USER_STORE_KEY`, falls back to first signing secret), used only for star recheck. Deleting this file revokes all tokens (users must re-login).
- Environment variables:

  ```ini
  GITHUB_CLIENT_ID=<OAuth App Client ID>
  GITHUB_CLIENT_SECRET=<OAuth App Client Secret>
  REQUIRE_STAR_REPO=Ebony-Vinyl/dsh-our-free-model
  REQUIRE_USER_TOKEN=0        # 0=compatibility (track only, no refusal); 1=chat requires valid token
  STAR_RECHECK_HOURS=12
  PUBLIC_ORIGIN=https://<gateway-domain>   # for OAuth callback URL; empty = derive from request headers
  USER_STORE_KEY=<32+ byte random, e.g. openssl rand -base64 32>
  ```

- **GitHub OAuth App** (create with repo owner account, 1 min): GitHub → Settings → Developer settings → OAuth Apps → New OAuth App; Homepage URL = repo URL; **Authorization callback URL must be exactly `https://<gateway-domain>/eac/auth/github/callback`**; copy Client ID, generate Client Secret, put only in server's `.env` (600 perms), never in repo or plugin. Only `read:user` scope.
- **Cutover sequence**: deploy with `REQUIRE_USER_TOKEN=0` (old plugin works) → release plugin with login entry → announce → flip `REQUIRE_USER_TOKEN` to `1` and restart gateway. That's the entire switch; rollback is the reverse (set back to 0).
- Gateway includes an auth page (`{mount}/auth/github/start|callback|recheck`) and JSON endpoints for plugin (`{mount}/auth/poll`, `{mount}/auth/status`, `{mount}/auth/logout`, `{mount}/auth/ack`), all under `{mount}/auth/*`; existing nginx `/eac/` proxy passes through **no nginx changes needed**. If site WAF blocks, just allow `/eac/auth/*` in that site's URL whitelist.
- **GitHub egress uses `node:https`, not global fetch** — tested on live gateway host: undici (global fetch) always `UND_ERR_CONNECT_TIMEOUT` to GitHub, while `node:https` on same machine gets responses in milliseconds (403/404 are real GitHub replies). `auth-github.mjs`'s `nodeFetch` exists for this; changing servers needs no config changes; offline suite uses injected stubs, unaffected.
- Dashboard `/stats-data` `auth` field reports authorized / known / pending counts and enforcement status.

New plugin uses `/auth/poll?link=...&retain=1` to collect, confirms local persistence with `x-ofm-user` via `POST /auth/ack?link=...`. Gateway retains token max 15 min before confirmation; lost response = re-collectable; old plugin still idempotent-collects; new plugin also compatible with no-ACK gateway. Pending tokens encrypted at rest in users.json same as upstream; same storage + key = restart still collectable; old single-collect non-persistent gateway can't guarantee re-collect. Avoid upgrading during active auth sessions; keep single-instance config below.

## ⚠️ Single Instance Only (cluster / instances>1 breaks immediately)

Gateway is a **single-process stateful** service: issued user token index, per-IP/per-account rate limits & concurrency counters, dashboard stats — all live in process memory; user store and pending login links land in `users.json` (0600, pending tokens also encrypted on disk — restart no longer swallows a completed login waiting to be collected).
If launched via **PM2 cluster mode or multi-instance** (`instances: 2`), connections round-robin to multiple processes each with independent memory, symptoms:

- `/eac/auth/status` `authorized` flips between true/false — user clearly logged in;
- New login tokens work intermittently; rate limits & concurrency limits effectively doubled; dashboard numbers don't match.

**Correct setup** (`pm2_configs/eac-gateway.config.js` defaults are correct):
`exec_mode: "fork"`, `instances: "1"`, and **`watch: false`** — gateway writes `stats.json` to its own dir every 30s; watch enabled = it restarts itself continuously.

Single process is enough: an SSE stream is just a few idle sockets; thousands of concurrent connections fit in one event loop.
To scale, tune `POOL_SIZE` / `RATE_LIMIT_*` / `CONCURRENCY_PER_IP` — don't add instances;
If true multi-process is ever needed, must first move user store & rate limit state to shared storage, not just change PM2 config.

> 2026-10-06 real incidents (two times, same root cause):
>
> 1. Project once launched cluster×2 + watch:true; user login succeeded but status bounced between "authorized/unauthorized" (two processes' user stores independent, token only issued to one). Fixed by switching to fork×1.
> 2. Same config resurrected on another guardian process: this server had **root AND www each running a PM2 daemon** (both with systemd auto-start units); BT panel managed one by run user (www), root shell's `pm2` commanded the other — both running the app fought for port 17788, loser entered EADDRINUSE restart loop; watch:true + periodic `stats.json` writes = constant restart storm. Restart spikes nginx `connection refused` / `prematurely closed`, Cloudflare returns 520; hit login polling = "authorized but app never synced". **Fix: confirm which daemon holds the app, clear the other and `pm2 save`; panel project settings (watch/cluster) are regenerated by panel on restart, only changing `pm2_configs` file persists.**

## Deployment

Three methods, pick one (Cloudflare vs self-hosted, core verification logic is same `worker.js`).

**Reuse relay's existing domain? Yes.** Two ways:

- **Subdomain (zero code change)**: DNS add `eac.yourdomain` → same server, deploy gateway per below, client seals `https://eac.yourdomain/v1`.
- **Same-domain subpath (one less DNS)**: Gateway `.env` (or Worker vars) set `MOUNT_PREFIX=/eac`; in **relay's existing site** nginx config add a pass-through reverse proxy (**don't** strip prefix). **Read timeout MUST be explicitly increased** — nginx default `proxy_read_timeout 60s`; reasoning models first byte often >60s; missing it = 504 wall:
  ```nginx
  location /eac/ {
      proxy_pass http://127.0.0.1:17788;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_buffering off;
      proxy_cache off;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_connect_timeout 60s;
      proxy_send_timeout 600s;
      proxy_read_timeout 600s;
  }
  ```
  Client seals `https://yourdomain/eac/v1` (signature covers full path including prefix; gateway receives as-is, strips prefix for routing). If gateway & relay same machine, `UPSTREAM_URL` can be relay's loopback (`http://127.0.0.1:<relay-port>`, gateway allows loopback http).

### Method Zero: Self-hosted Node Gateway via BT Panel

Prerequisites: Server has BT Panel (Linux), a domain resolving to this server (e.g., DNS A record `eac.yourdomain` → server IP).

1. **Install Node**: BT → Software Store → search "Node.js Version Manager" → install, then install Node 20 or 22 (LTS) inside it.
2. **Upload files**: BT → Files → create dir `/www/eac-gateway/`, upload **three files** from this dir: `worker.js`, `gateway-node.mjs`, `auth-github.mjs` (must be same directory).
3. **Write config**: Create `.env` in `/www/eac-gateway/` with content (three real values from `D:\our free model\eac-channel.private.json`: `base`→UPSTREAM_URL, `apiKey`→UPSTREAM_API_KEY, `signingSecret`→SIGNING_SECRETS):
   ```ini
   UPSTREAM_URL=https://<relay-address>/v1 (MUST end with /v1 — gateway appends /models and /chat/completions to it)
   UPSTREAM_API_KEY=paste private JSON apiKey (never put real keys in any repo file)
   SIGNING_SECRETS=paste signingSecret (~43 chars)
   MODELS=deepseek-ai/deepseek-v4.1-flash,moonshotai/kimi-k2.6,moonshotai/kimi-k3,openai/gpt-oss-20b,z-ai/glm-5.3,z-ai/glm-5.3-flash
   HOST=127.0.0.1
   PORT=17788
   RATE_LIMIT_PER_MINUTE=60
   # GitHub auth gate (see above; omit = gate disabled, old behavior unchanged)
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   REQUIRE_STAR_REPO=Ebony-Vinyl/dsh-our-free-model
   REQUIRE_USER_TOKEN=0
   STAR_RECHECK_HOURS=12
   PUBLIC_ORIGIN=https://<gateway-domain>
   USER_STORE_KEY=<openssl rand -base64 32>
   ```
   Set `.env` permissions to 600 (right-click → permissions), don't let other users read.
4. **Create Node project**: BT → Sites → Node Project → Add Node Project:
   - Project dir: `/www/eac-gateway`
   - Start method / run script: `node gateway-node.mjs` (startup file: `gateway-node.mjs`)
   - Port: `17788`
   - Run user arbitrary (www OK), submit and start. Logs should show `eac gateway listening on 127.0.0.1:17788 → …`.
   - Old panel without Node Project: use PM2 Manager to add same dir `gateway-node.mjs`, same effect.
5. **Domain + SSL**: BT → Sites → Add Site (domain from step 0, PHP = static) → Site Settings → Reverse Proxy → Add Reverse Proxy, target `http://127.0.0.1:17788`, send domain `$host`; then SSL → Let's Encrypt → issue cert → enable "Force HTTPS".
6. **Security**: Confirm BT security group/firewall **does NOT** allow 17788 (gateway only listens loopback, external only via Nginx 443).
7. **Self-test**: On your machine (this repo dir) run:
   ```
   node worker\verify-deployment.mjs https://eac.yourdomain/v1 "D:\our free model\eac-channel.private.json"
   ```
   Three lines all OK = deployment successful. Server time must be accurate (signature has ±10 min anti-replay window; BT machines usually NTP-synced; if 401 and local config works, check server time first).
8. **Go live**: After self-test passes, put `https://eac.yourdomain/v1` into private JSON's `workerBase` → re-run `node scripts/eac-vault-mint.mjs "D:\our free model\eac-channel.private.json"` → follow release process → finally rotate old key on relay side.

### Method One: Cloudflare Dashboard Paste (no server needed)

1. Cloudflare Dashboard → Workers & Pages → **Create** → Create Worker, name anything (e.g., `ofm-eac-gateway`), Deploy then **Edit code**, paste entire `worker.js` from this dir, Deploy.
2. Worker → **Settings → Variables and Secrets**, add:
   - Secret `UPSTREAM_URL` = relay address (like `https://<relay-host>/v1`, from private credentials file's `base`)
   - Secret `UPSTREAM_API_KEY` = relay key (`sk-…`, from `D:\our free model\eac-channel.private.json` `apiKey`)
   - Secret `SIGNING_SECRETS` = signing key (from same file's `signingSecret`)
   - Variable `MODELS` = six model IDs comma-separated (see `wrangler.toml`)
3. (Optional) Settings → Bindings → **Rate Limit** binding, name MUST be `RATE_LIMITER` (e.g., 30 req/60s).

### Method Two: wrangler

```bash
npm i -g wrangler && wrangler login
cd worker
npx wrangler secret put UPSTREAM_URL
npx wrangler secret put UPSTREAM_API_KEY
npx wrangler secret put SIGNING_SECRETS
npx wrangler deploy        # for rate limiting, uncomment bindings in wrangler.toml first
```

`wrangler tail` shows live logs (one line per request: path/status/duration, no body/key/signature).

## Go Live (remove real key from plugin)

1. After deployment, put Worker URL (`https://<name>.<subdomain>.workers.dev/v1`, **MUST end with `/v1`**) into `D:\our free model\eac-channel.private.json` `workerBase`.
2. Re-mint seal: `node scripts/eac-vault-mint.mjs "D:\our free model\eac-channel.private.json"` (now seal only contains Worker URL + signing secret).
3. Publish per runbook (version, announcement, re-sign manifest, dual commit). After publish complete, **rotate old key on relay side** — old plugin naturally expires, Worker uses new key unaffected.

## Rotation Playbook

- **Signing secret leaked** (symptom: valid signatures from unknown sources): change `SIGNING_SECRETS` to `"newsecret"` (or `"newsecret,oldsecret"` for compat) → deploy → release new plugin; confirm old traffic zero → remove old secret → deploy. Entire process seconds; relay key untouched.
- **Relay key leaked**: rotate on relay side → update Worker `UPSTREAM_API_KEY` → deploy. Client zero changes.
- **Both leaked**: do both above, order doesn't matter.

## Local Verification

Offline suite drives this repo's `worker.js` directly (same code, no logic drift): `node scripts/test-all.mjs --only vault`, covers sig verification pass/expired timestamp/bad signature/unknown path/model outside allowlist/oversized body/streaming forwarding full chain.

Auth gate has separate offline verification: `node scripts/test-all.mjs --only eac-auth` (or `node scripts/eac-auth-test.mjs`) — GitHub fully stubbed, relay is local loopback server; covers start redirect shape, state tamper/expiry, star pass/not starred recheck, token idempotent collect + restart still collectable, new protocol save + match confirm, unknown link answered as expired, users.json no plaintext, no token/unknown token/revoked token refused, listing not blocked, star removal revokes, GitHub unreachable no false revoke, logout, compatibility pass-through + per-account rate limits.