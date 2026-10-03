import OpenAI from "openai";

import type {
  ResearchState,
  CriticResult,
} from "../state/research-state.ts";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function critic(
  state: ResearchState,
): Promise<CriticResult> {
  console.log("\n==============================");
  console.log("CRITIC");
  console.log("==============================");

  const findings = state.findings
    .map(
      (finding, index) => `
Finding ${index + 1}:

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
      (source, index) => `
Source ${index + 1}:

ID:
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
You are a research critic.

Your job is to evaluate whether the current research
contains enough reliable and relevant information to
answer the user's original question.

Evaluate:

1. Coverage
   - Are the important parts of the question covered?

2. Evidence
   - Are the findings supported by sources?

3. Relevance
   - Do the findings actually answer the question?

4. Missing information
   - What important information is still missing?

5. Research quality
   - Are there obvious gaps, contradictions, or weak evidence?

If the research is sufficient:
- sufficient must be true
- nextTasks must be an empty array

If the research is insufficient:
- sufficient must be false
- identify what is missing
- create specific research tasks that would fill the gaps

Return ONLY valid JSON:

{
  "sufficient": true,
  "reason": "...",
  "missingInformation": [],
  "nextTasks": []
}
          `,
        },

        {
          role: "user",

          content: `
Original research question:

${state.query}

Current research tasks:

${state.tasks
  .map(
    (task) =>
      `${task.id}: ${task.description} [${task.status}]`,
  )
  .join("\n")}

Current sources:

${sources}

Current findings:

${findings}
          `,
        },
      ],
    });

  const content =
    response.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error(
      "Critic returned no response",
    );
  }

  let result: CriticResult;

  try {
    result = JSON.parse(content) as CriticResult;
  } catch {
    throw new Error(
      "Critic returned invalid JSON",
    );
  }

  state.critique = result;

  console.log(
    `Research sufficient: ${result.sufficient}`,
  );

  console.log(
    `Reason: ${result.reason}`,
  );

  if (result.missingInformation.length > 0) {
    console.log(
      "\nMissing information:",
    );

    for (const missing of result.missingInformation) {
      console.log(`- ${missing}`);
    }
  }

  if (result.nextTasks.length > 0) {
    console.log(
      "\nSuggested next tasks:",
    );

    for (const task of result.nextTasks) {
      console.log(`- ${task}`);
    }
  }

  return result;
}