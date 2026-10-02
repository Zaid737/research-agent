import type { Client } from "@modelcontextprotocol/client";

export async function callMCPTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  return result;
}