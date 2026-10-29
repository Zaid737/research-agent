# Research Agent

Research Agent turns a topic into a structured report with linked sources. It uses an LLM-powered Planner, Researcher, Critic, and Writer, with web search and page fetching exposed through an MCP server.

## Requirements

- Node.js 20.19 or later, or 22.12 or later
- An OpenAI API key
- A Tavily API key

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and add your API keys:

   ```text
   OPENAI_API_KEY=...
   TAVILY_API_KEY=...
   ```

3. Start the API and frontend in separate terminals:

   ```sh
   npm run dev:api
   ```

   ```sh
   npm run dev
   ```

4. Open <http://127.0.0.1:5173>.

The frontend proxies `/api` requests to the local backend on port `3001`. Set `PORT` in `.env` to change the backend port.

## API

`POST /api/research`

```json
{
  "topic": "Latest developments in Model Context Protocol"
}
```

The response contains a `status` (`completed` or `incomplete`), the topic, a Markdown `report`, and source titles and URLs.

## Project checks

```sh
npm run check
npm run build
```
