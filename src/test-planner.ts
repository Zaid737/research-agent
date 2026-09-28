import "dotenv/config";
import { planner } from "./agent/planner.ts";
import { createInitialState } from "./state/research-state.ts";

async function main() {
  const state = createInitialState(
    "What are the latest developments in the Model Context Protocol and how is it being used for AI agents?"
  );

  console.log("BEFORE PLANNER:");
  console.dir(state, { depth: null });

  await planner(state);

  console.log("\nAFTER PLANNER:");
  console.dir(state, { depth: null });
}

main().catch(console.error);