import "dotenv/config";

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  ResearchErrorResponse,
  ResearchResponse,
} from "../../shared/api.ts";
import { runResearchAgent } from "../agent/index.ts";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_REQUEST_SIZE = 16_384;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: ResearchResponse | ResearchErrorResponse,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;

    if (size > MAX_REQUEST_SIZE) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function handleResearch(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    const isTooLarge =
      error instanceof Error &&
      error.message === "Request body is too large.";
    sendJson(response, isTooLarge ? 413 : 400, {
      error: isTooLarge ? error.message : "Request body must be valid JSON.",
    });
    return;
  }

  const topic =
    typeof body === "object" &&
    body !== null &&
    "topic" in body &&
    typeof body.topic === "string"
      ? body.topic.trim()
      : "";

  if (!topic) {
    sendJson(response, 400, {
      error: "Enter a research topic.",
    });
    return;
  }

  try {
    const state = await runResearchAgent(topic);
    const result: ResearchResponse = {
      status:
        state.critique?.sufficient === true &&
        state.finalAnswer !== null
          ? "completed"
          : "incomplete",
      topic,
      report:
        state.finalAnswer ??
        "The research did not produce enough verified findings to generate a report.",
      sources: state.sources.map(({ id, title, url }) => ({
        id,
        title,
        url,
      })),
    };

    sendJson(response, 200, result);
  } catch (error) {
    console.error("Research request failed:", error);
    sendJson(response, 500, {
      error:
        "Research failed. Check the backend configuration and logs, then try again.",
    });
  }
}

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/api/research") {
    sendJson(response, 404, { error: "Endpoint not found." });
    return;
  }

  void handleResearch(request, response);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Research API listening on http://127.0.0.1:${PORT}`);
});
