// The lint engine: runs the selected rule packs against a normalized LintTarget
// and computes a deterministic conformance score. Pure and side-effect free, so
// it is trivially testable without spawning any server.

import type { Finding, LintResult, LintTarget, Ruleset, Severity } from "./types.js";
import { annotationRules } from "./rules/annotations.js";
import { schemaRules } from "./rules/schema.js";
import { safetyRules } from "./rules/safety.js";
import { distributionRules } from "./rules/distribution.js";
import { transportRules } from "./rules/transport.js";
import { specMigrateRules } from "./rules/spec-migrate.js";

const WEIGHT: Record<Severity, number> = { error: 10, warning: 3, info: 0.5 };

// The "conform" pack is the standing conformance/safety/distribution linter.
const CONFORM_RULES = [
  annotationRules,
  schemaRules,
  safetyRules,
  distributionRules,
  transportRules,
];
// The "spec-migrate" pack scans source for the 2026-07-28 breaking changes.
const MIGRATE_RULES = [specMigrateRules];

export interface LintOptions {
  /** Which rule packs to run. Defaults to ["conform"] for backward compatibility. */
  rulesets?: Ruleset[];
}

export function lint(target: LintTarget, opts: LintOptions = {}): LintResult {
  const rulesets = opts.rulesets ?? ["conform"];
  const ruleFns = [
    ...(rulesets.includes("conform") ? CONFORM_RULES : []),
    ...(rulesets.includes("spec-migrate") ? MIGRATE_RULES : []),
  ];

  const findings: Finding[] = ruleFns.flatMap((fn) => fn(target));

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  let penalty = 0;
  for (const f of findings) {
    counts[f.severity]++;
    penalty += WEIGHT[f.severity];
  }

  // Score scales the penalty against the number of "checkable units" so a server
  // with many tools (or a big codebase) is not punished disproportionately. Each
  // tool plus the two metadata docs forms the base; scanned source files add to
  // the denominator when the spec-migrate pack runs.
  const sourceUnits = rulesets.includes("spec-migrate")
    ? (target.sourceFiles?.length ?? 0) * 2
    : 0;
  const units = Math.max(1, target.tools.length * 3 + 4 + sourceUnits);
  const maxPenalty = units * WEIGHT.error; // theoretical worst-case ceiling
  const ratio = Math.min(1, penalty / maxPenalty);
  const score = Math.round((1 - ratio) * 100);

  return {
    findings,
    counts,
    score,
    pass: counts.error === 0,
    toolCount: target.tools.length,
  };
}
