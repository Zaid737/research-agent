import "dotenv/config";

import type {
  ResearchState,
} from "../state/research-state.ts";

import { createInitialState } from "../state/research-state.ts";
import { planner } from "./planner.ts";
import { researcher } from "./researcher.ts";

export async function runResearchAgent(
  query: string,
): Promise<ResearchState> {
  
  // 1. CREATE INITIAL SHARED STATE
  const state = createInitialState(query);

  console.log("\n==============================");
  console.log("RESEARCH AGENT STARTED");
  console.log("==============================");

  console.log("\nOriginal query:");
  console.log(state.query);

  // 2. PLANNER
  console.log("\n==============================");
  console.log("PLANNER");
  console.log("==============================");

  await planner(state);

  console.log(
    `\nPlanner created ${state.tasks.length} research tasks.`,
  );

  for (const task of state.tasks) {
    console.log(
      `\n[${task.id}] ${task.description}`,
    );
  }

  // 3. RESEARCH TASK LOOP
  console.log("\n==============================");
  console.log("RESEARCH PHASE");
  console.log("==============================");

  for (const task of state.tasks) {
    if (task.status === "completed") {
      continue;
    }

    console.log("\n------------------------------");
    console.log(`Starting ${task.id}`);
    console.log("------------------------------");

    await researcher(state, task);

    console.log(
      `\n${task.id} completed.`,
    );

    console.log(
      `Sources collected: ${state.sources.length}`,
    );

    console.log(
      `Findings collected: ${state.findings.length}`,
    );
  }

  // 4. RESEARCH SUMMARY
  console.log("\n==============================");
  console.log("RESEARCH COMPLETE");
  console.log("==============================");

  console.log(
    `Tasks: ${state.tasks.length}`,
  );

  console.log(
    `Sources: ${state.sources.length}`,
  );

  console.log(
    `Findings: ${state.findings.length}`,
  );

  console.log(
    `Iteration: ${state.iteration}`,
  );

  return state;
}