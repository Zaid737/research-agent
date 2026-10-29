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
  query: string;
  tasks: ResearchTask[];
  currentTaskId: string | null;
  sources: Source[];
  findings: Finding[];
  critique: CriticResult | null;
  iteration: number;
  finalAnswer: string | null;
};

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