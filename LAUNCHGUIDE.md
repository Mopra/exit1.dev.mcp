# Launch Guide — Exit1 Uptime Monitoring

Metadata for MCP Market and other MCP directories. The submit form at
[mcpmarket.com/submit](https://mcpmarket.com/submit) reads this file to pre-fill a listing.

## Identity

| Field | Value |
|---|---|
| Name | Exit1 Uptime Monitoring |
| Slug | `exit1` |
| Package | [`exit1-mcp`](https://www.npmjs.com/package/exit1-mcp) (npm) |
| Registry name | `dev.exit1/exit1-mcp` |
| Repository | https://github.com/Mopra/exit1.dev.mcp |
| Website | https://exit1.dev |
| Documentation | https://docs.exit1.dev |
| Logo | `assets/logo-400.png` (400×400 PNG) |
| License | MIT |
| Vendor | Exit1.dev — official, first-party |
| Contact | connect@exit1.dev |

## Description

Set up uptime monitoring for a project without leaving your editor. The assistant reads your
repo, works out what should be monitored, creates the checks, wires up email and Slack alerts,
and fires a real test alert to prove delivery works — then answers uptime questions in plain
language afterwards.

**Short version (one line):** Uptime monitoring your agent can configure, not just read —
create checks, set alerts, and query uptime history for websites, APIs, domains and cron jobs.

## Key features

- **Configures monitoring, not just reads it.** 14 tools spanning read *and* write: create and
  update checks, pause them, set email recipients, connect Slack/Discord/Teams webhooks.
- **Two transports, one tool surface.** A hosted OAuth endpoint (`https://app.exit1.dev/mcp/v1`)
  needs no API key and no install — the assistant opens a browser, you approve, done. A local
  stdio package covers clients that don't speak remote MCP yet.
- **Eight check types.** HTTP/HTTPS, REST endpoints with JSONPath body assertions, redirects,
  ICMP ping, raw TCP ports, DNS record drift, domain-registration expiry, and inbound heartbeats
  for cron jobs.
- **Ships a setup playbook as an MCP prompt.** `setup_monitoring` tells the assistant where to
  look for deployed URLs and health endpoints, to assert on response bodies rather than status
  codes, and to always finish by testing the alert channel.
- **Scoped, revocable access.** Per-scope permissions (`checks:read`, `checks:write`,
  `alerts:read`, `alerts:write`, `checks:delete`). The hosted server requests the first four and
  never `checks:delete` unless a client asks for it explicitly; on the stdio path the scopes are
  whichever ones you tick when creating the API key. Hosted connections are listed and revocable
  at https://app.exit1.dev/mcp — revoking kills every token issued to that client immediately.

## Use cases

1. **"Set up uptime monitoring for this project."** The agent reads `vercel.json`,
   `next.config`, `wrangler.toml`, `.env.production` and route handlers, proposes a check list,
   creates it, configures alerts, and sends a test alert.
2. **Incident triage.** "Which monitors are down right now, and what did the last ten failures
   return?" — `list_checks` plus `get_check_history` without opening a dashboard.
3. **Real health checks instead of 200-checking.** `create_check` with a JSONPath assertion on
   `/health` so a 200 with a dead database still fails.
4. **Post-deploy verification in an agent loop.** After a deploy, compare response times this
   week vs last week via `get_check_stats`.
5. **Cron and worker monitoring.** Create `heartbeat` checks so a job that silently stops
   running raises an alert.
6. **SSL and domain expiry.** Certificate state comes back with every HTTPS check;
   `type: "domain"` tracks registration expiry.

## Installation

### Hosted (recommended — no API key, no install)

```bash
claude mcp add --transport http exit1 https://app.exit1.dev/mcp/v1
```

OAuth 2.1 with PKCE. Sign-up happens inline during the flow, so a new user can go from zero to
connected without visiting the dashboard first.

### Local stdio

```bash
claude mcp add exit1 -- npx -y exit1-mcp
export EXIT1_API_KEY="ek_live_your_key_here"
```

Full per-client instructions (Claude Desktop, Cursor, VS Code, Windsurf, Codex, Gemini CLI,
Goose, ChatGPT) are in [README.md](README.md).

## Requirements

| | Hosted | Local stdio |
|---|---|---|
| Exit1 account | Required (sign-up inline) | Required |
| Plan | Any, including Free | Indie or higher (API keys are a paid feature) |
| Plan limits | Apply either way — Free allows 5 checks at 5-minute intervals and no DNS or domain checks. `get_account` reports the caller's effective limits so the assistant plans within them. | |
| API key | Not needed | `EXIT1_API_KEY` from https://app.exit1.dev/api-keys |
| Node.js | Not needed | 18+ |
| Client support | Remote MCP + OAuth | Any MCP client |

## Configuration

| Variable | Required | Secret | Description |
|---|---|---|---|
| `EXIT1_API_KEY` | stdio only | Yes | Exit1 Public API key, `ek_live_…` |
| `EXIT1_API_URL` | No | No | Override the API base URL. Development only. |

## Tools

Seven read-only, seven writing. Every tool carries `readOnlyHint`; `delete_check` also carries
`destructiveHint: true`.

| Tool | Scope | Read-only | Description |
|---|---|:--:|---|
| `get_account` | `checks:read` | ✅ | Plan, limits and current usage |
| `list_checks` | `checks:read` | ✅ | All checks with current status |
| `get_check` | `checks:read` | ✅ | One check in detail, including SSL state |
| `get_check_history` | `checks:read` | ✅ | Individual results over time |
| `get_check_stats` | `checks:read` | ✅ | Uptime % and response times across ranges |
| `get_status_page` | `checks:read` | ✅ | Public status page snapshot |
| `get_alert_settings` | `alerts:read` | ✅ | Where alerts currently go |
| `create_check` | `checks:write` | | Create a monitor (8 types) |
| `update_check` | `checks:write` | | Change an existing check |
| `toggle_check` | `checks:write` | | Pause or resume a check |
| `delete_check` | `checks:delete` | | Permanently remove a check |
| `set_email_alerts` | `alerts:write` | | Set email recipients and events |
| `add_webhook_alert` | `alerts:write` | | Connect Slack, Discord, Teams or generic |
| `send_test_alert` | `alerts:write` | | Fire a real test alert |

## Prompts

| Prompt | Description |
|---|---|
| `setup_monitoring` | End-to-end playbook: inspect the repo, plan the checks, create them, configure alerts, prove delivery |

## Example prompts

- "Set up monitoring for this project."
- "Are any of my monitors down right now?"
- "What's the uptime for my API check over the last 30 days?"
- "Show me the last 10 failures for production."
- "Add a check on staging.example.com and send alerts to #ops in Slack."
- "Compare response times this week vs last week."
- "Monitor my nightly billing cron as a heartbeat and alert me if it misses."

## Tags

`uptime-monitoring`, `observability`, `monitoring`, `alerting`, `devops`, `sre`, `incident-response`,
`website-monitoring`, `api-monitoring`, `ssl-monitoring`, `dns`, `status-page`, `cron-monitoring`,
`oauth`, `remote-mcp`

**Suggested category:** Analytics & Monitoring

## Security notes

For reviewers and scanners:

- **One runtime dependency:** `@modelcontextprotocol/sdk`. Nothing else.
- **No direct database access.** Every tool is a thin wrapper over the documented public REST
  API (`https://us-central1-exit1-dev.cloudfunctions.net/publicApi/v1/public`, the same base URL
  used throughout https://docs.exit1.dev/api-reference), so tier caps, scope checks, rate limits
  and URL validation are enforced server-side and cannot be bypassed through the MCP surface.
- **Two outbound hosts, both first-party.** The stdio server talks only to the API host above;
  the hosted server is reached at `https://app.exit1.dev/mcp/v1`. No third-party endpoints,
  telemetry or analytics.
- **No filesystem or shell access.** The server reads exactly one environment variable and
  makes outbound HTTPS calls to the Exit1 API. It never writes to disk.
- **Credentials are never logged.** The API key is read from the environment and sent as an
  `X-Api-Key` header; it does not appear in tool output or error messages.
- **Least privilege by default.** The hosted server requests `checks:read`, `checks:write`,
  `alerts:read` and `alerts:write`. `checks:delete` must be requested explicitly.
- **Revocation.** Hosted tokens are revocable per client at https://app.exit1.dev/mcp;
  revoking kills every token issued to that client immediately.
- **Tested surface.** `npm test` drives a real MCP handshake over stdio and asserts the tool
  list, annotations and error behaviour. CI runs it on every push.

## Maintenance

Actively maintained by Exit1.dev. The tool catalog is intentionally duplicated between this
package (stdio) and the hosted OAuth server in
[Mopra/exit1.dev](https://github.com/Mopra/exit1.dev) — `functions/src/mcp-tools.ts`. A daily
CI job (`npm run check:catalog`) fails if the two drift on tool names or input schemas, so the
two transports cannot present different contracts.
