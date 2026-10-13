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

Evaluate whether the current research is sufficient
to answer the original user question.

Return ONLY valid JSON.

The JSON MUST have exactly this structure:

{
  "sufficient": true,
  "reason": "string",
  "missingInformation": [
    "string"
  ],
  "nextTasks": [
    "string"
  ]
}

IMPORTANT:

- missingInformation MUST contain only strings.
- nextTasks MUST contain only strings.
- Do NOT return objects inside nextTasks.
- Do NOT use fields such as id, description, status inside nextTasks.

If sufficient is true:
- nextTasks MUST be []

If sufficient is false:
- nextTasks should contain specific research task descriptions.

Do not include Markdown.
Do not include \`\`\`json.
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