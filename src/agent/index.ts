import "dotenv/config";

import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ResearchSource = {
  title: string;
  url: string;
};

const sources: ResearchSource[] = [];

const MIN_SOURCES = 2;
const MAX_SOURCES = 3;
const MAX_ITERATIONS = 6;

function addSource(source: ResearchSource) {
  const exists = sources.some(
    (existing) => existing.url === source.url
  );

  if (!exists && sources.length < MAX_SOURCES) {
    sources.push(source);
  }
}

function extractFetchedSource(
  result: unknown
): ResearchSource | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const structuredContent = (
    result as {
      structuredContent?: unknown;
    }
  ).structuredContent;

  if (
    !structuredContent ||
    typeof structuredContent !== "object"
  ) {
    return null;
  }

  const page = structuredContent as {
    title?: unknown;
    url?: unknown;
  };

  if (typeof page.url !== "string") {
    return null;
  }

  const title =
    typeof page.title === "string" &&
    page.title.trim().length > 0
      ? page.title.trim()
      : page.url;

  return {
    title,
    url: page.url,
  };
}

function buildSourceList(): string {
  if (sources.length === 0) {
    return "No successfully fetched sources.";
  }

  return sources
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} — ${source.url}`
    )
    .join("\n");
}

const serverPath = path.resolve("src/server/index.ts");
const tsxPath = path.resolve(
  "node_modules/tsx/dist/cli.mjs"
);

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

  console.log("\nAvailable tools:");

  for (const tool of tools) {
    console.log(`- ${tool.name}`);
  }

  const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] =
    tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema as Record<
          string,
          unknown
        >,
      },
    }));

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      {
        role: "system",
        content: `
You are an autonomous web research agent.

Your task is to research the user's question and produce
a concise evidence-based answer.

Research strategy:

1. Start with search_web.
2. Inspect the search results.
3. Select the most relevant sources.
4. Prefer primary and official sources.
5. Use fetch_page to inspect the actual source.
6. Use independent sources when necessary.
7. Do not repeatedly search the same topic without a reason.
8. Do not fetch multiple versions of the same page.
9. Do not treat search snippets as equivalent to fetched pages.
10. Never invent facts or sources.

Research budget:

- Normally fetch 2 sources.
- Fetch a third source only if it adds materially different
  information or verifies an important claim.
- Once enough evidence exists, stop researching and answer.

For current or latest questions:

- Prefer recent sources.
- Use the current year in searches.
- Prefer official announcements, specifications,
  documentation, or primary sources.

Final answer:

- Be concise.
- Base factual claims on retrieved evidence.
- Mention uncertainty when evidence is incomplete.
- Include a Sources section.
- Only list sources that were actually fetched.
`,
      },
      {
        role: "user",
        content:
          "Research the latest developments in Model Context Protocol and give me a short summary.",
      },
    ];

  let completed = false;

  for (
    let iteration = 1;
    iteration <= MAX_ITERATIONS;
    iteration++
  ) {
    console.log(
      `\n--- Research iteration ${iteration}/${MAX_ITERATIONS} ---`
    );

    console.log(
      `Fetched sources: ${sources.length}/${MAX_SOURCES}`
    );

    /*
     * Once we have enough sources, remove tools.
     * This forces the model to synthesize.
     */
    const toolsForIteration =
      sources.length >= MIN_SOURCES
        ? []
        : openAITools;

    const response = await openAI.chat.completions.create({
      model: "gpt-5-mini",
      messages,
      tools: toolsForIteration,
    });

    const message = response.choices[0]?.message;

    if (!message) {
      throw new Error("No response from OpenAI");
    }

    messages.push(message);

    /*
     * No tool call means the model decided it has
     * enough information.
     */
    if (!message.tool_calls?.length) {
      console.log("\nFinal answer:\n");
      console.log(message.content);

      completed = true;
      break;
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        continue;
      }

      const toolName = toolCall.function.name;

      const toolArguments = JSON.parse(
        toolCall.function.arguments
      ) as Record<string, unknown>;

      console.log(
        `\nAgent selected tool: ${toolName}`
      );

      console.log(
        "Arguments:",
        toolArguments
      );

      let result: unknown;

      try {
        result = await client.callTool({
          name: toolName,
          arguments: toolArguments,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unknown tool error";

        console.error(
          `Tool ${toolName} failed:`,
          errorMessage
        );

        result = {
          isError: true,
          content: [
            {
              type: "text",
              text: `Tool ${toolName} failed: ${errorMessage}`,
            },
          ],
        };
      }

      console.log("\nTool result:");
      console.dir(result, { depth: null });

      /*
       * Only fetched pages become research sources.
       */
      if (toolName === "fetch_page") {
        const fetchedSource =
          extractFetchedSource(result);

        if (fetchedSource) {
          addSource(fetchedSource);

          console.log(
            `Source added: ${fetchedSource.title}`
          );
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      /*
       * Stop processing additional tool calls once
       * our research budget has been reached.
       */
      if (sources.length >= MAX_SOURCES) {
        break;
      }
    }
  }

  /*
   * Final safety net.
   */
  if (!completed) {
    console.log(
      "\nResearch budget reached."
    );

    console.log(
      "Forcing final synthesis..."
    );

    const sourceList = buildSourceList();

    messages.push({
      role: "user",
      content: `
The research phase is complete.

Do not call any tools.

Produce the final answer using only the evidence
already retrieved.

Keep it concise.

Include a Sources section containing exactly the
successfully fetched sources below:

${sourceList}

Do not invent additional sources or URLs.
`,
    });

    const finalResponse =
      await openAI.chat.completions.create({
        model: "gpt-5-mini",
        messages,
        tools: [],
      });

    const finalMessage =
      finalResponse.choices[0]?.message;

    console.log("\nFinal answer:\n");

    console.log(
      finalMessage?.content ??
        "Unable to generate final answer."
    );
  }
} catch (error) {
  console.error("Agent error:", error);
} finally {
  await client.close();
}