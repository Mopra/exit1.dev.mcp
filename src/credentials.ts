import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Credentials saved by agent signup (`create_account` tool or `exit1-mcp signup`).
 *
 * An API key in EXIT1_API_KEY always wins. Without one, the server falls back to
 * the OAuth tokens agent signup returned, stored here so the next session (and
 * the next `npx` run) picks them up without the user configuring anything.
 */

export const APP_ORIGIN = process.env.EXIT1_APP_URL?.replace(/\/+$/, "") || "https://app.exit1.dev";

export interface StoredCredentials {
  email: string;
  access_token: string;
  refresh_token: string;
  /** Epoch ms. */
  expires_at: number;
  api_base: string;
}

export function credentialsPath(): string {
  return process.env.EXIT1_CREDENTIALS_PATH || join(homedir(), ".exit1", "credentials.json");
}

export function loadCredentials(): StoredCredentials | null {
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath(), "utf8")) as Partial<StoredCredentials>;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return parsed as StoredCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
  try {
    // writeFileSync's mode only applies when it creates the file.
    chmodSync(path, 0o600);
  } catch {
    /* Windows: ACLs, not modes */
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Exchange a refresh token for a fresh pair (the server rotates refresh tokens). */
export async function refreshCredentials(creds: StoredCredentials): Promise<StoredCredentials> {
  const response = await fetch(`${APP_ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refresh_token }).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & { error_description?: string };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(
      `Could not refresh the exit1 session: ${body.error_description || response.statusText}. ` +
        "If the account was claimed without keeping agent access, or was paused, ask the user for an API key " +
        "(https://app.exit1.dev/api-keys) and set EXIT1_API_KEY."
    );
  }
  const next: StoredCredentials = {
    ...creds,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (body.expires_in ?? 0) * 1000,
  };
  saveCredentials(next);
  return next;
}

export interface SignupResult {
  credentials: StoredCredentials;
  claimEmailSent: boolean;
  nextSteps: string;
}

/** Create an exit1 account for `email` through agent signup and save the tokens. */
export async function signup(email: string, agentName: string): Promise<SignupResult> {
  const response = await fetch(`${APP_ORIGIN}/oauth/agent-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, agent_name: agentName }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    api_base?: string;
    account?: { claim_email_sent?: boolean };
    next_steps?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(body.error_description || body.error || `Signup failed (HTTP ${response.status})`);
  }
  const credentials: StoredCredentials = {
    email,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (body.expires_in ?? 0) * 1000,
    api_base: body.api_base || "",
  };
  saveCredentials(credentials);
  return {
    credentials,
    claimEmailSent: body.account?.claim_email_sent === true,
    nextSteps: body.next_steps || "",
  };
}
