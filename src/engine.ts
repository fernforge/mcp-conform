// The lint engine: runs every rule set against a normalized LintTarget and
// computes a deterministic conformance score. Pure and side-effect free, so it
// is trivially testable without spawning any server.

import type { Finding, LintResult, LintTarget, Severity } from "./types.js";
import { annotationRules } from "./rules/annotations.js";
import { schemaRules } from "./rules/schema.js";
import { safetyRules } from "./rules/safety.js";
import { distributionRules } from "./rules/distribution.js";
import { transportRules } from "./rules/transport.js";

const WEIGHT: Record<Severity, number> = { error: 10, warning: 3, info: 0.5 };

export function lint(target: LintTarget): LintResult {
  const findings: Finding[] = [
    ...annotationRules(target),
    ...schemaRules(target),
    ...safetyRules(target),
    ...distributionRules(target),
    ...transportRules(target),
  ];

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  let penalty = 0;
  for (const f of findings) {
    counts[f.severity]++;
    penalty += WEIGHT[f.severity];
  }

  // Score scales the penalty against the number of "checkable units" so that a
  // server with many tools is not punished disproportionately. Each tool plus
  // the two metadata documents form the denominator basis.
  const units = Math.max(1, target.tools.length * 3 + 4);
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
