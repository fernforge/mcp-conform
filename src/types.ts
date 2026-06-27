// Core types for the mcp-conform lint engine.

export type Severity = "error" | "warning" | "info";

export type Category =
  | "annotations"
  | "schema"
  | "safety"
  | "distribution"
  | "registry"
  | "transport";

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
