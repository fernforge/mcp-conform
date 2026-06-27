# A 2026-07-28-ready MCP server. No removed APIs, reads context from _meta,
# emits cache fields. Fixture for the spec-migrate scanner — should be clean.
from mcp.server import Server

server = Server("clean")


@server.list_tools()
async def list_tools():
    return {"tools": [], "ttlMs": 300000, "cacheScope": "global"}


def route(request):
    method = request.headers["Mcp-Method"]
    name = request.headers.get("Mcp-Name")
    meta = request.params.get("_meta", {})
    return method, name, meta
