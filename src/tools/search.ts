import axios from "axios";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type TavilyResponse = {
  results: Array<{
    title: string;
    url: string;
    content: string;
  }>;
};

export async function searchWeb(
  query: string
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  console.error(`Searching web for: ${query}`);

  try {
    const response = await axios.post<TavilyResponse>(
      "https://api.tavily.com/search",
      {
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return response.data.results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
    }));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown search error";

    throw new Error(`Web search failed: ${message}`);
  }
}