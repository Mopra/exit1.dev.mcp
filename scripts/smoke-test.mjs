#!/usr/bin/env node
/**
 * Protocol smoke test. Spawns the built server over stdio and drives a real
 * MCP handshake — initialize, tools/list, prompts/list, prompts/get — then
 * asserts the surface a client actually sees.
 *
 * No network: it never calls a tool, so no API key is needed. A dummy key is
 * enough to get past the startup guard.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
const PROTOCOL_VERSION = "2025-06-18";
const EXPECTED_TOOLS = 14;
const DESTRUCTIVE_TOOLS = ["delete_check"];

const child = spawn(process.execPath, [ENTRY], {
  env: { ...process.env, EXIT1_API_KEY: "ek_live_smoketest_not_a_real_key" },
  stdio: ["pipe", "pipe", "pipe"],
});

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
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
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

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
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
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "exit1-smoke-test", version: "0.0.0" },
  });
  notify("notifications/initialized");

  expect(init.serverInfo?.name === "exit1", `serverInfo.name is "exit1" (got ${init.serverInfo?.name})`);
  expect(!!init.capabilities?.tools, "advertises the tools capability");
  expect(!!init.capabilities?.prompts, "advertises the prompts capability");
  expect(typeof init.instructions === "string" && init.instructions.length > 0, "returns server instructions");

  const { tools } = await request("tools/list");
  expect(tools.length === EXPECTED_TOOLS, `lists ${EXPECTED_TOOLS} tools (got ${tools.length})`);
  expect(
    tools.every((t) => t.name && t.description && t.inputSchema?.type === "object"),
    "every tool has a name, a description and an object inputSchema"
  );
  expect(
    tools.every((t) => typeof t.annotations?.readOnlyHint === "boolean"),
    "every tool carries a readOnlyHint annotation"
  );
  for (const name of DESTRUCTIVE_TOOLS) {
    const tool = tools.find((t) => t.name === name);
    expect(tool?.annotations?.destructiveHint === true, `${name} is marked destructiveHint: true`);
  }
  expect(
    tools.filter((t) => t.annotations?.readOnlyHint === true).length === 7,
    "7 tools are marked read-only"
  );

  const { prompts } = await request("prompts/list");
  expect(prompts.some((p) => p.name === "setup_monitoring"), "exposes the setup_monitoring prompt");

  const prompt = await request("prompts/get", { name: "setup_monitoring" });
  expect(prompt.messages?.[0]?.content?.text?.includes("send_test_alert"), "setup_monitoring prompt returns its playbook");

  const unknown = await request("tools/call", { name: "not_a_real_tool", arguments: {} });
  expect(unknown.isError === true, "an unknown tool returns isError rather than crashing");
} catch (error) {
  console.error(`\nsmoke test threw: ${error.message}`);
  failures.push(error.message);
} finally {
  child.kill();
}

if (stderr.trim()) console.error(`\nserver stderr:\n${stderr.trim()}`);

if (failures.length) {
  console.error(`\n${failures.length} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll protocol assertions passed.");
