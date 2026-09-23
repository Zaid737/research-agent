import "dotenv/config";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";

const openAI = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const serverPath = path.resolve("src/server/index.ts");
const tsxPath = path.resolve("node_modules/tsx/dist/cli.mjs");

const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxPath, serverPath],
    cwd: process.cwd(),
});

transport.onerror = (error) => {
    console.error("Transport error:", error);
};

transport.onclose = () => {
    console.error("Transport closed");
};

const client = new Client({
    name: "research-agent",
    version: "1.0.0",
});

try {
    await client.connect(transport);

    console.log("Connected to MCP server");

    const { tools } = await client.listTools();

    console.log("\n Available tools:");

    for (const tool of tools) {
        console.log(`- ${tool.name}`);
    }

      const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] =
    tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema as Record<string, unknown>,
      },
    }));

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: "user",
            content:
            "Research the latest developments in Model Context Protocol and give me a short summary",
        },
    ];

    while(true) {
        const response = await openAI.chat.completions.create({
            model: "gpt-5-mini",
            messages,
            tools: openAITools,
        });

        const message = response.choices[0]?.message;

        if(!message) {
            throw new Error("No response from OpenAI");
        }

        messages.push(message);

        if(!message.tool_calls?.length) {
            console.log("\n Final answer:\n");
            console.log(message.content);
            break;
        }

        for (const toolCall of message.tool_calls) {
            if(toolCall.type !== "function") {
                continue;
            }
            const toolName = toolCall.function.name;
            const toolArguments = JSON.parse(
                toolCall.function.arguments
            ) as Record<string, unknown>;
             console.log(`\nAgent selected tool: ${toolName}`);
             console.log("Arguments:", toolArguments);

             const result = await client.callTool({
                name: toolName,
                arguments: toolArguments,
             });
             console.log("\nTool result:");
             console.dir(result, { depth: null });

             messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
             });
        }
    }
}catch(error){
    console.error("Agent error", error);
}finally {
    await client.close();
}
