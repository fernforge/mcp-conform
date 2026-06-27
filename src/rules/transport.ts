// Transport / capability rules. These only fire in live mode (when the server
// was actually started and introspected), because they compare what the server
// ADVERTISES during initialize against what it actually SERVES.

import type { Finding, LintTarget } from "../types.js";

export function transportRules(target: LintTarget): Finding[] {
  if (!target.live) return [];
  const out: Finding[] = [];
  const caps = target.capabilities ?? {};

  const advertisesTools = caps.tools !== undefined;
  if (advertisesTools && target.tools.length === 0) {
    out.push({
      rule: "transport/tools-advertised-but-empty",
      category: "transport",
      severity: "warning",
      target: "capabilities",
      message: `Server advertises the "tools" capability but tools/list returned nothing.`,
      fix: `Either register tools or drop the tools capability from the server's declared capabilities.`,
    });
  }
  if (!advertisesTools && target.tools.length > 0) {
    out.push({
      rule: "transport/tools-served-not-advertised",
      category: "transport",
      severity: "error",
      target: "capabilities",
      message: `Server serves ${target.tools.length} tool(s) but does not advertise the "tools" capability.`,
      fix: `Declare the tools capability during initialize so clients enable tool calling.`,
    });
  }

  const advertisesResources = caps.resources !== undefined;
  if (advertisesResources && (target.resourceCount ?? 0) === 0) {
    out.push({
      rule: "transport/resources-advertised-but-empty",
      category: "transport",
      severity: "info",
      target: "capabilities",
      message: `Server advertises "resources" but resources/list returned nothing.`,
      fix: `Register resources or remove the resources capability.`,
    });
  }

  const advertisesPrompts = caps.prompts !== undefined;
  if (advertisesPrompts && (target.promptCount ?? 0) === 0) {
    out.push({
      rule: "transport/prompts-advertised-but-empty",
      category: "transport",
      severity: "info",
      target: "capabilities",
      message: `Server advertises "prompts" but prompts/list returned nothing.`,
      fix: `Register prompts or remove the prompts capability.`,
    });
  }

  return out;
}
