import type {
  ResearchErrorResponse,
  ResearchRequest,
  ResearchResponse,
} from "../shared/api";

function isResearchResponse(value: unknown): value is ResearchResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    (response.status === "completed" || response.status === "incomplete") &&
    typeof response.topic === "string" &&
    typeof response.report === "string" &&
    Array.isArray(response.sources) &&
    response.sources.every(
      (source: unknown) =>
        typeof source === "object" &&
        source !== null &&
        "id" in source &&
        typeof source.id === "string" &&
        "title" in source &&
        typeof source.title === "string" &&
        "url" in source &&
        typeof source.url === "string" &&
        isWebUrl(source.url),
    )
  );
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isErrorResponse(value: unknown): value is ResearchErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  );
}

export async function researchTopic(
  topic: string,
): Promise<ResearchResponse> {
  const request: ResearchRequest = { topic };
  const response = await fetch("/api/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      isErrorResponse(body)
        ? body.error
        : "The research request failed. Please try again.",
    );
  }

  if (!isResearchResponse(body)) {
    throw new Error("The server returned an unexpected research response.");
  }

  return body;
}
