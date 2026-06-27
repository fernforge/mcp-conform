# mcp-conform

**An eslint for your MCP server.** A deterministic, author-side **conformance & safety linter** you run **before you publish** a [Model Context Protocol](https://modelcontextprotocol.io) server to npm, PyPI, or the official MCP registry.

It catches the things that get servers **rejected from the ChatGPT and Claude app directories** and that make agents call your tools wrong — missing tool annotations, thin/ambiguous schemas, tool-poisoning patterns in descriptions, and incomplete registry metadata — and gives every issue a one-line fix.

```bash
npx mcp-conform --cmd "node dist/index.js"
```

```
mcp-conform — 7 tool(s) checked

delete_record
  ✖ error  ann/missing-destructive-hint  Tool "delete_record" may modify state but does not set destructiveHint.
         fix: Set annotations.destructiveHint (true for irreversible ops like delete).
  ✖ error  safety/injection-phrase  Tool description contains an injection-style phrase (instruction override).
         fix: Remove instruction-like text; describe behavior, don't issue commands to the agent.

1 error · 4 warning · 5 info
Conformance score: 76/100   FAIL
```

- **No LLM key, no network, fully deterministic.** It's a linter, not a model. Safe to run in CI, free to run a thousand times a day, and its verdict never drifts.
- **Lints what actually ships.** Point it at your server's launch command and it starts the server over stdio, calls `tools/list`, and inspects the *real* schemas your users will receive — not a guess from your source.
- **Drop-in GitHub Action** that scores every PR and writes a job summary.

---

## Why this exists

The MCP ecosystem is shipping **tens of thousands of servers**, and the bar for publishing just went up:

- **Bad tool annotations are the #1 cause of rejection** from the ChatGPT and Claude app directories. The spec says a client **must assume the worst case** (destructive, open-world) when a hint is missing — so if you don't set `readOnlyHint` / `destructiveHint` / `openWorldHint` / `title`, clients treat your safe read tool as dangerous.
- **Tool descriptions are an injection surface.** They're injected straight into the agent's context, so an "ignore previous instructions" or an invisible Unicode payload in a description is a real **tool-poisoning** vector.
- **The official registry now does namespace-verified publishing.** Reverse-DNS names, a `server.json` manifest, and clean package metadata are part of being publishable and discoverable.
- The community is **drafting a pre-publish conformance checklist** ([modelcontextprotocol Discussion #2682](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions)). `mcp-conform` is the automated enforcer for it.

Existing MCP security tools are **consumer/runtime-side** — they scan servers you're about to *install*. `mcp-conform` is **author-side and shift-left**: it makes *your* server conformant before anyone installs it.

---

## Install

Run it without installing:

```bash
npx mcp-conform --cmd "node dist/index.js"
```

Or add it as a dev dependency:

```bash
npm install --save-dev mcp-conform
```

Requires Node ≥ 18. The MCP SDK is an **optional** peer dependency — only needed for live `--cmd` introspection (most projects already have it).

---

## Usage

`mcp-conform` always lints your **project metadata** (`package.json`, `server.json`) and takes the **tools** to lint from one of three sources:

### 1. Live server (recommended — lints what really ships)

```bash
mcp-conform --cmd "node dist/index.js"
mcp-conform --cmd "python -m my_server"
mcp-conform --cmd "uvx my-mcp-server"
```

It launches the server over stdio, initializes a client, and lints the real `tools/list` output plus capability/transport hygiene.

### 2. A saved tools manifest

```bash
mcp-conform --manifest tools.json
```

Where `tools.json` is either a `tools/list` result (`{ "tools": [...] }`) or a bare array of tool definitions. Handy for Python/Go servers or for snapshotting in tests.

### 3. Metadata only

```bash
mcp-conform   # checks package.json + server.json in the current dir
```

### Output & CI

```bash
mcp-conform --cmd "node dist/index.js" --json            # machine-readable
mcp-conform --cmd "node dist/index.js" --markdown --out report.md
mcp-conform --cmd "node dist/index.js" --min-score 80    # fail under 80
mcp-conform --cmd "node dist/index.js" --max-warnings 0  # fail on any warning
```

`mcp-conform` exits **non-zero when there's any error-severity finding**, so it fails CI by default. Tighten the gate with `--min-score` and `--max-warnings`.

---

## GitHub Action

Add `.github/workflows/mcp-conform.yml` to your server repo:

```yaml
name: MCP Conformance
on: [pull_request, push]
jobs:
  conform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - uses: fernforge/mcp-conform@v0.1.0
        with:
          cmd: "node dist/index.js"
          min-score: "80"
```

It writes a Markdown report to the job summary and fails the check when the score drops below your threshold.

---

## What it checks

| Category | Examples |
| --- | --- |
| **Annotations** | missing `readOnlyHint` / `destructiveHint` / `openWorldHint`; missing human-readable `title`; a `delete_*`/`update_*` tool marked read-only |
| **Schema hygiene** | missing/thin tool description; params with no description or type; missing `inputSchema`; `additionalProperties` unset; missing `outputSchema` |
| **Safety / tool-poisoning** | "ignore previous instructions" & concealment phrases; hidden zero-width / bidi / Unicode-tag characters; oversized descriptions; high-agency (`exec`/`sql`/`write_file`) tools understating their reach |
| **Distribution metadata** | missing `name`/`version`/`license`/`repository`; no `keywords` or no `mcp` keyword; no `bin`/`main`; no `engines` |
| **Registry** | no `server.json`; name not in reverse-DNS namespace form; missing manifest fields |
| **Transport** *(live only)* | advertised capability with nothing served, or tools served without the capability advertised |

Every finding carries a `rule` id, a severity (`error` / `warning` / `info`), and a concrete **fix**. The **conformance score (0–100)** is a single deterministic number you can track over time.

---

## Programmatic API

```ts
import { lint, introspect, loadProjectMetadata } from "mcp-conform";

const live = await introspect({ command: "node", args: ["dist/index.js"] });
const meta = await loadProjectMetadata(process.cwd());
const result = lint({ ...live, ...meta });

console.log(result.score, result.pass);
for (const f of result.findings) console.log(f.severity, f.rule, f.message);
```

---

## Roadmap

- `--fix` for the mechanical annotation/metadata gaps
- A config file (`mcpconform.json`) to set severities and disable rules
- A published `mcpconform-config-recommended` ruleset that tracks the community conformance checklist as it finalizes

Issues and rule suggestions welcome — the rule set is meant to track the standard as it forms.

## License

MIT © fernforge
