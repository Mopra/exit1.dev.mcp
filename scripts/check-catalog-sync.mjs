#!/usr/bin/env node
/**
 * Cross-repo drift check for the MCP tool catalog.
 *
 * This package (stdio, API-key auth) and the hosted OAuth server in
 * Mopra/exit1.dev (`functions/src/mcp-tools.ts`) expose the same tools from two
 * deliberately separate builds. Nothing at compile time ties them together, so
 * this script does.
 *
 * Severity is split on purpose:
 *   - ERROR on the tool set or any inputSchema differing. That is the wire
 *     contract; drift there means a prompt that works against one server errors
 *     against the other.
 *   - WARN on title/description prose differing. Wording is allowed to diverge
 *     (the hosted server can say more about OAuth, this one about API keys), but
 *     large gaps usually mean someone updated one side and forgot the other.
 *
 * Reads the hosted catalog from GitHub by default. Point CATALOG_REMOTE_PATH at
 * a local checkout to run it offline:
 *   CATALOG_REMOTE_PATH=../exit1.dev/functions/src/mcp-tools.ts npm run check:catalog
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = resolve(HERE, "../src/tools.ts");
const REMOTE_URL =
  process.env.CATALOG_REMOTE_URL ||
  "https://raw.githubusercontent.com/Mopra/exit1.dev/master/functions/src/mcp-tools.ts";

/** Slice out the tool-array literal so the `setup_monitoring` prompt below it is not mistaken for a tool. */
function sliceCatalog(source, exportName) {
  const start = source.indexOf(`export const ${exportName}: McpToolDefinition[] = [`);
  if (start === -1) throw new Error(`Could not find "export const ${exportName}" — did the catalog get renamed?`);
  const end = source.indexOf("\n];", start);
  if (end === -1) throw new Error(`Could not find the end of ${exportName}`);
  return source.slice(start, end);
}

/** Grab a balanced `{ ... }` literal starting at the first brace after `from`. */
function braceSlice(source, from) {
  const open = source.indexOf("{", from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** Collapse whitespace and trailing commas so formatting differences are not reported as drift. */
function normalizeSchema(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/,\s*}/g, " }")
    .replace(/,\s*]/g, " ]")
    .trim();
}

/**
 * Structure only: drop the `description` strings nested inside a schema. Those are
 * model-facing prose, not the wire contract — the hosted server is free to word a
 * field hint differently. Everything else (property names, types, enums, required,
 * limits) has to match or the two servers accept different arguments.
 */
function schemaShape(text) {
  return text.replace(/description: "(?:[^"\\]|\\.)*"(,\s*)?/g, "").replace(/\s+/g, " ").replace(/\{ \}/g, "{}").trim();
}

function extractStringField(entry, field) {
  // Handles both `description: "..."` and a prettier-wrapped `description:\n  "..."`.
  const match = entry.match(new RegExp(`${field}:\\s*\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return match ? match[1] : null;
}

function parseCatalog(source, exportName) {
  const body = sliceCatalog(source, exportName);
  const starts = [...body.matchAll(/\n {4}name: "([a-z_]+)",/g)];
  return starts.map((match, i) => {
    const from = match.index;
    const to = i + 1 < starts.length ? starts[i + 1].index : body.length;
    const entry = body.slice(from, to);
    const schemaStart = entry.indexOf("inputSchema:");
    const schema = schemaStart === -1 ? null : braceSlice(entry, schemaStart);
    return {
      name: match[1],
      title: extractStringField(entry, "title"),
      description: extractStringField(entry, "description"),
      inputSchema: schema ? normalizeSchema(schema) : null,
    };
  });
}

async function loadRemote() {
  const localOverride = process.env.CATALOG_REMOTE_PATH;
  if (localOverride) return readFileSync(resolve(process.cwd(), localOverride), "utf8");
  const res = await fetch(REMOTE_URL);
  if (!res.ok) throw new Error(`Failed to fetch hosted catalog: ${res.status} ${res.statusText} (${REMOTE_URL})`);
  return res.text();
}

const errors = [];
const warnings = [];

const local = parseCatalog(readFileSync(LOCAL_PATH, "utf8"), "TOOLS");
const remote = parseCatalog(await loadRemote(), "MCP_TOOLS");

if (local.length === 0) errors.push("Parsed 0 tools from src/tools.ts — the parser is out of date, not the catalog.");
if (remote.length === 0) errors.push("Parsed 0 tools from the hosted catalog — the parser is out of date, not the catalog.");

const localByName = new Map(local.map((t) => [t.name, t]));
const remoteByName = new Map(remote.map((t) => [t.name, t]));

for (const name of localByName.keys()) {
  if (!remoteByName.has(name)) errors.push(`"${name}" exists here but not in the hosted catalog.`);
}
for (const name of remoteByName.keys()) {
  if (!localByName.has(name)) errors.push(`"${name}" exists in the hosted catalog but not here.`);
}

for (const [name, l] of localByName) {
  const r = remoteByName.get(name);
  if (!r) continue;
  if (l.inputSchema === null || r.inputSchema === null) {
    errors.push(`"${name}" is missing an inputSchema on one side.`);
  } else if (schemaShape(l.inputSchema) !== schemaShape(r.inputSchema)) {
    errors.push(
      `"${name}" inputSchema structure differs.\n      here:   ${schemaShape(l.inputSchema)}\n      hosted: ${schemaShape(r.inputSchema)}`
    );
  } else if (l.inputSchema !== r.inputSchema) {
    warnings.push(`"${name}" inputSchema field descriptions differ (structure matches).`);
  }
  if (l.title !== r.title) warnings.push(`"${name}" title differs: ${JSON.stringify(l.title)} vs ${JSON.stringify(r.title)}`);
  if (l.description !== r.description) warnings.push(`"${name}" description differs.`);
}

console.log(`Compared ${local.length} local tools against ${remote.length} hosted tools.`);

for (const w of warnings) console.warn(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} contract difference(s). Reconcile src/tools.ts with functions/src/mcp-tools.ts in Mopra/exit1.dev.`);
  process.exit(1);
}
console.log(warnings.length ? `\nOK — ${warnings.length} prose difference(s), no contract drift.` : "\nOK — catalogs are in sync.");
