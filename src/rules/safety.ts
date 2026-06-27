// Safety / tool-poisoning rules. Tool descriptions and titles are injected into
// the agent's context, so a malicious or careless description is a prompt-
// injection vector ("tool poisoning"). These deterministic checks catch the
// well-documented patterns before they ship.

import type { Finding, LintTarget, ToolDef } from "../types.js";

// Imperative phrases that have no business in a legitimate tool description and
// are the signature of a tool-poisoning / instruction-override attempt.
const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?)/i, label: "instruction override" },
  { re: /disregard\s+(the\s+)?(system|previous|above)/i, label: "instruction override" },
  { re: /do\s+not\s+(tell|inform|mention|reveal)\s+(the\s+)?(user|human)/i, label: "concealment from user" },
  { re: /without\s+(telling|informing|notifying)\s+the\s+user/i, label: "concealment from user" },
  { re: /\b(system|developer)\s+prompt\b/i, label: "system-prompt reference" },
  { re: /<important>|<secret>|<system>|<\/?instructions?>/i, label: "hidden instruction tag" },
  { re: /you\s+must\s+(always|first|now)\b/i, label: "coercive directive" },
  { re: /before\s+(using|calling)\s+any\s+other\s+tool/i, label: "tool-ordering coercion" },
  { re: /\bexfiltrat|\bsend\s+(it|them|the\s+\w+)\s+to\s+https?:/i, label: "exfiltration directive" },
];

// Tool names that grant broad/arbitrary capability and warrant explicit hints.
const HIGH_AGENCY = /\b(exec|eval|shell|sh|bash|run_?command|system|subprocess|spawn|sql|raw_?query|http_?request|fetch_?url|read_?file|write_?file)\b/i;

export function safetyRules(target: LintTarget): Finding[] {
  const findings: Finding[] = [];
  for (const tool of target.tools) findings.push(...checkTool(tool));
  return findings;
}

function checkTool(tool: ToolDef): Finding[] {
  const out: Finding[] = [];
  const t = tool.name;
  const text = [tool.description ?? "", tool.title ?? "", tool.annotations?.title ?? ""]
    .filter(Boolean)
    .join("\n");

  for (const { re, label } of INJECTION_PATTERNS) {
    if (re.test(text)) {
      out.push({
        rule: "safety/injection-phrase",
        category: "safety",
        severity: "error",
        target: t,
        message: `Tool "${t}" description contains an injection-style phrase (${label}).`,
        fix: `Remove instruction-like text from the description; describe behavior, do not issue commands to the agent.`,
      });
    }
  }

  // Invisible / control characters are a classic tool-poisoning hiding place.
  const hidden = findHiddenChars(text);
  if (hidden.length > 0) {
    out.push({
      rule: "safety/hidden-characters",
      category: "safety",
      severity: "error",
      target: t,
      message: `Tool "${t}" contains ${hidden.length} invisible/control character(s) (e.g. ${hidden.join(", ")}).`,
      fix: `Strip zero-width, bidi, and Unicode-tag characters from the description and title.`,
    });
  }

  // Long descriptions hide payloads and waste context budget.
  if ((tool.description?.length ?? 0) > 1024) {
    out.push({
      rule: "safety/oversized-description",
      category: "safety",
      severity: "warning",
      target: t,
      message: `Tool "${t}" has a very long description (${tool.description!.length} chars).`,
      fix: `Trim it: oversized descriptions both bloat the context window and hide injected instructions.`,
    });
  }

  // High-agency tools must not silently look read-only / non-destructive.
  if (HIGH_AGENCY.test(t)) {
    const a = tool.annotations ?? {};
    if (a.readOnlyHint === true || a.destructiveHint === false) {
      out.push({
        rule: "safety/understated-agency",
        category: "safety",
        severity: "warning",
        target: t,
        message: `High-agency tool "${t}" is annotated as read-only/non-destructive.`,
        fix: `Verify the hints: arbitrary exec/query/file tools are typically destructive and open-world.`,
      });
    }
  }

  return out;
}

function findHiddenChars(s: string): string[] {
  const flagged = new Set<string>();
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const invisible =
      cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff || // zero-width / BOM
      (cp >= 0x202a && cp <= 0x202e) || // bidi overrides
      (cp >= 0x2066 && cp <= 0x2069) || // bidi isolates
      (cp >= 0xe0000 && cp <= 0xe007f) || // Unicode tag block (smuggling)
      (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d); // control chars
    if (invisible) flagged.add("U+" + cp.toString(16).toUpperCase().padStart(4, "0"));
  }
  return [...flagged];
}
