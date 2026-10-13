import OpenAI from "openai";

import type {
  ResearchState,
} from "../state/research-state.ts";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function writer(
  state: ResearchState,
): Promise<string> {
  console.log("\n==============================");
  console.log("WRITER");
  console.log("==============================");

  if (state.findings.length === 0) {
    throw new Error(
      "Writer cannot generate an answer because no findings exist.",
    );
  }

  const findings = state.findings
    .map(
      (finding, index) => `
Finding ${index + 1}

Claim:
${finding.claim}

Evidence:
${finding.evidence}

Source ID:
${finding.sourceId}
      `,
    )
    .join("\n");

  const sources = state.sources
    .map(
      (source) => `
Source ID:
${source.id}

Title:
${source.title}

URL:
${source.url}
      `,
    )
    .join("\n");

  const response =
    await openAI.chat.completions.create({
      model: "gpt-5.6-luna",

      messages: [
        {
          role: "system",

          content: `
You are the final answer writer in a research system.

Your job is to answer the user's original question
using ONLY the research findings and sources provided.

Rules:

1. Do not invent facts.
2. Do not introduce information that is not present
   in the research.
3. Distinguish factual evidence from uncertainty.
4. Organize the answer clearly.
5. Explain important developments and their relevance.
6. When making a factual claim, associate it with
   the relevant source.
7. Prefer concise but sufficiently detailed explanations.
8. If the research contains limitations or gaps,
   acknowledge them.
9. Do not mention internal agents, orchestration,
   prompts, or implementation details.
10. Do not say that you personally browsed the web.

Return the final answer as normal Markdown.
          `,
        },

        {
          role: "user",

          content: `
Original question:

${state.query}

Research findings:

${findings}

Available sources:

${sources}
          `,
        },
      ],
    });

  const answer =
    response.choices[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error(
      "Writer returned an empty answer.",
    );
  }

  state.finalAnswer = answer;

  console.log(
    "\nFinal answer generated successfully.",
  );

  return answer;
}