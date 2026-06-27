#!/usr/bin/env node
// mcp-conform CLI — author-side, pre-publish conformance & safety linter for MCP servers.

import { writeFile } from "node:fs/promises";
import { lint } from "./engine.js";
import { introspect } from "./introspect.js";
import { loadManifestTools, loadProjectMetadata, scanSourceFiles } from "./load.js";
import { renderConsole, renderJson, renderMarkdown } from "./report.js";
import type { LintTarget, Ruleset, ToolDef } from "./types.js";

const VERSION = "0.2.0";

interface Args {
  cmd?: string; // command to launch a live server
  manifest?: string; // path to a tools manifest json
  project: string; // project dir for package.json/server.json
  format: "console" | "json" | "markdown";
  out?: string; // write report to file
  maxWarnings: number; // fail if warnings exceed this
  minScore?: number; // fail if score below this
  rulesets: Ruleset[]; // which rule packs to run
  help: boolean;
  version: boolean;
  noColor: boolean;
}

function parseRulesets(v: string): Ruleset[] {
  const valid: Ruleset[] = ["conform", "spec-migrate"];
  const picked = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (picked.includes("all")) return [...valid];
  const out = picked.filter((p): p is Ruleset => (valid as string[]).includes(p));
  return out.length ? out : ["conform"];
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    project: ".",
    format: "console",
    maxWarnings: Infinity,
    rulesets: ["conform"],
    help: false,
    version: false,
    noColor: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case "--cmd": a.cmd = next(); break;
      case "--manifest": a.manifest = next(); break;
      case "--project": a.project = next() ?? "."; break;
      case "--format": a.format = next() as Args["format"]; break;
      case "--json": a.format = "json"; break;
      case "--markdown": a.format = "markdown"; break;
      case "--out": a.out = next(); break;
      case "--max-warnings": a.maxWarnings = Number(next()); break;
      case "--min-score": a.minScore = Number(next()); break;
      case "--ruleset": case "--rulesets": a.rulesets = parseRulesets(next() ?? "conform"); break;
      case "--no-color": a.noColor = true; break;
      case "-h": case "--help": a.help = true; break;
      case "-v": case "--version": a.version = true; break;
      default:
        if (t.startsWith("--cmd=")) a.cmd = t.slice(6);
        else if (t.startsWith("--ruleset=")) a.rulesets = parseRulesets(t.slice(10));
        else if (t.startsWith("--rulesets=")) a.rulesets = parseRulesets(t.slice(11));
        else if (!t.startsWith("-") && !a.cmd) a.cmd = t; // positional = launch command
        break;
    }
  }
  return a;
}

const HELP = `mcp-conform v${VERSION} — conformance, safety & spec-migration linter for MCP servers

USAGE
  mcp-conform [--cmd "<launch command>"] [options]

RULE PACKS
  --ruleset conform        Conformance & safety lint (default): annotations, schema
                           hygiene, tool-poisoning, registry/distribution metadata.
  --ruleset spec-migrate   Scan source for the 2026-07-28 MCP spec breaking changes
                           (session removal, handshake removal, -32002 -> -32602,
                           new Mcp-Method/Mcp-Name headers, ttlMs, deprecated
                           Roots/Sampling/Logging, Tasks extension). Reports file:line.
  --ruleset all            Run both packs.   (comma-separated also works)

INPUT (pick one source of tools; project metadata & source are always checked)
  --cmd "<command>"      Launch the server over stdio and lint the tools it serves
                         e.g.  mcp-conform --cmd "node build/index.js"
  --manifest <file>      Lint tools from a saved tools/list JSON (or a tools array)
  --project <dir>        Project root holding package.json / server.json + source (default ".")

OUTPUT
  --format console|json|markdown   Output format (default: console)
  --json | --markdown              Shorthands for --format
  --out <file>                     Also write the report to a file
  --no-color                       Disable ANSI colors

EXIT POLICY (for CI)
  Exits 1 if any error-severity finding exists.
  --max-warnings <n>     Also fail if warnings exceed n
  --min-score <n>        Also fail if the conformance score is below n

EXAMPLES
  mcp-conform --cmd "node dist/server.js"
  mcp-conform --manifest tools.json --markdown --out report.md
  mcp-conform --cmd "python -m my_server" --min-score 80
  mcp-conform --ruleset spec-migrate --project .         # what breaks on 2026-07-28
  mcp-conform --ruleset all --cmd "node dist/server.js" --markdown
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.noColor) process.env.NO_COLOR = "1";
  if (args.help) { process.stdout.write(HELP); return 0; }
  if (args.version) { process.stdout.write(VERSION + "\n"); return 0; }

  let tools: ToolDef[] = [];
  let live = false;
  let capabilities: Record<string, unknown> | undefined;
  let resourceCount: number | undefined;
  let promptCount: number | undefined;

  const runsConform = args.rulesets.includes("conform");
  const runsMigrate = args.rulesets.includes("spec-migrate");
  const projectDir = args.project === "." ? process.cwd() : args.project;

  if (args.cmd && runsConform) {
    const parts = splitCommand(args.cmd);
    const introspected = await introspect({
      command: parts[0],
      args: parts.slice(1),
      cwd: projectDir,
    }).catch((e: Error) => {
      process.stderr.write(`\nmcp-conform: failed to introspect server: ${e.message}\n`);
      return undefined;
    });
    if (!introspected) return 2;
    tools = introspected.tools ?? [];
    live = !!introspected.live;
    capabilities = introspected.capabilities;
    resourceCount = introspected.resourceCount;
    promptCount = introspected.promptCount;
  } else if (args.manifest && runsConform) {
    tools = await loadManifestTools(args.manifest);
  } else if (runsConform && !runsMigrate) {
    process.stderr.write(
      "mcp-conform: no tool source given. Pass --cmd \"<launch command>\" or --manifest <file>.\n" +
      "Project metadata will still be checked. Use --help for details.\n\n",
    );
  }

  const meta = await loadProjectMetadata(projectDir);
  const sourceFiles = runsMigrate ? await scanSourceFiles(projectDir) : undefined;
  if (runsMigrate && sourceFiles && sourceFiles.length === 0) {
    process.stderr.write(
      `mcp-conform: spec-migrate found no source files under "${projectDir}". ` +
      `Pass --project <dir> pointing at your server's source.\n\n`,
    );
  }

  const target: LintTarget = {
    tools,
    live,
    capabilities,
    resourceCount,
    promptCount,
    sourceFiles,
    packageJson: meta.packageJson,
    serverJson: meta.serverJson,
  };

  const result = lint(target, { rulesets: args.rulesets });

  let output: string;
  if (args.format === "json") output = renderJson(result);
  else if (args.format === "markdown") output = renderMarkdown(result);
  else output = renderConsole(result);

  process.stdout.write(output + "\n");
  if (args.out) await writeFile(args.out, output);

  // GitHub Action job-summary support: append markdown when running in Actions.
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(result), { flag: "a" }).catch(() => {});
  }

  // Exit policy
  let failed = !result.pass;
  if (Number.isFinite(args.maxWarnings) && result.counts.warning > args.maxWarnings) failed = true;
  if (args.minScore !== undefined && result.score < args.minScore) failed = true;
  return failed ? 1 : 0;
}

function splitCommand(cmd: string): string[] {
  // minimal POSIX-ish split honoring single/double quotes
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out.length ? out : [cmd];
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`mcp-conform: ${err?.stack ?? err}\n`);
    process.exit(2);
  },
);
