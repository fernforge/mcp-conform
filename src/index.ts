// Programmatic API. Import { lint, loadProject, introspect } to embed
// mcp-conform in your own tooling.

export { lint } from "./engine.js";
export { introspect } from "./introspect.js";
export { renderConsole, renderJson, renderMarkdown } from "./report.js";
export { loadProjectMetadata, loadManifestTools } from "./load.js";
export type {
  LintTarget,
  LintResult,
  Finding,
  ToolDef,
  ToolAnnotations,
  Severity,
  Category,
} from "./types.js";
