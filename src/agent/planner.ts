import OpenAI from "openai";
import type {
  ResearchState,
  ResearchTask,
} from "../state/research-state.ts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type PlannerResponse = {
  tasks: ResearchTask[];
};

export async function planner(state: ResearchState): Promise<void> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.6-luna",

    messages: [
      {
        role: "system",
        content: `
You are a research planning agent.

Your job is to break a user's research question
into clear, specific, independently researchable tasks.

Rules:
- Do not answer the question.
- Do not perform research.
- Do not invent facts.
- Each task should represent one research objective.
- Tasks should collectively cover the user's question.
- Avoid redundant tasks.
- Return only valid JSON.

Required format:
{
  "tasks": [
    {
      "id": "task-1",
      "description": "Research objective",
      "status": "pending"
    }
  ]
}
        `,
      },
      {
        role: "user",
        content: state.query,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Planner returned an empty response");
  }

  const result = JSON.parse(content) as PlannerResponse;

  state.tasks = result.tasks;
}