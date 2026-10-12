#!/usr/bin/env node
/**
 * Setup-mode smoke test: the server started with no API key and no saved
 * credentials must still come up, offer create_account, and turn other tool
 * calls into an error that tells the agent how to get an account.
 *
 * No network: create_account is never called, and the other tools fail before
 * any request is made.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/index.js");

const env = { ...process.env };
delete env.EXIT1_API_KEY;
// A path that can't exist, so a developer's real saved login isn't picked up.
env.EXIT1_CREDENTIALS_PATH = join(tmpdir(), `exit1-smoke-${process.pid}-${Date.now()}`, "none.json");

const child = spawn(process.execPath, [ENTRY], { env, stdio: ["pipe", "pipe", "pipe"] });
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));

const pending = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  }
});

let nextId = 1;
function request(method, params = {}) {
  const id = nextId++;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`Timed out waiting for ${method}`)), 10_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) rej(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
      else res(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

const failures = [];
function expect(condition, message) {
  if (condition) console.log(`  ok    ${message}`);
  else {
    console.error(`  FAIL  ${message}`);
    failures.push(message);
  }
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "exit1-smoke-test", version: "0.0.0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  expect(init.serverInfo?.name === "exit1", "starts without an API key");
  expect(/create_account/.test(init.instructions ?? ""), "instructions point the agent at create_account");

  const { tools } = await request("tools/list");
  const create = tools.find((t) => t.name === "create_account");
  expect(!!create, "lists create_account");
  expect(create?.inputSchema?.required?.includes("email"), "create_account requires email");
  expect(tools.length === 15, `lists create_account plus the 14 shared tools (got ${tools.length})`);

  const blocked = await request("tools/call", { name: "get_account", arguments: {} });
  expect(blocked.isError === true, "a normal tool errors while no account is connected");
  expect(/create_account/.test(blocked.content?.[0]?.text ?? ""), "that error tells the agent to call create_account");
} catch (error) {
  console.error(`\nsetup-mode smoke test threw: ${error.message}`);
  failures.push(error.message);
} finally {
  child.kill();
}

if (failures.length) {
  if (stderr.trim()) console.error(`\nserver stderr:\n${stderr.trim()}`);
  console.error(`\n${failures.length} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll setup-mode assertions passed.");
