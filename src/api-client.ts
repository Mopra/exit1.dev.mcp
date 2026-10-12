import { randomUUID } from "node:crypto";
import { refreshCredentials, type StoredCredentials } from "./credentials.js";

const DEFAULT_BASE_URL =
  "https://us-central1-exit1-dev.cloudfunctions.net/publicApi/v1/public";

export interface ApiClientOptions {
  /** An API key (X-Api-Key). Takes precedence over saved credentials. */
  apiKey?: string;
  /** OAuth tokens from agent signup, used when there is no API key. */
  credentials?: StoredCredentials | null;
  baseUrl?: string;
}

// Refresh this long before the access token actually expires.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface ApiError {
  status: number;
  message: string;
  retryAfter?: number;
}

export class ToolError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Minimal REST client for the Exit1 public API.
 *
 * Every tool in this package is a thin wrapper over an HTTP endpoint rather than
 * bespoke logic — tier caps, scope checks, validation and rate limits all live
 * server-side, so the tool surface can't drift from the API's rules.
 */
export class Exit1ApiClient {
  private apiKey: string | null;
  private credentials: StoredCredentials | null;
  private baseUrl: string;

  constructor(options: ApiClientOptions) {
    this.apiKey = options.apiKey || null;
    this.credentials = options.credentials ?? null;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** True once there is something to authenticate with. */
  hasAuth(): boolean {
    return !!this.apiKey || !!this.credentials;
  }

  /** Adopt tokens from a signup that happened mid-session. */
  setCredentials(credentials: StoredCredentials): void {
    this.credentials = credentials;
  }

  private async authHeaders(forceRefresh = false): Promise<Record<string, string>> {
    if (this.apiKey) return { "X-Api-Key": this.apiKey };
    if (!this.credentials) {
      throw new ToolError(
        "No exit1 account is connected yet. Call the create_account tool with the user's email to create one, " +
          "or set EXIT1_API_KEY to an existing API key (https://app.exit1.dev/api-keys).",
        401
      );
    }
    if (forceRefresh || this.credentials.expires_at - Date.now() < REFRESH_MARGIN_MS) {
      this.credentials = await refreshCredentials(this.credentials);
    }
    return { Authorization: `Bearer ${this.credentials.access_token}` };
  }

  async call(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {}
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      ...(await this.authHeaders()),
      Accept: "application/json",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    // The API requires an idempotency key on POST. A fresh key per call is
    // correct: a retried tool call is a new intent, and same-URL duplicates are
    // rejected server-side anyway.
    if (method === "POST") {
      headers["Idempotency-Key"] = randomUUID().replace(/-/g, "");
    }

    const send = () =>
      fetch(url.toString(), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

    let response = await send();
    // A saved access token can be revoked or expire early; one refresh, then retry.
    if (response.status === 401 && !this.apiKey && this.credentials) {
      Object.assign(headers, await this.authHeaders(true));
      response = await send();
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const message =
        parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
          ? String((parsed as Record<string, unknown>).error)
          : response.statusText || `HTTP ${response.status}`;
      const retryAfter = response.headers.get("Retry-After");
      throw new ToolError(
        retryAfter ? `${message} (retry after ${retryAfter}s)` : message,
        response.status
      );
    }

    return parsed;
  }

  /** Unwrap the `{ data: ... }` envelope the public API uses. */
  async data(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {}
  ): Promise<unknown> {
    const body = (await this.call(method, path, options)) as { data?: unknown } | null;
    return body && typeof body === "object" && "data" in body ? body.data : body;
  }
}
