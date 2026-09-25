import "dotenv/config";

import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";

import {
  evaluateResearch,
} from "../critic/index.js";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ResearchSource = {
  id: number;
  title: string;
  url: string;
  content: string;
};

const sources: ResearchSource[] = [];

const MIN_SOURCES = 2;
const MAX_SOURCES = 5;
const MAX_ITERATIONS = 8;

const RESEARCH_QUESTION =
  "Research the latest developments in Model Context Protocol and give me a short summary.";

function addSource(
  source: ResearchSource
): ResearchSource | null {
  const exists = sources.some(
    (existing) =>
      existing.url === source.url
  );

  if (
    exists ||
    sources.length >= MAX_SOURCES
  ) {
    return null;
  }

  const added: ResearchSource = {
    ...source,
    id: sources.length + 1,
  };

  sources.push(added);

  return added;
}

function extractFetchedSource(
  result: unknown
): ResearchSource | null {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return null;
  }

  const structuredContent = (
    result as {
      structuredContent?: unknown;
    }
  ).structuredContent;

  if (
    !structuredContent ||
    typeof structuredContent !==
      "object"
  ) {
    return null;
  }

  const page =
    structuredContent as {
      title?: unknown;
      url?: unknown;
      text?: unknown;
    };

  if (
    typeof page.url !== "string" ||
    typeof page.text !== "string"
  ) {
    return null;
  }

  const title =
    typeof page.title === "string" &&
    page.title.trim().length > 0
      ? page.title.trim()
      : page.url;

  return {
    id: 0,
    title,
    url: page.url,
    content: page.text,
  };
}

function buildEvidence(): string {
  if (sources.length === 0) {
    return "No successfully fetched evidence.";
  }

  return sources
    .map(
      (source) => `
[Source ${source.id}]
Title: ${source.title}
URL: ${source.url}

Evidence:
${source.content}
`
    )
    .join(
      "\n-----------------------------\n"
    );
}

const serverPath = path.resolve(
  "src/server/index.ts"
);

const tsxPath = path.resolve(
  "node_modules/tsx/dist/cli.mjs"
);

const transport =
  new StdioClientTransport({
    command: process.execPath,
    args: [
      tsxPath,
      serverPath,
    ],
    cwd: process.cwd(),
  });

transport.onerror = (error) => {
  console.error(
    "Transport error:",
    error
  );
};

transport.onclose = () => {
  console.error(
    "Transport closed"
  );
};

const client = new Client({
  name: "research-agent",
  version: "1.0.0",
});

try {
  await client.connect(
    transport
  );

  console.log(
    "Connected to MCP server"
  );

  const { tools } =
    await client.listTools();

  console.log(
    "\nAvailable tools:"
  );

  for (const tool of tools) {
    console.log(
      `- ${tool.name}`
    );
  }

  const openAITools =
    tools.map(
      (tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description:
            tool.description ?? "",
          parameters:
            tool.inputSchema as Record<
              string,
              unknown
            >,
        },
      })
    );

  const researchMessages:
    OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      {
        role: "system",
        content: `
You are an autonomous web research agent.

Your task is to research the user's question and
collect reliable evidence for a final synthesis.

RESEARCH WORKFLOW:

1. Start with search_web.
2. Inspect the search results.
3. Select the most relevant URLs.
4. Immediately use fetch_page on the most relevant URL.
5. After fetching a source, determine whether another
   source is required.
6. If more evidence is required, search again or fetch
   another relevant URL from an existing search result.
7. Do not treat search result snippets as evidence.
8. Only successfully fetched pages count as evidence.

SOURCE REQUIREMENTS:

- At least ${MIN_SOURCES} distinct sources must be fetched.
- Maximum ${MAX_SOURCES} sources may be fetched.
- Do not fetch the same URL twice.
- Prefer different domains when appropriate.
- Prefer primary and official sources.
- For current/latest questions, prioritize recent sources.
- When possible, corroborate important claims with
  an independent source.

IMPORTANT:

After search_web returns results, DO NOT simply search again
unless the current results are insufficient.

You should normally:

search_web
    ↓
select URL
    ↓
fetch_page
    ↓
evaluate evidence
    ↓
search/fetch more if needed

Do not finish the research phase until at least
${MIN_SOURCES} sources have been successfully fetched.

You are currently in the RESEARCH phase.

Do not write the final answer yet.

Your job is to search, select, fetch, and collect
useful evidence.
`,
      },
      {
        role: "user",
        content:
          RESEARCH_QUESTION,
      },
    ];

  let researchComplete = false;
  let researchFailed = false;

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

    if (
      sources.length >= MAX_SOURCES
    ) {
      console.log(
        "\nMaximum source limit reached."
      );

      researchComplete = true;
      break;
    }

    const response =
      await openAI.chat.completions.create(
        {
          model: "gpt-5-mini",
          messages:
            researchMessages,
          tools: openAITools,
        }
      );

    const message =
      response.choices[0]?.message;

    if (!message) {
      throw new Error(
        "No response from OpenAI"
      );
    }

    researchMessages.push(
      message
    );

    if (
      !message.tool_calls?.length
    ) {
      console.log(
        "\nAgent stopped researching."
      );

      if (
        sources.length >=
        MIN_SOURCES
      ) {
        researchComplete = true;
      } else {
        researchFailed = true;

        console.log(
          `\nResearch stopped with only ${sources.length} fetched source(s).`
        );

        console.log(
          `At least ${MIN_SOURCES} sources are required.`
        );
      }

      break;
    }

    let performedSearch =
      false;

    let performedFetch =
      false;

    for (
      const toolCall of
        message.tool_calls
    ) {
      if (
        toolCall.type !==
        "function"
      ) {
        continue;
      }

      const toolName =
        toolCall.function.name;

      let toolArguments:
        Record<
          string,
          unknown
        >;

      try {
        toolArguments =
          JSON.parse(
            toolCall.function
              .arguments
          ) as Record<
            string,
            unknown
          >;
      } catch {
        console.error(
          "Invalid tool arguments:",
          toolCall.function
            .arguments
        );

        researchMessages.push({
          role: "tool",
          tool_call_id:
            toolCall.id,
          content:
            JSON.stringify({
              isError: true,
              error:
                "Invalid JSON tool arguments.",
            }),
        });

        continue;
      }

      console.log(
        `\nAgent selected tool: ${toolName}`
      );

      console.log(
        "Arguments:",
        toolArguments
      );

      let result: unknown;

      try {
        result =
          await client.callTool(
            {
              name: toolName,
              arguments:
                toolArguments,
            }
          );
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

      console.log(
        "\nTool result:"
      );

      console.dir(
        result,
        {
          depth: null,
        }
      );

      if (
        toolName ===
        "search_web"
      ) {
        performedSearch =
          true;
      }

      if (
        toolName ===
        "fetch_page"
      ) {
        performedFetch =
          true;

        const fetchedSource =
          extractFetchedSource(
            result
          );

        if (fetchedSource) {
          const addedSource =
            addSource(
              fetchedSource
            );

          if (addedSource) {
            console.log(
              `Source added: ${addedSource.title}`
            );

            console.log(
              `Source ID: ${addedSource.id}`
            );
          } else {
            console.log(
              "Source was skipped because it was already collected or the source limit was reached."
            );
          }
        }
      }

      researchMessages.push({
        role: "tool",
        tool_call_id:
          toolCall.id,
        content:
          JSON.stringify(
            result
          ),
      });

      if (
        sources.length >=
        MAX_SOURCES
      ) {
        console.log(
          "\nMaximum source limit reached."
        );

        researchComplete = true;
        break;
      }
    }

    if (researchComplete) {
      break;
    }

    /*
     * If the agent searched but did not fetch anything,
     * explicitly tell it to inspect the search results
     * and fetch a source.
     */
    if (
      performedSearch &&
      !performedFetch
    ) {
      console.log(
        "\nSearch completed without fetching a source."
      );

      researchMessages.push({
        role: "user",
        content: `
You performed a web search but did not fetch
any source.

Search result snippets are not evidence.

You MUST now select the most relevant URL from
the search results and call fetch_page.

Do not perform another search unless the existing
search results are genuinely insufficient.
`,
      });

      continue;
    }

    if (
      sources.length === 0
    ) {
      console.log(
        "\nNo evidence collected yet. Continuing research."
      );

      continue;
    }

    /*
     * Do not run the critic until we have at least
     * one fetched source.
     */
    console.log(
      "\n--- Critic evaluation ---"
    );

    const evidence =
      buildEvidence();

    const critic =
      await evaluateResearch(
        RESEARCH_QUESTION,
        evidence
      );

    console.log(
      "\nCritic result:"
    );

    console.dir(
      critic,
      {
        depth: null,
      }
    );

    /*
     * The application enforces the minimum source
     * requirement independently of the LLM.
     */
    if (
      critic.sufficient &&
      sources.length >= MIN_SOURCES
    ) {
      console.log(
        "\nCritic: evidence is sufficient."
      );

      researchComplete = true;
      break;
    }

    if (
      critic.sufficient &&
      sources.length < MIN_SOURCES
    ) {
      console.log(
        `\nCritic accepted the evidence, but at least ${MIN_SOURCES} sources are required.`
      );

      console.log(
        "More sources are required before synthesis."
      );
    } else {
      console.log(
        "\nCritic: more research is required."
      );
    }

    console.log(
      `Reason: ${critic.reason}`
    );

    if (
      critic.missingInformation
        .length > 0
    ) {
      console.log(
        "\nMissing information:"
      );

      for (
        const item of
          critic.missingInformation
      ) {
        console.log(
          `- ${item}`
        );
      }
    }

    if (
      critic.contradictions
        .length > 0
    ) {
      console.log(
        "\nContradictions:"
      );

      for (
        const item of
          critic.contradictions
      ) {
        console.log(
          `- ${item}`
        );
      }
    }

    /*
     * If the minimum source requirement is not met,
     * force another research cycle.
     */
    if (
      sources.length <
      MIN_SOURCES
    ) {
      const forcedSearch =
        critic.nextSearch ??
        RESEARCH_QUESTION;

      console.log(
        `\nMinimum source requirement not met.`
      );

      console.log(
        `Next search: ${forcedSearch}`
      );

      researchMessages.push({
        role: "user",
        content: `
The research currently contains only
${sources.length} fetched source(s).

At least ${MIN_SOURCES} fetched sources
are required before research can be considered
complete.

The previous search produced results but the
research must now fetch another relevant source.

Use this search query if appropriate:

${forcedSearch}

After searching, select a relevant URL and
call fetch_page.
`,
      });

      continue;
    }

    if (
      critic.nextSearch
    ) {
      console.log(
        `\nNext research query: ${critic.nextSearch}`
      );

      researchMessages.push({
        role: "user",
        content: `
The critic evaluated the current evidence and
determined that more research is required.

Reason:
${critic.reason}

Missing information:
${
  critic.missingInformation.join(
    "\n"
  )
}

Contradictions:
${
  critic.contradictions.join(
    "\n"
  )
}

Perform another research cycle.

Use this focused search query if appropriate:

${critic.nextSearch}

After searching, make sure to fetch the most
relevant source rather than stopping at search
results.
`,
      });
    } else {
      console.log(
        "\nCritic did not provide another search query."
      );

      researchFailed = true;
      break;
    }
  }

  /*
   * Never synthesize a normal answer if the minimum
   * evidence requirement was not satisfied.
   */
  if (
    sources.length <
    MIN_SOURCES
  ) {
    researchFailed = true;
    researchComplete = false;
  }

  if (!researchComplete) {
    console.log(
      "\nResearch did not collect sufficient evidence."
    );
  }

  console.log(
    "\n--- Evidence collected ---"
  );

  if (
    sources.length === 0
  ) {
    console.log(
      "No sources were successfully fetched."
    );
  } else {
    for (
      const source of sources
    ) {
      console.log(
        `[Source ${source.id}] ${source.title}`
      );

      console.log(
        source.url
      );
    }
  }

  /*
   * Stop here if research failed.
   *
   * This prevents the system from generating a
   * confident-looking answer from insufficient evidence.
   */
  if (
  researchFailed ||
  !researchComplete
) {
  console.log(
    "\nFinal synthesis skipped because sufficient evidence was not collected."
  );

  console.log(
    `Required sources: ${MIN_SOURCES}`
  );

  console.log(
    `Collected sources: ${sources.length}`
  );

  process.exitCode = 1;
} else {
  const evidence =
    buildEvidence();

  const synthesisMessages:
    OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      {
        role: "system",
        content: `
You are the final synthesis stage of a web research agent.

Your job is to answer the user's original question using
ONLY the retrieved evidence.

Rules:

1. Do not search the web.
2. Do not call tools.
3. Do not invent facts.
4. Do not invent sources.
5. Every factual claim based on retrieved evidence must
   include a citation such as [Source 1].
6. If a claim uses multiple sources, use:
   [Source 1, Source 2]
7. Only cite sources that actually support the claim.
8. Do not cite a source merely because it exists in the
   Sources section.
9. Keep the answer concise.
10. Distinguish facts from uncertainty.
11. Do not include sources that were not actually fetched.
12. If sources disagree, explicitly describe the disagreement.
13. Do not treat claims from one source as independently
    confirmed by another source unless the evidence supports it.

Citation format:

MCP is an open protocol for connecting AI applications
with external systems. [Source 1]

A later development was described by another retrieved
source. [Source 2]

At the end, include:

Sources:
[Source 1] Title — URL
[Source 2] Title — URL
`,
      },
      {
        role: "user",
        content: `
Original research request:

${RESEARCH_QUESTION}

Retrieved evidence:

${evidence}
`,
      },
    ];

  console.log(
    "\n--- Final synthesis ---"
  );

  const finalResponse =
    await openAI.chat.completions.create(
      {
        model: "gpt-5-mini",
        messages:
          synthesisMessages,
        tools: [],
      }
    );

  const finalMessage =
    finalResponse.choices[0]
      ?.message;

  console.log(
    "\nFinal answer:\n"
  );

  console.log(
    finalMessage?.content ??
      "Unable to generate final answer."
  );
  }
} catch (error) {
  console.error(
    "Agent error:",
    error
  );
} finally {
  await client.close();
}