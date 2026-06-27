import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lint } from "../src/engine.js";
import { scanSourceFiles } from "../src/load.js";
import { specMigrateRules } from "../src/rules/spec-migrate.js";
import type { LintTarget } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");

function rules(findings: { rule: string }[]): Set<string> {
  return new Set(findings.map((f) => f.rule));
}

test("spec-migrate flags the hard breaks in a legacy server with file:line", async () => {
  const sourceFiles = await scanSourceFiles(join(fixtures, "legacy-server"));
  assert.ok(sourceFiles.length >= 1, "should read the fixture source file");

  const findings = specMigrateRules({ tools: [], sourceFiles } as LintTarget);
  const r = rules(findings);

  assert.ok(r.has("migrate/session-id-header"), "Mcp-Session-Id");
  assert.ok(r.has("migrate/session-id-generator"), "sessionIdGenerator");
  assert.ok(r.has("migrate/initialize-handshake"), "initialize handshake");
  assert.ok(r.has("migrate/error-code-32002"), "error code -32002");
  assert.ok(r.has("migrate/deprecated-sampling"), "deprecated sampling");

  // Every finding points at a real file:line target.
  for (const f of findings.filter((x) => x.category === "migration" && x.target?.includes(":"))) {
    assert.match(f.target!, /server\.ts:\d+/);
  }
});

test("hard breaks are errors, deprecations are warnings", async () => {
  const sourceFiles = await scanSourceFiles(join(fixtures, "legacy-server"));
  const findings = specMigrateRules({ tools: [], sourceFiles } as LintTarget);

  const sev = (rule: string) => findings.find((f) => f.rule === rule)?.severity;
  assert.equal(sev("migrate/session-id-header"), "error");
  assert.equal(sev("migrate/error-code-32002"), "error");
  assert.equal(sev("migrate/deprecated-sampling"), "warning");
});

test("spec-migrate is clean on a 2026-07-28-ready server", async () => {
  const sourceFiles = await scanSourceFiles(join(fixtures, "clean-server"));
  const findings = specMigrateRules({ tools: [], sourceFiles } as LintTarget);
  const errors = findings.filter((f) => f.severity === "error");
  assert.equal(errors.length, 0, JSON.stringify(errors));
});

test("error code regex does not match -32002 inside larger numbers", () => {
  const sourceFiles = [{ path: "x.ts", content: "const x = 1232002; const y = -320021;" }];
  const findings = specMigrateRules({ tools: [], sourceFiles } as LintTarget);
  assert.ok(!findings.some((f) => f.rule === "migrate/error-code-32002"));
});

test("conform pack is unaffected by spec-migrate (default ruleset unchanged)", () => {
  const target: LintTarget = { tools: [] };
  const withDefault = lint(target);
  const withConform = lint(target, { rulesets: ["conform"] });
  assert.deepEqual(withDefault.findings, withConform.findings);
  // spec-migrate findings never appear under the default ruleset.
  assert.ok(!withDefault.findings.some((f) => f.category === "migration"));
});

test("ruleset 'all' runs both packs", async () => {
  const sourceFiles = await scanSourceFiles(join(fixtures, "legacy-server"));
  const res = lint({ tools: [], sourceFiles } as LintTarget, {
    rulesets: ["conform", "spec-migrate"],
  });
  assert.ok(res.findings.some((f) => f.category === "migration"));
});
