# exit1-mcp

MCP server for [Exit1](https://exit1.dev) uptime monitoring. Let your AI assistant set up monitoring for the project you just shipped — read your repo, create the checks, configure alerts, and send a real test alert to prove it works — then ask it about uptime in plain language afterwards.

## Two ways to connect

**Hosted (recommended).** No API key, no npm install, no plan requirement to get started. Run this in your terminal before starting a session: the login opens your browser, you sign in (or sign up) with Clerk, approve, and you're connected.

```bash
claude mcp add --transport http exit1 https://app.exit1.dev/mcp/v1 && claude mcp login exit1
```

One line on purpose: pasting the two commands as separate lines is unreliable in some terminals (cmd.exe drops the second line). In old Windows PowerShell (5.1), where `&&` doesn't parse, run the two halves one at a time. Connect before you start the session: MCP clients load servers at startup, so a server added mid-conversation isn't usable until a restart. On Claude Code versions without `claude mcp login`, start `claude` and authenticate via `/mcp` instead.

**Local stdio.** This npm package. Uses a Public API key from your dashboard. Use it when your client doesn't support remote MCP servers with OAuth.

```bash
claude mcp add exit1 -- npx -y exit1-mcp
export EXIT1_API_KEY="ek_live_your_key_here"
```

Both expose the same tools. The hosted server is easier; the stdio one has no browser step, which some CI-ish setups prefer.

## No account yet? Let the agent create one

Started without `EXIT1_API_KEY`, the stdio server doesn't exit. It starts in setup mode and offers one extra tool, `create_account`. Your agent calls it with your email address, and exit1 creates a free account and connects the server to it on the spot. Every other tool works straight away, and monitors start running.

```bash
claude mcp add exit1 -- npx -y exit1-mcp
# then, in the session: "Set up uptime monitoring for this project with exit1. My email is you@example.com."
```

Or from a terminal, before the session:

```bash
npx exit1-mcp signup --email you@example.com
```

Either way exit1 emails you a link to claim the account. **Alerts are only delivered once you claim it**, so nobody can point exit1's alerts at an address they don't own. On the claim page you decide whether the agent keeps access. Unclaimed accounts are paused after 7 days and deleted after 30.

The tokens are saved to `~/.exit1/credentials.json` and refreshed automatically, so later sessions connect without any setup. `EXIT1_API_KEY`, when set, always wins. Agents that don't use MCP can do the same with one HTTP call: see [Agent signup](https://docs.exit1.dev/integrations/agent-signup).

## Zero to monitored

Connect the server (above), then paste this into Claude Code, Cursor, Codex or any MCP-capable assistant, from inside your project:

```
Set up uptime monitoring for this project with Exit1.

1. Call get_account to see my plan limits. If you have a create_account tool
   instead, I have no account yet: ask for my email and call it. If the Exit1
   tools aren't available to you at all, don't try to connect from inside this
   session; tell me to add the HTTP MCP server https://app.exit1.dev/mcp/v1 in
   my tool, restart it, and paste this prompt again.
2. Read this repo to find what should be monitored: deployed URLs in vercel.json /
   next.config / wrangler.toml / .env.production / README, and any /health or
   /api/status route handlers.
3. Show me the checks you plan to create before creating them.
4. Configure email alerts, then send a test alert so I can confirm delivery works.
```

Once connected, the server also ships a `setup_monitoring` prompt containing the full playbook — in Claude Code, `/exit1:setup_monitoring`.

## Requirements

- **Hosted:** an Exit1 account. Sign-up happens inline during the OAuth flow.
- **Local stdio:** Node.js 18+, and either an API key from your [dashboard](https://app.exit1.dev/api-keys) (every plan can mint one, Free included) or no account at all: see [No account yet?](#no-account-yet-let-the-agent-create-one).

## Supported clients

| Client | Hosted (OAuth) | Local stdio |
|---|---|---|
| Claude Code | ✅ | ✅ |
| Claude Desktop | ✅ | ✅ |
| Cursor | ✅ | ✅ |
| VS Code (Copilot) | ✅ | ✅ |
| Windsurf | ⚠️ check version | ✅ |
| Codex CLI | ⚠️ check version | ✅ |
| Gemini CLI | ⚠️ check version | ✅ |
| Goose | ⚠️ check version | ✅ |
| ChatGPT | via connector | via `mcp-remote` bridge |

Remote MCP with OAuth is still rolling out across clients. Where it isn't supported yet, the stdio path below works everywhere.

## Local stdio setup

### Claude Code

```bash
claude mcp add exit1 -- npx -y exit1-mcp

export EXIT1_API_KEY="ek_live_your_key_here"
claude
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "exit1": {
      "command": "npx",
      "args": ["-y", "exit1-mcp"],
      "env": {
        "EXIT1_API_KEY": "ek_live_your_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally). Same shape as Claude Desktop above.

### VS Code with Copilot

Run **MCP: Add Server** from the Command Palette, choose **Command (stdio)**, enter `npx -y exit1-mcp`. VS Code uses a `servers` key rather than `mcpServers`:

```json
{
  "servers": {
    "exit1": {
      "command": "npx",
      "args": ["-y", "exit1-mcp"],
      "env": {
        "EXIT1_API_KEY": "ek_live_your_key_here"
      }
    }
  }
}
```

### Windsurf / Gemini CLI / Goose

Same `mcpServers` block as Claude Desktop, in `mcp_config.json` (Windsurf settings › MCP), `~/.gemini/settings.json`, or via `goose mcp add exit1 -- npx -y exit1-mcp`. Restart the IDE or CLI afterwards.

### Codex CLI

```bash
codex mcp add exit1 -- npx -y exit1-mcp
export EXIT1_API_KEY="ek_live_your_key_here"
codex
```

### ChatGPT

Bridge the stdio server with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), then add it under **Settings › Connectors**.

## Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `get_account` | `checks:read` | Plan, limits and current usage. Call this first when setting things up. |
| `list_checks` | `checks:read` | List checks with current status. |
| `get_check` | `checks:read` | Detail for one check, including SSL state. |
| `get_check_history` | `checks:read` | Individual results over time. |
| `get_check_stats` | `checks:read` | Uptime % and response times across ranges. |
| `get_status_page` | `checks:read` | Snapshot of a public status page. |
| `create_check` | `checks:write` | Create a monitor (website, API, ping, TCP, DNS, domain, heartbeat). |
| `update_check` | `checks:write` | Change an existing check's settings. |
| `toggle_check` | `checks:write` | Pause or resume a check. |
| `delete_check` | `checks:delete` | Permanently remove a check. |
| `get_alert_settings` | `alerts:read` | See where alerts currently go. |
| `set_email_alerts` | `alerts:write` | Set email recipients and events. |
| `add_webhook_alert` | `alerts:write` | Connect Slack, Discord, Teams or a generic webhook. |
| `send_test_alert` | `alerts:write` | Fire a real test alert. |

The hosted server requests `checks:read`, `checks:write`, `alerts:read` and `alerts:write` by default — not `checks:delete`, which has to be asked for explicitly. For the stdio path, tick the scopes you want when creating the API key.

## Example prompts

- "Set up monitoring for this project."
- "Are any of my monitors down right now?"
- "What's the uptime for my API check over the last 30 days?"
- "Show me the last 10 failures for production."
- "Add a check on staging.example.com and send alerts to #ops in Slack."
- "Compare response times this week vs last week."

## Configuration

| Environment variable | Required | Description |
|---------------------|----------|-------------|
| `EXIT1_API_KEY` | No | Your Exit1 API key (`ek_live_…`). Without it the server uses saved signup credentials, or starts in setup mode |
| `EXIT1_CREDENTIALS_PATH` | No | Where signup credentials are saved (default `~/.exit1/credentials.json`) |
| `EXIT1_API_URL` | No | Override the API base URL (for development) |

## Managing connections

Hosted connections are listed at [app.exit1.dev/mcp](https://app.exit1.dev/mcp) and can be revoked there at any time. Revoking kills every token issued to that client immediately.

## Development

```bash
npm install
npm run build          # tsc -> dist/
npm test               # build, then drive a real MCP handshake over stdio
npm run check:catalog  # compare the tool catalog against the hosted server
```

`npm test` spawns the built server and asserts the surface a client actually sees: the tool
count, `readOnlyHint` / `destructiveHint` annotations, the `setup_monitoring` prompt, and that an
unknown tool returns `isError` rather than a protocol error. A second run starts it with no key
and no saved credentials and checks setup mode (`create_account` listed, other tools explain how
to get an account). It needs no API key and makes no network calls.

### Why `check:catalog` exists

The tool catalog is deliberately duplicated between this package and the hosted OAuth server,
which lives in [Mopra/exit1.dev](https://github.com/Mopra/exit1.dev) at
`functions/src/mcp-tools.ts`. Two separate builds, no shared package, nothing at compile time
tying them together. `npm run check:catalog` fails if they drift on tool names or input schemas,
and warns on wording differences. CI runs it on every push and once a day.

Change a tool here, change it there — and run the check before releasing.

To run it against a local checkout instead of GitHub:

```bash
CATALOG_REMOTE_PATH=../exit1.dev/functions/src/mcp-tools.ts npm run check:catalog
```

### Releasing

```bash
npm version patch          # or minor
npm publish                # prepublishOnly runs the build + smoke test
git push --follow-tags
```

Bump `version` in [server.json](server.json) to match, then re-publish the registry entry (see
below). The `version` string in [src/index.ts](src/index.ts) is what clients see in
`serverInfo` — keep it in step with `package.json`.

### MCP registry

`server.json` describes both distribution paths (the npm package and the hosted endpoint) for the
[official MCP registry](https://registry.modelcontextprotocol.io). The registry name is
`dev.exit1/exit1-mcp`, which requires proving control of `exit1.dev`:

```bash
mcp-publisher login dns --domain=exit1.dev --private-key=HEX_KEY
mcp-publisher publish
```

npm ownership is proven by the `mcpName` field in `package.json`, which must stay equal to `name`
in `server.json`.

## Quick Links

| | | |
|---|---|---|
| **Website** | [exit1.dev](https://exit1.dev) — Learn about the platform | [Repo](https://github.com/Mopra/exit1.dev.website) |
| **Monitor App** | [app.exit1.dev](https://app.exit1.dev) — Sign in and manage your checks | [Repo](https://github.com/Mopra/exit1.dev) |
| **Documentation** | [docs.exit1.dev](https://docs.exit1.dev) — Guides, API reference, and setup instructions | [Repo](https://github.com/Mopra/exit1.dev.docs) |
| **MCP Server** | [`exit1-mcp`](https://www.npmjs.com/package/exit1-mcp) — this repo | [Repo](https://github.com/Mopra/exit1.dev.mcp) |

Also listed on the [official MCP registry](https://registry.modelcontextprotocol.io) as `dev.exit1/exit1-mcp`.

## License

MIT — see [LICENSE](LICENSE).

The rest of exit1 is source-available rather than open source; this package is the exception, so it can be vendored and inspected freely by MCP clients.
