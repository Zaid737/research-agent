export type ResearchRequest = {
  topic: string;
};

export type ResearchSource = {
  id: string;
  title: string;
  url: string;
};

export type ResearchResponse = {
  status: "completed" | "incomplete";
  topic: string;
  report: string;
  sources: ResearchSource[];
};

export type ResearchErrorResponse = {
  error: string;
};
