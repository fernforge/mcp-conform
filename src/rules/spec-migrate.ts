// spec-migrate rule pack — scans an MCP server's source for the breaking changes
// that ship with the 2026-07-28 spec and reports, with file:line, exactly what
// breaks and how to fix it. Pure pattern matching over source lines; no LLM, no
// AST step, no network. Patterns target the literal symbols and strings that the
// TypeScript and Python SDKs put in author code, so hits are high-signal.
//
// Spec references: SEP-2567 (session-id removal), SEP-2575 (initialize/initialized
// handshake removal), SEP-2577 (Roots/Sampling/Logging deprecation), SEP-2663
// (Tasks extension, on the SEP-2133 extensions framework), plus the error-code
// change -32002 -> -32602 (SEP-2164),
// the new Mcp-Method / Mcp-Name routing headers, and ttlMs/cacheScope caching.

import type { Finding, LintTarget, Severity, SourceFile } from "../types.js";

interface Pattern {
  rule: string;
  severity: Severity;
  // Per-line regex. First capture (if any) is echoed back in the message.
  re: RegExp;
  message: (file: string, line: number, hit: string) => string;
  fix: string;
}

// HARD BREAKS — removed or changed at the protocol layer on 2026-07-28. These
// stop working the moment a client speaks the new protocol, so they are errors.
const HARD_BREAKS: Pattern[] = [
  {
    rule: "migrate/session-id-header",
    severity: "error",
    re: /\bMcp-Session-Id\b|['"`]mcp-session-id['"`]/i,
    message: (f, l) =>
      `Mcp-Session-Id is removed (SEP-2567). The 2026-07-28 transport is stateless; this header no longer exists.`,
    fix: `Stop reading/writing Mcp-Session-Id. Read protocol version, client info and capabilities from params._meta on each request instead of a per-session store.`,
  },
  {
    rule: "migrate/session-id-generator",
    severity: "error",
    re: /\bsessionIdGenerator\b|\beventStore\b\s*[:=]/,
    message: () =>
      `StreamableHTTP "sessionIdGenerator"/session store is removed (SEP-2567). Sessions are gone at the protocol layer.`,
    fix: `Drop sessionIdGenerator and the session/event store. Configure the transport in stateless mode and carry per-request context in params._meta.`,
  },
  {
    rule: "migrate/initialize-handshake",
    severity: "error",
    re: /\bInitializeRequestSchema\b|\bInitializedNotificationSchema\b|\boninitialized\b|\bset_initialization_options\b/,
    message: () =>
      `The initialize/initialized handshake is removed (SEP-2575). There is no negotiation round-trip in the 2026-07-28 protocol.`,
    fix: `Remove explicit initialize/initialized handlers. Any request can hit any instance; derive capabilities/protocolVersion from params._meta per request.`,
  },
  {
    rule: "migrate/error-code-32002",
    severity: "error",
    re: /(?<![\d-])-32002\b/,
    message: () =>
      `JSON-RPC error code -32002 is reassigned to -32602 (Invalid Params) in the 2026-07-28 spec.`,
    fix: `Change -32002 to -32602. Clients that pattern-match on the numeric code will mishandle the old value.`,
  },
];

// DEPRECATIONS — still present on 2026-07-28 but on a documented 12-month runway
// to removal (~July 2027, SEP-2577 / SEP-2663). Warn, don't fail the build.
const DEPRECATIONS: Pattern[] = [
  {
    rule: "migrate/deprecated-sampling",
    severity: "warning",
    re: /\bCreateMessageRequestSchema\b|\bsampling\/createMessage\b|\bcreate_message\b/,
    message: () =>
      `The "sampling" primitive is deprecated (SEP-2577), 12-month runway to removal.`,
    fix: `Plan to replace server-initiated sampling with a direct LLM API call from your own code.`,
  },
  {
    rule: "migrate/deprecated-roots",
    severity: "warning",
    re: /\bListRootsRequestSchema\b|\bRootsListChangedNotification\b|\blist_roots\b|['"`]roots\/list['"`]/,
    message: () =>
      `The "roots" primitive is deprecated (SEP-2577), 12-month runway to removal.`,
    fix: `Pass filesystem roots / working context explicitly via tool inputs rather than relying on the roots primitive.`,
  },
  {
    rule: "migrate/deprecated-logging",
    severity: "warning",
    re: /\bLoggingMessageNotification\b|\bsendLoggingMessage\b|\bsetLoggingLevel\b|\bsend_log_message\b|['"`]logging\/setLevel['"`]/,
    message: () =>
      `The "logging" primitive is deprecated (SEP-2577), 12-month runway to removal.`,
    fix: `Move structured logs to stderr or OpenTelemetry instead of the logging/* protocol methods.`,
  },
  {
    rule: "migrate/tasks-extension",
    severity: "warning",
    re: /\bCreateTaskRequest\w*\b|['"`]tasks\/(create|get|list|cancel)['"`]/,
    message: () =>
      `Tasks move out of core into a versioned extension (SEP-2663, on the SEP-2133 extensions framework) on 2026-07-28.`,
    fix: `Negotiate Tasks under extensions (e.g. "com.modelcontextprotocol/tasks") instead of assuming it is a core capability.`,
  },
];

// Signals that the project hand-rolls HTTP transport handling (rather than using
// a high-level SDK helper). Such code is what must add the new routing headers
// and caching fields, so absence-checks only fire when these signals are present.
const CUSTOM_TRANSPORT_SIGNAL =
  /req(uest)?\.headers\[|\.get_header\(|StreamableHTTPServerTransport|streamable_http|createServer\(|app\.(post|all)\(/i;

export function specMigrateRules(target: LintTarget): Finding[] {
  const files = target.sourceFiles ?? [];
  const out: Finding[] = [];

  let sawMcpMethodHeader = false;
  let sawMcpNameHeader = false;
  let sawTtlMs = false;
  let sawCustomTransport = false;
  let sawListResult = false;

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of [...HARD_BREAKS, ...DEPRECATIONS]) {
        const m = p.re.exec(line);
        if (m) {
          out.push({
            rule: p.rule,
            category: "migration",
            severity: p.severity,
            target: `${file.path}:${i + 1}`,
            message: p.message(file.path, i + 1, m[1] ?? m[0]),
            fix: p.fix,
          });
        }
      }
      if (/\bMcp-Method\b|['"`]mcp-method['"`]/i.test(line)) sawMcpMethodHeader = true;
      if (/\bMcp-Name\b|['"`]mcp-name['"`]/i.test(line)) sawMcpNameHeader = true;
      if (/\bttlMs\b|\bcacheScope\b/.test(line)) sawTtlMs = true;
      if (CUSTOM_TRANSPORT_SIGNAL.test(line)) sawCustomTransport = true;
      if (/ListToolsRequestSchema|ListResourcesRequestSchema|['"`](tools|resources)\/(list|read)['"`]|list_tools|list_resources/.test(line))
        sawListResult = true;
    }
  }

  // Absence checks — only meaningful when the project clearly implements MCP and
  // hand-rolls transport / list handlers. Kept at info so they never fail CI on
  // their own; they are reminders, not breakages.
  if (sawCustomTransport && !sawMcpMethodHeader) {
    out.push({
      rule: "migrate/missing-mcp-method-header",
      category: "migration",
      severity: "info",
      target: "transport",
      message: `Custom HTTP transport detected but no Mcp-Method header handling found. The 2026-07-28 spec requires Mcp-Method on every request.`,
      fix: `Read and validate the Mcp-Method header for request routing instead of relying on session state.`,
    });
  }
  if (sawCustomTransport && !sawMcpNameHeader) {
    out.push({
      rule: "migrate/missing-mcp-name-header",
      category: "migration",
      severity: "info",
      target: "transport",
      message: `Custom HTTP transport detected but no Mcp-Name header handling found. The 2026-07-28 spec requires Mcp-Name on tools/call requests.`,
      fix: `Read the Mcp-Name header on tools/call so the call can be routed without a session.`,
    });
  }
  if (sawListResult && !sawTtlMs) {
    out.push({
      rule: "migrate/missing-cache-fields",
      category: "migration",
      severity: "info",
      target: "transport",
      message: `tools/list or resources handlers found, but no ttlMs/cacheScope caching fields. 2026-07-28 adds optional cache metadata to list/read results.`,
      fix: `Add ttlMs (integer ms) and cacheScope ("global"|"user"|"session") to list/read results so clients can cache them.`,
    });
  }

  return out;
}
