import OpenAI from "openai";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type CriticResult = {
  sufficient: boolean;
  reason: string;
  missingInformation: string[];
  contradictions: string[];
  nextSearch: string | null;
};

export async function evaluateResearch(
  question: string,
  evidence: string
): Promise<CriticResult> {
  const currentDate =
    new Date().toISOString().split("T")[0];

  const response =
    await openAI.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `
You are a research evidence evaluator.

Your job is to evaluate whether the collected evidence
is sufficient to answer the user's question.

Evaluate:

1. Whether the evidence directly addresses the question.
2. Whether there are enough independent sources.
3. Whether important claims are supported.
4. Whether the sources appear relevant and reliable.
5. Whether there are contradictions or unresolved claims.
6. Whether more research is necessary.

Minimum evidence requirements:

- At least 2 fetched sources are required.
- Search result snippets do NOT count as fetched evidence.
- Sources must directly relate to the research question.
- Do not require independent sources automatically.
- Independent sources are preferred when the question
  involves adoption, market impact, quantitative claims,
  controversy, or claims that benefit from external
  corroboration.
- For technical release/update questions, multiple
  official primary sources may be sufficient if they
  directly document the developments.
- For current or latest questions, prefer recent sources.
- Prefer official or primary sources for technical facts.
- If the available evidence directly answers the question
  and contains enough detail for the requested level of
  summary, mark the research sufficient.
- Do not demand exhaustive verification when the user
  requested a short summary.

If more research is required:

- sufficient must be false
- missingInformation should explain what specific
  information is actually necessary to answer the question
- nextSearch should contain one focused search query

Do NOT request additional research merely because:

- there are no independent sources, when multiple relevant
  primary sources are already available
- GitHub/SEP artifacts were not fetched, unless the question
  specifically requires technical implementation details
- adoption metrics were not fetched, unless the question
  asks about adoption
- SDK release notes were not fetched, unless the question
  asks about SDK implementation status

Current date:

${currentDate}

Use this date when evaluating whether information is
current, recent, planned, upcoming, released, or outdated.

For questions containing words such as:
"latest", "current", "today", "recent", or "now":

- Prefer the newest available source.
- Pay attention to publication dates and release status.
- Distinguish between:
  - planned
  - announced
  - release candidate
  - released/final
  - deprecated
  - cancelled
- Never describe a past event as upcoming.
- If a source describes a future event but the current date is
  later than that event, do not present it as upcoming.
- When sources conflict on timeline or status:
  - Prefer the newer authoritative source.
  - If the newer source clearly resolves the conflict,
    do not request additional research.
  - If the conflict remains unresolved and materially affects
    the answer, set sufficient to false and request a focused
    search.

Evidence quality rules:

- Evaluate evidence based on what was actually fetched.
- Do not treat search snippets as fetched evidence.
- Do not assume that a source is authoritative merely because
  its title or snippet claims authority.
- Prefer primary sources for technical facts, specifications,
  releases, APIs, and implementation details.
- Prefer independent sources when evaluating adoption,
  market impact, public reaction, or disputed claims.
- Do not reject sufficient evidence simply because it comes
  from multiple sources belonging to the same organization.
- Do not require exhaustive coverage of every related
  development.

If the collected evidence is sufficient to produce a
useful, accurate answer to the user's actual question,
mark sufficient as true.

Do not optimize for exhaustive research.
Optimize for sufficient evidence for the requested answer.

Return ONLY valid JSON matching this structure:

{
  "sufficient": boolean,
  "reason": string,
  "missingInformation": string[],
  "contradictions": string[],
  "nextSearch": string | null
}
`,
        },
        {
          role: "user",
          content: `
Research question:

${question}

Current date:

${currentDate}

Collected evidence:

${evidence}
`,
        },
      ],
      response_format: {
        type: "json_object",
      },
    });

  const content =
    response.choices[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Critic returned an empty response"
    );
  }

  let result: unknown;

  try {
    result = JSON.parse(content);
  } catch {
    throw new Error(
      "Critic returned invalid JSON"
    );
  }

  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Invalid critic result"
    );
  }

  const raw =
    result as Record<string, unknown>;

  const sufficient =
    typeof raw.sufficient === "boolean"
      ? raw.sufficient
      : false;

  const reason =
    typeof raw.reason === "string"
      ? raw.reason
      : "The critic did not provide a valid reason.";

  const missingInformation =
    Array.isArray(
      raw.missingInformation
    )
      ? raw.missingInformation.filter(
          (
            item
          ): item is string =>
            typeof item === "string"
        )
      : [];

  const contradictions =
    Array.isArray(
      raw.contradictions
    )
      ? raw.contradictions.filter(
          (
            item
          ): item is string =>
            typeof item === "string"
        )
      : [];

  const nextSearch =
    raw.nextSearch === null
      ? null
      : typeof raw.nextSearch === "string"
        ? raw.nextSearch
        : null;

  return {
    sufficient,
    reason,
    missingInformation,
    contradictions,
    nextSearch,
  };
}