// Distribution & registry metadata rules. The official MCP registry now does
// namespace-verified publishing (reverse-DNS names tied to a verified GitHub
// org or domain), and discovery depends on good package metadata. These checks
// run against package.json and server.json so a server is publish-ready.

import type { Finding, LintTarget } from "../types.js";

const MCP_KEYWORDS = ["mcp", "model-context-protocol", "modelcontextprotocol"];

export function distributionRules(target: LintTarget): Finding[] {
  const out: Finding[] = [];
  out.push(...packageRules(target));
  out.push(...serverJsonRules(target));
  return out;
}

function packageRules(target: LintTarget): Finding[] {
  const out: Finding[] = [];
  const pkg = target.packageJson;
  if (!pkg) {
    out.push({
      rule: "dist/no-package-json",
      category: "distribution",
      severity: "info",
      target: "package.json",
      message: `No package.json found in the project directory.`,
      fix: `Run from your server's project root, or pass --project, so metadata can be checked.`,
    });
    return out;
  }
  const need = (field: string, sev: "error" | "warning") => {
    const v = pkg[field];
    if (v === undefined || v === null || v === "" ) {
      out.push({
        rule: `dist/no-${field}`,
        category: "distribution",
        severity: sev,
        target: "package.json",
        message: `package.json is missing "${field}".`,
        fix: `Add a "${field}" field before publishing.`,
      });
    }
  };
  need("name", "error");
  need("version", "error");
  need("description", "warning");
  need("license", "warning");
  need("repository", "warning");

  const keywords = Array.isArray(pkg.keywords) ? (pkg.keywords as string[]) : [];
  if (keywords.length === 0) {
    out.push({
      rule: "dist/no-keywords",
      category: "distribution",
      severity: "warning",
      target: "package.json",
      message: `package.json has no keywords; the package will be hard to discover.`,
      fix: `Add keywords including "mcp" and "model-context-protocol".`,
    });
  } else if (!keywords.some((k) => MCP_KEYWORDS.includes(String(k).toLowerCase()))) {
    out.push({
      rule: "dist/missing-mcp-keyword",
      category: "distribution",
      severity: "warning",
      target: "package.json",
      message: `package.json keywords do not include an MCP keyword.`,
      fix: `Add "mcp" (and ideally "model-context-protocol") to keywords for registry/search discovery.`,
    });
  }

  const hasBin = pkg.bin !== undefined;
  const hasMain = pkg.main !== undefined || pkg.exports !== undefined || pkg.module !== undefined;
  if (!hasBin && !hasMain) {
    out.push({
      rule: "dist/no-entrypoint",
      category: "distribution",
      severity: "warning",
      target: "package.json",
      message: `package.json declares neither "bin" nor "main"/"exports".`,
      fix: `A stdio MCP server should expose a "bin" so it can be run via npx.`,
    });
  }

  if (pkg.engines === undefined) {
    out.push({
      rule: "dist/no-engines",
      category: "distribution",
      severity: "info",
      target: "package.json",
      message: `package.json declares no "engines".`,
      fix: `Add "engines": { "node": ">=18" } to signal the supported runtime.`,
    });
  }
  return out;
}

function serverJsonRules(target: LintTarget): Finding[] {
  const out: Finding[] = [];
  const sj = target.serverJson;
  if (!sj) {
    out.push({
      rule: "registry/no-server-json",
      category: "registry",
      severity: "info",
      target: "server.json",
      message: `No server.json found; the server is not described for the official MCP registry.`,
      fix: `Add a server.json manifest to publish to registry.modelcontextprotocol.io.`,
    });
    return out;
  }
  const name = sj.name;
  if (typeof name !== "string" || !name) {
    out.push({
      rule: "registry/no-name",
      category: "registry",
      severity: "error",
      target: "server.json",
      message: `server.json has no "name".`,
      fix: `Set a reverse-DNS name like "io.github.<org>/<server>".`,
    });
  } else if (!/^[a-z0-9.-]+\/[A-Za-z0-9._-]+$/.test(name)) {
    out.push({
      rule: "registry/name-not-namespaced",
      category: "registry",
      severity: "warning",
      target: "server.json",
      message: `server.json name "${name}" is not in reverse-DNS namespace form.`,
      fix: `Use a verified namespace, e.g. "io.github.<org>/<server>", to pass registry verification.`,
    });
  }
  for (const field of ["description", "version"]) {
    if (sj[field] === undefined) {
      out.push({
        rule: `registry/no-${field}`,
        category: "registry",
        severity: "warning",
        target: "server.json",
        message: `server.json is missing "${field}".`,
        fix: `Add "${field}" to the registry manifest.`,
      });
    }
  }
  return out;
}
