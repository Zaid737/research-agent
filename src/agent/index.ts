import "dotenv/config";

import type {
  ResearchState,
  ResearchTask,
} from "../state/research-state.ts";

import { createInitialState } from "../state/research-state.ts";
import { planner } from "./planner.ts";
import { researcher } from "./researcher.ts";
import { critic } from "./critic.ts";
import { writer } from "./writer.ts";

const MAX_ITERATIONS = 3;

export async function runResearchAgent(
  query: string,
): Promise<ResearchState> {
  const state = createInitialState(query);

  console.log("\n==============================");
  console.log("RESEARCH AGENT STARTED");
  console.log("==============================");

  console.log("\nQuery:");
  console.log(state.query);

  // ============================================================
  // 1. PLANNING
  // ============================================================

  console.log("\n==============================");
  console.log("PLANNER");
  console.log("==============================");

  await planner(state);

  console.log(
    `Planner created ${state.tasks.length} tasks.`,
  );

  for (const task of state.tasks) {
    console.log(
      `\n${task.id}: ${task.description}`,
    );
  }

  // ============================================================
  // 2. ITERATIVE RESEARCH LOOP
  // ============================================================

  while (state.iteration < MAX_ITERATIONS) {
    state.iteration++;

    console.log("\n==============================");
    console.log(
      `RESEARCH ITERATION ${state.iteration}`,
    );
    console.log("==============================");

    // ----------------------------------------------------------
    // Find pending tasks
    // ----------------------------------------------------------

    const pendingTasks = state.tasks.filter(
      (task) => task.status === "pending",
    );

    if (pendingTasks.length === 0) {
      console.log(
        "\nNo pending research tasks.",
      );

      break;
    }

    console.log(
      `Pending tasks: ${pendingTasks.length}`,
    );

    // ----------------------------------------------------------
    // Research pending tasks
    // ----------------------------------------------------------

    for (const task of pendingTasks) {
      console.log("\n------------------------------");
      console.log(
        `Researching ${task.id}`,
      );
      console.log("------------------------------");

      await researcher(state, task);
    }

    // ----------------------------------------------------------
    // Critic evaluates research
    // ----------------------------------------------------------

    console.log("\n==============================");
    console.log("CRITIC");
    console.log("==============================");

    const critique = await critic(state);

    // ----------------------------------------------------------
    // Research is sufficient
    // ----------------------------------------------------------

    if (critique.sufficient) {
      console.log(
        "\nCritic says research is sufficient.",
      );

      break;
    }

    // ----------------------------------------------------------
    // Research is insufficient
    // ----------------------------------------------------------

    console.log(
      "\nCritic says more research is required.",
    );

    if (critique.nextTasks.length === 0) {
      console.log(
        "Critic requested more research but provided no tasks.",
      );

      break;
    }

    // ----------------------------------------------------------
    // Convert critic tasks into ResearchTask objects
    // ----------------------------------------------------------

    const existingDescriptions = new Set(
      state.tasks.map(
        (task) => task.description,
      ),
    );

    let nextTaskNumber =
      state.tasks.length + 1;

    for (const nextTask of critique.nextTasks) {
      // The Critic is supposed to return strings.
      // We also safely handle an object in case the LLM
      // returns { description: "..." }.

      let description: string | null = null;

      if (typeof nextTask === "string") {
        description = nextTask;
      } else if (
        typeof nextTask === "object" &&
        nextTask !== null
      ) {
        const taskObject =
          nextTask as {
            description?: unknown;
          };

        if (
          typeof taskObject.description === "string"
        ) {
          description =
            taskObject.description;
        }
      }

      // Ignore malformed tasks
      if (!description) {
        console.warn(
          "\nSkipping malformed critic task:",
        );

        console.dir(nextTask, {
          depth: null,
        });

        continue;
      }

      const normalizedDescription =
        description.trim();

      if (!normalizedDescription) {
        continue;
      }

      // Avoid duplicate tasks
      if (
        existingDescriptions.has(
          normalizedDescription,
        )
      ) {
        console.log(
          `Skipping duplicate task: ${normalizedDescription}`,
        );

        continue;
      }

      const newTask: ResearchTask = {
        id: `task-${nextTaskNumber}`,
        description: normalizedDescription,
        status: "pending",
      };

      state.tasks.push(newTask);

      existingDescriptions.add(
        normalizedDescription,
      );

      nextTaskNumber++;

      console.log(
        `Added ${newTask.id}: ${newTask.description}`,
      );
    }
  }

  // ============================================================
  // 3. RESEARCH PHASE COMPLETE
  // ============================================================

  console.log("\n==============================");
  console.log("RESEARCH PHASE COMPLETE");
  console.log("==============================");

  console.log(
    `Iterations: ${state.iteration}`,
  );

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
    `Research sufficient: ${
      state.critique?.sufficient ?? false
    }`,
  );

  // ============================================================
  // 4. WRITER
  // ============================================================

  if (state.findings.length === 0) {
    console.warn(
      "\nNo findings available. Writer will not run.",
    );

    return state;
  }

  console.log("\n==============================");
  console.log("WRITER");
  console.log("==============================");

  await writer(state);

  // ============================================================
  // 5. FINAL RESULT
  // ============================================================

  console.log("\n==============================");
  console.log("RESEARCH AGENT COMPLETE");
  console.log("==============================");

  console.log(
    `Final answer generated: ${
      state.finalAnswer !== null
    }`,
  );

  return state;
}