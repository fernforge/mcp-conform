// A pre-2026-07-28 MCP server that uses several APIs the new spec breaks.
// Used as a fixture for the spec-migrate scanner — not a real server.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  InitializeRequestSchema,
  ListToolsRequestSchema,
  CreateMessageRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const sessions = new Map();

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});

function handle(req: any, res: any) {
  const sid = req.headers["mcp-session-id"];
  const state = sessions.get(sid);
  if (!state) {
    res.status(400).json({ error: { code: -32002, message: "No valid session" } });
    return;
  }
}

const server = new Server({ name: "legacy", version: "1.0.0" });
server.setRequestHandler(InitializeRequestSchema, async () => ({}));
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
server.setRequestHandler(CreateMessageRequestSchema, async () => ({}));
