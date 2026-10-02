import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export async function createMCPClient() {
  const client = new Client({
    name: "research-agent",
    version: "1.0.0",
  });

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/server/index.ts"],
  });

  await client.connect(transport);

  return client;
}