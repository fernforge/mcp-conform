// Annotation conformance rules.
// Missing/incorrect tool annotations are the #1 cause of rejection from the
// ChatGPT and Claude app directories: the spec says consumers MUST assume the
// worst case (destructive, open-world) when a hint is absent, so authors have
// to set them explicitly. These rules enforce that at publish time.

import type { Finding, LintTarget, ToolDef } from "../types.js";

// Verbs that strongly imply a tool mutates state. If a tool name looks like a
// mutation but does not say so via annotations, that is a conformance gap.
const MUTATION_VERBS = [
  "delete", "remove", "destroy", "drop", "purge", "truncate",
  "update", "edit", "modify", "patch", "set", "write", "put",
  "create", "add", "insert", "post", "send", "publish", "deploy",
  "move", "rename", "merge", "cancel", "revoke", "reset",
];

// Verbs that imply a read-only tool. Used to flag a missing readOnlyHint that
// would otherwise be safe to set true.
const READ_VERBS = [
  "get", "list", "read", "fetch", "search", "find", "query",
  "lookup", "view", "show", "describe", "count", "check", "status",
];

function firstWord(name: string): string {
  // tools are often snake_case or camelCase: take the leading token
  const snake = name.split(/[_\-./]/)[0];
  const camel = snake.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ")[0];
  return camel.toLowerCase();
}

export function annotationRules(target: LintTarget): Finding[] {
  const findings: Finding[] = [];
  for (const tool of target.tools) {
    findings.push(...checkTool(tool));
  }
  return findings;
}

function checkTool(tool: ToolDef): Finding[] {
  const out: Finding[] = [];
  const a = tool.annotations ?? {};
  const t = tool.name;
  const verb = firstWord(t);
  const looksMutating = MUTATION_VERBS.includes(verb);
  const looksReading = READ_VERBS.includes(verb);

  const hasTitle = typeof a.title === "string" && a.title.trim().length > 0;
  const hasTopTitle = typeof tool.title === "string" && tool.title.trim().length > 0;
  if (!hasTitle && !hasTopTitle) {
    out.push({
      rule: "ann/missing-title",
      category: "annotations",
      severity: "warning",
      target: t,
      message: `Tool "${t}" has no human-readable title.`,
      fix: `Add annotations.title (e.g. "Delete File") so client UIs can show a friendly label.`,
    });
  }

  if (a.readOnlyHint === undefined) {
    out.push({
      rule: "ann/missing-readonly-hint",
      category: "annotations",
      severity: looksReading ? "error" : "warning",
      target: t,
      message: `Tool "${t}" does not set readOnlyHint; clients must assume it can modify state.`,
      fix: looksReading
        ? `Its name suggests a read. Set annotations.readOnlyHint = true.`
        : `Set annotations.readOnlyHint explicitly (true if it never mutates, false otherwise).`,
    });
  }

  // A tool that is NOT read-only should declare whether it is destructive.
  const isReadOnly = a.readOnlyHint === true;
  if (!isReadOnly && a.destructiveHint === undefined) {
    out.push({
      rule: "ann/missing-destructive-hint",
      category: "annotations",
      severity: looksMutating ? "error" : "warning",
      target: t,
      message: `Tool "${t}" may modify state but does not set destructiveHint; clients assume the destructive worst case.`,
      fix: `Set annotations.destructiveHint (true for irreversible ops like delete, false for additive ones).`,
    });
  }

  if (looksMutating && a.readOnlyHint === true) {
    out.push({
      rule: "ann/contradictory-readonly",
      category: "annotations",
      severity: "error",
      target: t,
      message: `Tool "${t}" is marked readOnlyHint=true but its name ("${verb}") implies it mutates state.`,
      fix: `Re-check the annotation: a "${verb}" tool is rarely read-only.`,
    });
  }

  if (a.openWorldHint === undefined) {
    out.push({
      rule: "ann/missing-openworld-hint",
      category: "annotations",
      severity: "info",
      target: t,
      message: `Tool "${t}" does not set openWorldHint.`,
      fix: `Set annotations.openWorldHint = true if it touches an open/external system (web, email), false for a closed domain.`,
    });
  }

  return out;
}
