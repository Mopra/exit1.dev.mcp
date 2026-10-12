import type { Exit1ApiClient } from "./api-client.js";
import { credentialsPath, signup } from "./credentials.js";

/**
 * Agent signup for the stdio server.
 *
 * `create_account` is listed only while the server has no API key and no saved
 * credentials, so an agent that installs this package for a user who has never
 * heard of exit1 sees, in the tool list itself, how to get started. It is not
 * part of the shared catalog in tools.ts: the hosted server is always signed in,
 * so it has no use for it.
 */

export const CREATE_ACCOUNT_TOOL = {
  name: "create_account",
  title: "Create an exit1 account",
  description:
    "Create a free exit1 account for the user and connect this server to it, so the other tools work right " +
    "away. Use the user's own email address: exit1 emails it a link to claim the account, and alerts are only " +
    "delivered once they claim it. Monitors you create before then start running immediately. Fails if the " +
    "email already has an account; then ask the user for an API key instead.",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string", description: "The user's email address. Ask them if you don't know it." },
      agent_name: {
        type: "string",
        description: "How you identify yourself to the user in the claim email, e.g. \"Claude Code\".",
      },
    },
    required: ["email"],
    additionalProperties: false,
  },
  annotations: {
    title: "Create an exit1 account",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleCreateAccount(
  args: Record<string, unknown>,
  client: Exit1ApiClient
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  if (client.hasAuth()) {
    return { content: [{ type: "text", text: "This server is already connected to an exit1 account." }] };
  }
  const email = typeof args.email === "string" ? args.email.trim() : "";
  if (!email) {
    return { content: [{ type: "text", text: "email is required: ask the user for their email address." }], isError: true };
  }
  const agentName = typeof args.agent_name === "string" && args.agent_name.trim() ? args.agent_name : "An AI agent";

  try {
    const result = await signup(email, agentName);
    client.setCredentials(result.credentials);
    const text = [
      `Created an exit1 account for ${email} and connected this server to it. All exit1 tools work now.`,
      result.claimEmailSent
        ? `Tell the user: exit1 sent a claim email to ${email}. Alerts are delivered once they open it and claim the account.`
        : `The claim email could not be sent. The user can sign in at https://app.exit1.dev with ${email} to claim the account.`,
      result.nextSteps,
    ]
      .filter(Boolean)
      .join("\n\n");
    return { content: [{ type: "text", text }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Could not create the account: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    flags[key] = inline ?? argv[++i] ?? "";
  }
  return flags;
}

/** `exit1-mcp signup --email you@example.com [--agent-name "..."]`. Returns an exit code. */
export async function runSignupCli(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  const email = flags.email?.trim();
  if (!email) {
    console.error('Usage: npx exit1-mcp signup --email you@example.com [--agent-name "Claude Code"]');
    return 2;
  }
  try {
    const result = await signup(email, flags["agent-name"] || "exit1-mcp CLI");
    console.log(`Created an exit1 account for ${email}.`);
    console.log(`Credentials saved to ${credentialsPath()}; the MCP server uses them automatically.`);
    console.log(
      result.claimEmailSent
        ? `Open the email sent to ${email} to claim the account. Alerts start once you do.`
        : `The claim email could not be sent. Sign in at https://app.exit1.dev with ${email} to claim the account.`
    );
    console.log("\nAdd the server to your AI tool, for example:\n  claude mcp add exit1 -- npx -y exit1-mcp");
    return 0;
  } catch (error) {
    console.error(`Signup failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
