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
  // Track which task the researcher is currently working on
  state.currentTaskId = task.id;

  // Create MCP connection
  const client = await createMCPClient();

  try {
    // ============================================================
    // 1. ASK LLM TO CREATE A FOCUSED SEARCH QUERY
    // ============================================================

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

    // ============================================================
    // 2. SEARCH THROUGH MCP
    // ============================================================

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

    // ============================================================
    // 3. SELECT RELEVANT RESULTS
    // ============================================================

    // For now we simply take the first 3 results.
    // Later we will add intelligent source selection.
    const selectedResults = results.slice(0, 3);

    // ============================================================
    // 4. FETCH EACH SELECTED SOURCE
    // ============================================================

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

      // Extract actual webpage text.
      // Our MCP fetch_page tool returns this under `text`.
      const content =
        fetched.structuredContent?.text ?? "";

      // If the page did not contain readable content,
      // skip this source.
      if (!content) {
        console.warn(
          `No content returned for ${result.url}`,
        );

        continue;
      }

      // ==========================================================
      // 5. CREATE SOURCE OBJECT
      // ==========================================================

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

      // Store raw evidence in shared state
      state.sources.push(source);

      console.log(
        `Source added: ${source.title}`,
      );

      // ==========================================================
      // 6. ASK LLM TO EXTRACT FINDINGS
      // ==========================================================

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

      // ==========================================================
      // 7. PARSE FINDINGS
      // ==========================================================

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

        // ========================================================
        // 8. ADD FINDINGS TO SHARED STATE
        // ========================================================

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

    // ============================================================
    // 9. MARK TASK AS COMPLETED
    // ============================================================

    task.status = "completed";

    console.log(
      `Completed ${task.id}: ${state.findings.length} total findings`,
    );
  } finally {
    // Researcher is no longer working on a task
    state.currentTaskId = null;
  }
}