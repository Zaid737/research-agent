import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { fetchPage } from "../tools/fetch.js";
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

  server.registerTool(
  "fetch_page",
  {
    description:
      "Fetch and read the full contents of a web page. Use this after search_web when you need to inspect the actual source, verify claims, extract details, or gather evidence for the final answer.",
    inputSchema: z.object({
      url: z.string().url(),
    }),
  },
  async ({ url }) => {
    try {
      const page = await fetchPage(url);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(page),
          },
        ],
        structuredContent: page,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch page";

      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
        isError: true,
      };
    }
  }
);

  return server;
}

await serveStdio(createServer);

console.error("Research MCP server running");