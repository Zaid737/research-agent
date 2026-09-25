import axios from "axios";
import * as cheerio from "cheerio";

export type PageContent = {
  title: string;
  url: string;
  text: string;
};

export async function fetchPage(
  url: string
): Promise<PageContent> {
  console.error(`Fetching page: ${url}`);

  const response = await axios.get<string>(url, {
    timeout: 15000,
    headers: {
      "User-Agent": "research-agent/1.0",
    },
  });

  const $ = cheerio.load(response.data);

  $("script, style, nav, footer, header, noscript").remove();

  const pageTitle = $("title").text().trim();

  const title =
    pageTitle.length > 0
      ? pageTitle
      : $("h1").first().text().trim() || url;

  const text = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    url,
    text: text.slice(0, 20000),
  };
}