// Live introspection: start the author's MCP server over stdio, initialize a
// client, and pull the real tools/resources/prompts it serves. This is the most
// accurate way to lint what will actually ship. The SDK is imported lazily so
// the package's pure lint engine has no hard runtime dependency on it.

import type { LintTarget, ToolDef } from "./types.js";

export interface IntrospectOptions {
  /** Full shell command to launch the server, e.g. `node build/index.js`. */
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
}

export async function introspect(opts: IntrospectOptions): Promise<Partial<LintTarget>> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args ?? [],
    cwd: opts.cwd,
    env: { ...filterEnv(process.env), ...(opts.env ?? {}) },
    stderr: "ignore",
  });

  const client = new Client(
    { name: "mcp-conform", version: "0.0.0" },
    { capabilities: {} },
  );

  const timeout = opts.timeoutMs ?? 15000;
  await withTimeout(client.connect(transport), timeout, "connect");

  try {
    const caps = client.getServerCapabilities() ?? {};
    const tools = await safeList(
      () => client.listTools(),
      (r) => (r.tools ?? []) as ToolDef[],
    );
    const resources = caps.resources
      ? await safeList(
          () => client.listResources(),
          (r) => (r.resources ?? []) as unknown[],
        )
      : [];
    const prompts = caps.prompts
      ? await safeList(
          () => client.listPrompts(),
          (r) => (r.prompts ?? []) as unknown[],
        )
      : [];

    return {
      live: true,
      tools: tools ?? [],
      capabilities: caps as Record<string, unknown>,
      resourceCount: resources?.length ?? 0,
      promptCount: prompts?.length ?? 0,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function safeList<T>(
  call: () => Promise<unknown>,
  pick: (r: any) => T,
): Promise<T | undefined> {
  try {
    const r = await call();
    return pick(r);
  } catch {
    return undefined;
  }
}

function filterEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === "string") out[k] = v;
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms waiting for ${label}.`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
