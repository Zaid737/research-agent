export type Source = {
    id: string;
    title: string;
    url: string;
    content: string;
};

export type Finding = {
    claim: string;
    evidence: string;
    sourceId: string;
};

export type ResearchTask = {
    id: string;
    description: string;
    status: "pending" | "completed";
};

export type CriticResult = {
    sufficient: boolean;
    reason: string;
    missingInformation: string[];
    nextTasks: string[];
};

export type ResearchState = {
  query: string;                    //original user request
  tasks: ResearchTask[];            //Planner's output
  currentTaskId: string | null;
  sources: Source[];                //actual sources retrieved through our MCP tools             
  findings: Finding[];
  critique: CriticResult | null;
  iteration: number;
  finalAnswer: string | null;
};

// Sources = raw evidence
// Findings = interpreted evidence

export function createInitialState(query: string): ResearchState {
  return {
    query,
    tasks: [],
    currentTaskId: null,
    sources: [],
    findings: [],
    critique: null,
    iteration: 0,
    finalAnswer: null,
  };
}