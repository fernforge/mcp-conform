// Loaders for the static inputs: project metadata (package.json / server.json)
// and a tools manifest file (a saved tools/list result or a bare tools array).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDef } from "./types.js";

export async function loadProjectMetadata(dir: string): Promise<{
  packageJson?: Record<string, unknown>;
  serverJson?: Record<string, unknown>;
}> {
  const out: { packageJson?: Record<string, unknown>; serverJson?: Record<string, unknown> } = {};
  out.packageJson = await readJsonIfExists(join(dir, "package.json"));
  out.serverJson = await readJsonIfExists(join(dir, "server.json"));
  return out;
}

/**
 * Accepts either a raw `tools/list` result ({ tools: [...] }) or a bare array
 * of tool definitions, and normalizes to ToolDef[].
 */
export async function loadManifestTools(file: string): Promise<ToolDef[]> {
  const raw = await readFile(file, "utf8");
  const data = JSON.parse(raw);
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.tools)
      ? data.tools
      : null;
  if (!arr) {
    throw new Error(
      `Manifest "${file}" must be a tools array or an object with a "tools" array.`,
    );
  }
  return arr as ToolDef[];
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
