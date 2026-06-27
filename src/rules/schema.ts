// Schema hygiene rules. Poor tool/parameter schemas are a top cause of an agent
// calling a tool wrong or not at all. These checks mirror the "schema hygiene"
// category of the community pre-publish conformance checklist.

import type { Finding, JsonSchema, LintTarget, ToolDef } from "../types.js";

const MIN_DESC = 12; // chars below this is effectively no description

export function schemaRules(target: LintTarget): Finding[] {
  const findings: Finding[] = [];
  for (const tool of target.tools) findings.push(...checkTool(tool));
  return findings;
}

function checkTool(tool: ToolDef): Finding[] {
  const out: Finding[] = [];
  const t = tool.name;

  if (!tool.description || !tool.description.trim()) {
    out.push({
      rule: "schema/no-description",
      category: "schema",
      severity: "error",
      target: t,
      message: `Tool "${t}" has no description; agents cannot reliably decide when to call it.`,
      fix: `Add a one-sentence description of what the tool does and when to use it.`,
    });
  } else if (tool.description.trim().length < MIN_DESC) {
    out.push({
      rule: "schema/thin-description",
      category: "schema",
      severity: "warning",
      target: t,
      message: `Tool "${t}" has a very short description ("${tool.description.trim()}").`,
      fix: `Expand it to describe behavior, inputs, and side effects.`,
    });
  }

  const schema = tool.inputSchema;
  if (!schema) {
    out.push({
      rule: "schema/no-input-schema",
      category: "schema",
      severity: "error",
      target: t,
      message: `Tool "${t}" declares no inputSchema.`,
      fix: `Provide a JSON Schema (use type:"object" with no properties for a no-arg tool).`,
    });
    return out;
  }

  const isObject = schema.type === "object" ||
    (Array.isArray(schema.type) && schema.type.includes("object"));
  const props = schema.properties ?? {};
  const propNames = Object.keys(props);

  if (!schema.type) {
    out.push({
      rule: "schema/no-input-type",
      category: "schema",
      severity: "warning",
      target: t,
      message: `inputSchema for "${t}" has no top-level "type".`,
      fix: `Set "type": "object" at the root of inputSchema.`,
    });
  }

  if (isObject && propNames.length > 0 && schema.additionalProperties === undefined) {
    out.push({
      rule: "schema/additional-properties-unset",
      category: "schema",
      severity: "info",
      target: t,
      message: `inputSchema for "${t}" does not set additionalProperties.`,
      fix: `Set "additionalProperties": false to reject unexpected args and tighten validation.`,
    });
  }

  for (const [pname, pschema] of Object.entries(props)) {
    out.push(...checkProp(t, pname, pschema));
  }

  // Output schema is recommended (not required) for structured results.
  if (!tool.outputSchema) {
    out.push({
      rule: "schema/no-output-schema",
      category: "schema",
      severity: "info",
      target: t,
      message: `Tool "${t}" declares no outputSchema.`,
      fix: `Add an outputSchema so clients can validate structured results (optional but recommended).`,
    });
  }

  return out;
}

function checkProp(tool: string, pname: string, p: JsonSchema): Finding[] {
  const out: Finding[] = [];
  const where = `${tool}.${pname}`;
  if (!p.description || !p.description.trim()) {
    out.push({
      rule: "schema/param-no-description",
      category: "schema",
      severity: "warning",
      target: where,
      message: `Parameter "${where}" has no description.`,
      fix: `Describe what "${pname}" means and its expected format.`,
    });
  }
  if (Array.isArray(p.enum) && p.enum.length === 0) {
    out.push({
      rule: "schema/empty-enum",
      category: "schema",
      severity: "warning",
      target: where,
      message: `Parameter "${where}" declares an empty enum.`,
      fix: `Populate the enum with allowed values or remove it.`,
    });
  }
  if (!p.type && !p.enum && p.$ref === undefined && p.anyOf === undefined && p.oneOf === undefined) {
    out.push({
      rule: "schema/param-no-type",
      category: "schema",
      severity: "info",
      target: where,
      message: `Parameter "${where}" has no declared type.`,
      fix: `Give "${pname}" an explicit JSON Schema type.`,
    });
  }
  return out;
}
