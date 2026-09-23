import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { searchWeb } from "../tools/search.js";

function createServer() {
  const server = new McpServer({
    name: "research-mcp-server",
    version: "1.0.0",
  });

  server.registerTool(
    "search_web",
    {
      description: "Search the web for information related to a query",
      inputSchema: z.object({
        query: z.string().min(1).max(500),
      }),
    },
    async ({ query }) => {
      const results = await searchWeb(query);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results),
          },
        ],
        structuredContent: {
          results,
        },
      };
    }
  );

  return server;
}

await serveStdio(createServer);

console.error("Research MCP server running");