// Core types for the mcp-conform lint engine.

export type Severity = "error" | "warning" | "info";

export type Category =
  | "annotations"
  | "schema"
  | "safety"
  | "distribution"
  | "registry"
  | "transport"
  | "migration";

/** Which rule packs to run. "conform" = the standing conformance/safety linter;
 *  "spec-migrate" = the source scanner for the 2026-07-28 MCP spec breaking changes. */
export type Ruleset = "conform" | "spec-migrate";

/** A source file read off disk for the spec-migrate scanner. */
export interface SourceFile {
  /** Path relative to the project root, used in finding targets (e.g. "src/server.ts:42"). */
  path: string;
  content: string;
}

/** A single normalized MCP tool definition, as returned by `tools/list`. */
export interface ToolDef {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [k: string]: unknown;
}

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [k: string]: unknown;
}

/** Everything the engine needs to lint a server before publish. */
export interface LintTarget {
  /** Tools served by the server (from live introspection or a manifest). */
  tools: ToolDef[];
  /** Whether tools were obtained from a live server (enables transport checks). */
  live?: boolean;
  /** Server capabilities advertised during initialize (live mode only). */
  capabilities?: Record<string, unknown>;
  /** Number of resources / prompts (live mode), for capability-mismatch checks. */
  resourceCount?: number;
  promptCount?: number;
  /** Parsed package.json of the project, if found. */
  packageJson?: Record<string, unknown>;
  /** Parsed server.json (MCP registry manifest), if found. */
  serverJson?: Record<string, unknown>;
  /** Source files read from the project, scanned by the spec-migrate rule pack. */
  sourceFiles?: SourceFile[];
}

export interface Finding {
  rule: string;
  category: Category;
  severity: Severity;
  message: string;
  /** Where the problem is, e.g. a tool name or "package.json". */
  target?: string;
  /** A concrete, actionable fix hint. */
  fix?: string;
}

export interface LintResult {
  findings: Finding[];
  counts: Record<Severity, number>;
  /** 0-100 conformance score. */
  score: number;
  /** True when there are zero error-severity findings. */
  pass: boolean;
  toolCount: number;
}
