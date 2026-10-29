import OpenAI from "openai";

import type {
  ResearchState,
  ResearchTask,
  Source,
  Finding,
} from "../state/research-state.ts";

import { createMCPClient } from "../mcp/client.ts";
import { callMCPTool } from "../mcp/tools.ts";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type SearchResponse = {
  structuredContent?: {
    results?: SearchResult[];
  };
};

type FetchResponse = {
  structuredContent?: {
    title?: string;
    url?: string;
    text?: string;
  };
};

export async function researcher(
  state: ResearchState,
  task: ResearchTask,
): Promise<void> {
  state.currentTaskId = task.id;

  const client = await createMCPClient();

  try {
    const searchQueryResponse =
      await openAI.chat.completions.create({
        model: "gpt-5.6-luna",

        messages: [
          {
            role: "system",
            content: `
You are a research agent.

Your job is to create one precise web search query
for the research task provided by the user.

Return ONLY the search query.

Do not explain your reasoning.
Do not answer the research task.
            `,
          },
          {
            role: "user",
            content: task.description,
          },
        ],
      });

    const searchQuery =
      searchQueryResponse.choices[0]?.message?.content?.trim();

    if (!searchQuery) {
      throw new Error(
        "Researcher failed to create search query",
      );
    }

    console.log(
      `\nResearch task: ${task.description}`,
    );

    console.log(
      `Search query: ${searchQuery}`,
    );

    const searchResult = (await callMCPTool(
      client,
      "search_web",
      {
        query: searchQuery,
      },
    )) as SearchResponse;

    const results =
      searchResult.structuredContent?.results ?? [];

    if (results.length === 0) {
      throw new Error(
        "No search results returned",
      );
    }

    console.log(
      `Found ${results.length} search results`,
    );

    const selectedResults = results.slice(0, 3);

    for (const result of selectedResults) {
      console.log(
        `Fetching: ${result.url}`,
      );

      const fetched = (await callMCPTool(
        client,
        "fetch_page",
        {
          url: result.url,
        },
      )) as FetchResponse;

      const content =
        fetched.structuredContent?.text ?? "";

      if (!content) {
        console.warn(
          `No content returned for ${result.url}`,
        );

        continue;
      }

      const sourceId =
        `source-${state.sources.length + 1}`;

      const source: Source = {
        id: sourceId,

        title:
          fetched.structuredContent?.title ??
          result.title,

        url:
          fetched.structuredContent?.url ??
          result.url,

        content,
      };

      state.sources.push(source);

      console.log(
        `Source added: ${source.title}`,
      );

      const findingResponse =
        await openAI.chat.completions.create({
          model: "gpt-5.6-luna",

          messages: [
            {
              role: "system",

              content: `
You are a research evidence extraction agent.

Given a research task and source content:

1. Identify factual claims that directly help answer the task.
2. Provide evidence supporting each claim.
3. Do not invent information.
4. Only use information present in the source.
5. Ignore information that is unrelated to the research task.

Return ONLY valid JSON in this format:

{
  "findings": [
    {
      "claim": "...",
      "evidence": "..."
    }
  ]
}
              `,
            },

            {
              role: "user",

              content: `
Research task:
${task.description}

Source title:
${source.title}

Source URL:
${source.url}

Source content:
${source.content}
              `,
            },
          ],
        });

      const findingContent =
        findingResponse.choices[0]?.message?.content?.trim();

      if (!findingContent) {
        console.warn(
          `No findings returned for ${source.url}`,
        );

        continue;
      }

      try {
        const parsed = JSON.parse(
          findingContent,
        ) as {
          findings: Array<{
            claim: string;
            evidence: string;
          }>;
        };

        if (!Array.isArray(parsed.findings)) {
          console.warn(
            `Invalid findings format from ${source.url}`,
          );

          continue;
        }

        for (const finding of parsed.findings) {
          const structuredFinding: Finding = {
            claim: finding.claim,
            evidence: finding.evidence,
            sourceId,
          };

          state.findings.push(
            structuredFinding,
          );
        }

        console.log(
          `Added ${parsed.findings.length} findings from ${source.url}`,
        );
      } catch (error) {
        console.warn(
          `Could not parse findings from ${source.url}`,
        );

        console.warn(error);
      }
    }

    task.status = "completed";

    console.log(
      `Completed ${task.id}: ${state.findings.length} total findings`,
    );
  } finally {
    state.currentTaskId = null;
    await client.close();
  }
}