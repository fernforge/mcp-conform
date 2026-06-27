// Loaders for the static inputs: project metadata (package.json / server.json)
// and a tools manifest file (a saved tools/list result or a bare tools array).

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SourceFile, ToolDef } from "./types.js";

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

// Source extensions the spec-migrate scanner reads. MCP servers in the wild are
// overwhelmingly TypeScript/JavaScript or Python; the breaking-change symbols
// live in those.
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py)$/;
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", "coverage",
  "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache", "vendor",
]);
const MAX_FILES = 4000;
const MAX_FILE_BYTES = 512 * 1024;

/**
 * Recursively read the project's source files for the spec-migrate scanner.
 * Skips dependency/build dirs and oversized/binary files; paths are returned
 * relative to `dir` so findings read like "src/server.ts:42".
 */
export async function scanSourceFiles(dir: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const walk = async (current: string): Promise<void> => {
    if (out.length >= MAX_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const full = join(current, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        await walk(full);
      } else if (e.isFile() && SOURCE_EXT.test(e.name)) {
        try {
          const content = await readFile(full, "utf8");
          if (content.length > MAX_FILE_BYTES) continue;
          out.push({ path: relative(dir, full) || e.name, content });
        } catch {
          // unreadable / non-utf8 file, skip
        }
      }
    }
  };
  await walk(dir);
  return out;
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
