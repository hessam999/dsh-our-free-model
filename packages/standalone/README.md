# Our Free Model Standalone Local Service

This is the source entry point for the standalone product. It does not require DSH, Cordis, a DSH profile, or a host credential store.
A standalone HTTP service, web management, EAC, and ten account channels are already provided; standalone installation artifacts have not yet been released.
At this stage it runs from the complete repository and cannot yet be installed by copying only this directory or as a standalone npm package.

## Startup

Requires Node.js that meets the repository's `engines` requirements. Run from the repository root:

```powershell
npm run start:standalone
```

You can also specify the port and data directory:

```powershell
npm run start:standalone -- --port 18900 --data-dir F:\ofm-data
```

Startup prints a one-time login link for the management page, the actual API address, and the key file location; it does not print the API Key.
Open the management link in a browser to use the console. The link is valid for 10 minutes and can be redeemed only once.
The default port is `18900`;
when the port is occupied, the shared listener's automatic port-selection logic applies. Subsequent startups prefer the port last saved by this product;
`--port` overrides it, and `0` means the system assigns the port.

## Data and Authentication

- Default directory: `~/.our-free-model`; the environment variable `OFM_HOME` or `--data-dir` can override it.
- Does not read `DSH_HOME` and does not import DSH configuration or credentials.
- Account credentials are stored in `channel-credentials.json`; the account pool, credits, and ledger are in `channel-pack/`;
  EAC authorization is stored in `eac-user.json`; all belong to the current standalone data directory.
- The first startup does not automatically migrate plugin accounts. To migrate, export an account backup in the plugin, then manually import it in the standalone web page under
  "Free Account Channels → Providers and Backups." Backups contain plaintext credentials; keep them safe.
- The API Key is generated separately for this product and stored in the `forwardKey` field of `settings.json` in that directory.
- `GET /health` provides product status without credentials; inference endpoints and the model list require `Authorization: Bearer <API Key>`.
- Only one local service instance can run per data directory. A normal exit clears `service.lock`.
- If the lock still exists after an abnormal exit, first check the PID recorded in the lock file, confirm the old process has stopped, then remove the lock file.
- The management page and management API listen only on the loopback address; LAN inference requires explicitly enabling the standalone relay.

The plugin still uses `DSH_HOME/our-free-model` or `~/.dsh/our-free-model`; the two are independent by default.
Do not point the standalone service's `OFM_HOME` at the plugin's data directory.

## LAN Inference

Disabled by default on first startup. It can be set in the local management API, or explicitly enabled and saved via the CLI:

```powershell
npm run start:standalone -- --lan --lan-port 18901
npm run start:standalone -- --no-lan
```

Using `--lan-port` alone only saves the port; it does not enable the relay. When the switch is omitted, the saved setting is used.
The relay listens on `0.0.0.0` and forwards only the model list and the Chat Completions, Responses, Messages,
and Messages count_tokens inference paths (supporting both `/v1`-prefixed and unprefixed forms).
Streaming responses and cancellation use the local inference implementation. `/`, `/health`, page resources, and all management paths are not forwarded;
OPTIONS only returns CORS preflight and does not return management data.

LAN clients use a LAN Key generated separately by the local management API; they cannot use or request the local `forwardKey`.
The LAN Key is stored in the `standaloneLanKey` field of `settings.json` in the current standalone directory;
it is retained when the relay is disabled, on normal exit, and across restarts. Rotating the LAN Key immediately invalidates the old LAN Key;
the local API Key and management sessions remain usable. After rotating the local API Key, the relay automatically uses the new local key.
Give the LAN Key only to trusted clients, and restrict access sources via firewall when needed.

The local management API uses an existing session or the local Bearer Key. The contract is as follows:

| Endpoint | Request or response |
| --- | --- |
| `POST /api/management/settings` | Accepts `standaloneLanEnabled` (boolean) and `standaloneLanPort` (integer 0 to 65535); returns `settings` and `lan` |
| `GET /api/management/summary` | `settings` includes the above settings; `lan` includes running status but not the key |
| `GET /api/management/lan/key` | `{key}`; empty string if not yet generated |
| `POST /api/management/lan/key/rotate` | Request must be exactly `{confirm:true}`; returns the new `{key}` |

The `lan` field is `{enabled,running,host,requestedPort,port,addresses,baseUrls,error}`.
`enabled` indicates the saved LAN intent; when the service master switch is off it can be true while `running` is false.
`requestedPort` is the desired port; 0 means automatically assigned on each startup; the actual port appears only in `port`
and is not written back to overwrite the desired port; it is null when stopped. If a fixed port is occupied, the setting is retained,
`running:false`, and `error` gives the failure code; after freeing the port, re-applying the settings retries.
Turning off the service master switch or the LAN switch immediately stops the relay and releases the port; a normal exit also releases the port.
`baseUrls` are the detected local NIC IPv4 addresses and the actual port; re-read the summary after changing networks to update them.
Unknown fields, custom listen hosts, target addresses, and client-submitted keys are not accepted.

This only addresses LAN inference access for issue #351. The Docker / FPK / NAS
remote management deployment from issue #216 is still not implemented: the management listener and Host trust fence remain loopback-only,
and `--host`, `OFM_ALLOW_NON_LOOPBACK`, or `OFM_TRUSTED_HOSTS` are not supported for loosening management access.
Container-mapped relay ports can be used by configured inference clients to connect, but the management page cannot be opened from the LAN on that basis,
and no container image, FPK package, or in-container account OAuth login adaptation is provided.

## Current Endpoints and Channels

- `GET /v1/models`
- `POST /v1/chat/completions`, including streaming and non-streaming requests
- `POST /v1/responses`, including streaming and non-streaming requests
- Anonymous free models and Kilo free models
- EAC original GitHub authorization, signed requests, and resource pool; the standalone app uses its own authorization file
- LobsterAI,
  Qoder, Qoder China Edition, TRAE, Cline, Loomy, Raccoon, MiniMax Code, ZCode, Gemini
- Original channel login, account pool and rotation, renewal, model toggles, daily check-in, credit locking, ledger, and backup
- Local model cache, usage statistics, periodic refresh, request cancellation, and exit cleanup
- `GET /`: standalone Chinese web console
- `/api/management/*`: same-origin management API, authenticated with a management session or API Key

Startup binds the listener first, then asynchronously refreshes the model list. The first run does not send availability probe requests by default;
`--probe` enables and saves the automatic probe setting, which is used on subsequent startups and can be turned off in the web settings.
When upstream is unreachable, the cache is retained; `--no-refresh` skips the core startup refresh and periodic tasks,
while manual refresh, probing, and inference remain available. Account channel initialization directories, login polling, renewal, and automatic check-in follow the channels' own rules;
`--no-refresh` does not disable these tasks, and automatic check-in can be turned off on the channel page.
Automatic probing respects core backoff when rate-limited; active probing from the page forces a re-check and generates inference requests.

Standalone account channels use per-instance Worker isolation and provide
`provider/model` model IDs through the same service port and API Key. Startup mounts HTTP first, and the account list loads in the background without waiting for all provider network responses.
EAC is authorized separately on the standalone page; DSH's EAC token is not used. The original plugin's host detection remains unchanged.
Plugin hot reload, self-update, and host Agent automatic continuation are not mounted on the standalone entry point.

## Web Management

The standalone side has updated the overview, channel management, model list, usage statistics, service settings, and public navigation;
API access and login retain the existing control logic. All resources are served by the local service;
channels, models, usage statistics, and service settings load on demand and do not depend on a CDN.
The management navigation adds a "Plugin Center": channels, enhancements, and page plugins share one set of signed manifests, permissions, and sandboxing,
and the sidebar dynamically shows pages contributed by plugins (`sandbox="allow-scripts"` iframe + controlled message bridge);
the built-in account channel pack, aggregated channel directory, client launcher, resource library format, and model workbench
are also registered as built-in plugins in the same center and cannot be uninstalled. Developer mode can install local unsigned packages,
which require explicit confirmation and carry an "Unverified" badge. See [`Plugin Platform`](../../docs/plugin-platform.md)
and [`Page Plugin API`](../../docs/plugin-page-api.md). For visual and size records, see
[`Phase 1 Acceptance`](../../docs/verification/2026-10-09-standalone-ui-phase1.md),
[`Model List Acceptance`](../../docs/verification/2026-10-09-standalone-model-browser.md),
[`Usage Statistics Acceptance`](../../docs/verification/2026-10-09-standalone-usage-dashboard.md), and
[`Service Settings Acceptance`](../../docs/verification/2026-10-09-standalone-settings-page.md).

After modifying the frontend, run from the repository root:

```powershell
npm ci --prefix packages/standalone --ignore-scripts
npm run typecheck:standalone
npm run build:standalone-ui
node scripts/build-standalone-ui.mjs --check
```

`frontend/` is the source, and `web/` is the committed build output. The service loads these resources at startup;
after rebuilding, the service must be restarted. Development tools are used only for building and are not exposed as web resources.

The model page uses TanStack Virtual to mount entries by visible area, supporting dynamic row heights and long ID wrapping.
After focusing the scroll area, Home/End reach the first/last item; when the copy or test button has focus, the containing entry is retained.
Search and filtering only change the current view, are retained after refresh and page changes, and are cleared after exiting management.
Single-model tests can be canceled; switching pages or exiting interrupts the test request. Refresh and probing are server-side shared tasks;
leaving the page cancels the frontend wait but does not promise to stop the entire server-side refresh task.

- **Overview**: inference status, access address, model count, Token usage over the last 7 days, and local service information.
- **Model List**: name/ID search, combined filtering by channel/capability/status/public scope, copy model ID,
  refresh list, active probing, and cancelable single-model tests with result display.
- **Usage Statistics**: cumulative user turns, physical requests, input/output Tokens, failed and recovered turns,
  trends over the last 7/14/30 local calendar days (default 14 days), plus per-model search, sorting, and 20 entries per page.
  Historical estimates are clearly explained; unknown performance shows "—"; reading and refreshing statistics does not send inference requests.
- **Free Account Channels**: ten channel cards, login and account management; channel usage, request logs,
  provider start/stop, permanent credit locking, nicknames, account priority, rate-limit reset, and backup import/export.
- **EAC Co-payment Channel**: GitHub authorization, status, cancel, exit, and resource pool. The authorization page is opened and completed by the user.
- **Service Settings**: pause or resume inference, regional models, stream interruption recovery, output limit, refresh interval, and automatic probing.
- **API Access**: copy address, actively view or hide the key, copy a call example, and rotate the key after confirmation.

The temporary credential for the login link is in the URL fragment and is removed after the page redeems it. The browser uses an 8-hour
HttpOnly, SameSite=Strict management cookie; restarting the service or exiting management clears the session.
If the link has been used or has expired, you can log in with the `forwardKey` in `settings.json`.
The login page provides a local token retrieval entry: Windows opens PowerShell, macOS opens the system Terminal,
reads the key from the actual data directory of the current service and copies it to the clipboard, then paste it back on the page to log in.
This operation accepts only same-origin requests from the local page, performs only fixed actions, does not accept commands or paths provided by the web page,
and does not return the key to an unauthenticated web page. It cannot be opened again within 30 seconds after each successful open.
If opening fails, expand "Manual Retrieval and Other Systems" to copy the token retrieval command for the current system's default directory,
or read `forwardKey` directly from the configuration file; for a custom directory, use the startup parameter.
On macOS, the first open may require allowing the local service to control Terminal. On Linux, use the manual instructions
or the one-time login link printed at service startup; Windows and macOS also retain these fallback entries.
Rotating the key immediately invalidates the old key and other management sessions; the current management session is retained, and clients must update their configuration.
Inference endpoints still require the Bearer API Key; the management cookie cannot be used for inference. After pausing inference, the management page remains accessible.

The page updates status every 15 seconds; reading status does not send inference requests. Active probing and model tests consume upstream quota;
model tests are limited to 64 output Tokens with a 60-second timeout, and real usage is counted in statistics.
Statistics save usage and performance, not prompts and answers; inference content is still sent to the model upstream,
and prompts in the Kilo free pool may be recorded by upstream, so do not send sensitive content.

Service settings have unsaved-change indicators, numeric range validation, and undo. Background polling and page changes do not overwrite editing drafts,
drafts are cleared after exiting management; undo restores the most recently synced saved values. Repeated submission is prohibited during saving,
input is retained on failure, and the server-returned value prevails on success. The automatic probe switch still controls the original periodic task;
when started with `--no-refresh`, saving settings does not restore automatic tasks.

## Gemini and Cline Network Connections

Login, renewal, and model requests for these two channels read `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`; when there is no environment proxy, Windows automatically reads the current user's manual system proxy. Environment proxies respect `NO_PROXY`, system proxies respect `ProxyOverride`, and loopback requests do not automatically use a proxy. No need to set `NODE_USE_ENV_PROXY`.

Windows manual proxy configuration is cached for at most 30 seconds; PAC automatic configuration scripts are not supported. The standalone service does not yet provide the plugin's subscription egress feature; use an environment proxy or manual system proxy. Gemini needs access to Google's authorization, token, identity, and Code Assist endpoints; successful browser authorization does not mean the background connection succeeds, and network errors display the connection path and underlying error code.

## Verification

```powershell
npm run test:standalone
npm run test:management
npm run test:standalone-channels
node scripts/channel-network-test.mjs
node scripts/standalone-lan-test.mjs
npm run test:contributor
```

Standalone service-specific tests use only local HTTP stubs and do not access real upstreams. Tests cover standalone data and keys,
the two API protocols, streaming responses, caching, concurrent refresh, exit cleanup, and process-level DSH dependency isolation.
Management-specific tests cover sessions, same-origin protection, settings validation and persistence, resume after pause, model operations,
key rotation, restart and automatic refresh scheduling; browser acceptance uses a standalone data directory and local upstream stubs.
Channel-specific tests run real adapters and original authorization logic, with network redirected to local stubs, covering multi-instance isolation,
tools and images, Chat/Responses, credit locking, backup, usage, cancellation, and exit. External real account login has not been accepted channel by channel.

Acceptance processes loaded with local stubs are marked `networkMode: fixture` in the management summary, and the web page shows a prominent test notice.
Stub processes cannot be used for real account login; for actual use, start the standalone service with the commands above,
and use a formal standalone data directory to avoid mistaking test accounts and simulated credits for real data.

## Regenerating Channel Artifacts

Running the service does not require installing React or esbuild; the repository contains the generated local scripts and styles. After modifying the generator or shared pages, run:

```powershell
npm ci --prefix packages/standalone --ignore-scripts
npm run build:standalone-channels
npm run build:standalone-ui
node scripts/build-standalone-channels.mjs --check
node scripts/build-standalone-ui.mjs --check
```

The generator only replaces the platform host and page connection method; it does not modify the original plugin's `client.js` or channel packs.
The original channels' WASM and shared core still come from the complete repository; copying this directory alone cannot run.