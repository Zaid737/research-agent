import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";

import type { ResearchResponse } from "../shared/api";
import { researchTopic } from "./api";

export function App() {
  const [topic, setTopic] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTopic = topic.trim();

    if (!trimmedTopic) {
      setError("Enter a research topic to get started.");
      return;
    }

    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      setResult(await researchTopic(trimmedTopic));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong while researching. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function startAnotherResearch() {
    setTopic("");
    setResult(null);
    setError(null);
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            startAnotherResearch();
          }}
          aria-label="Research Agent home"
        >
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>Research Agent</span>
        </a>
        <span className="header-note">Thoughtful research, made simple</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">YOUR RESEARCH STARTS HERE</p>
        <h1 id="page-title">Curiosity, meet clarity.</h1>
        <p className="intro-copy">
          Turn any topic into a researched, structured report.
        </p>
      </section>

      <form className="research-form" onSubmit={handleSubmit}>
        <label htmlFor="topic">What would you like to research?</label>
        <textarea
          id="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="e.g. Latest developments in Model Context Protocol"
          rows={3}
          disabled={isLoading}
          maxLength={2000}
          aria-describedby={error ? "form-error" : undefined}
        />
        <div className="form-footer">
          <span className="input-hint">A topic is all you need.</span>
          <button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Researching
              </>
            ) : (
              <>
                Start Research
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="error-message" id="form-error" role="alert">
            <span aria-hidden="true">!</span>
            {error}
          </p>
        )}
      </form>

      {isLoading && (
        <section className="loading-panel" role="status" aria-live="polite">
          <span className="loading-orbit" aria-hidden="true" />
          <div>
            <h2>Research in progress</h2>
            <p>
              Researching your topic. The agent is planning, gathering
              information, and evaluating its findings…
            </p>
          </div>
        </section>
      )}

      {result && (
        <section className="report-card" aria-labelledby="report-title">
          <div className="report-heading">
            <div>
              <p className="eyebrow">RESEARCH REPORT</p>
              <h2 id="report-title">{result.topic}</h2>
            </div>
            <span
              className={`status-badge ${result.status}`}
              role="status"
            >
              <span className="status-dot" aria-hidden="true" />
              {result.status === "completed" ? "Research complete" : "Incomplete"}
            </span>
          </div>

          {result.status === "incomplete" && (
            <p className="incomplete-note">
              This report may not cover every aspect of the topic. Some
              information could not be fully verified.
            </p>
          )}

          <article className="markdown-body">
            <ReactMarkdown
              components={{
                a: ({ href, children, ...props }) => (
                  <a
                    {...props}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {result.report}
            </ReactMarkdown>
          </article>

          <div className="sources-section">
            <div className="sources-heading">
              <div>
                <p className="eyebrow">EXPLORE FURTHER</p>
                <h3>Sources</h3>
              </div>
              <span className="source-count">
                {result.sources.length}{" "}
                {result.sources.length === 1 ? "source" : "sources"}
              </span>
            </div>
            {result.sources.length > 0 ? (
              <ol className="source-list">
                {result.sources.map((source, index) => (
                  <li key={source.id}>
                    <span className="source-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{source.title || source.url}</span>
                      <span className="source-url">{source.url}</span>
                    </a>
                    <span className="source-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="no-sources">No sources were returned.</p>
            )}
          </div>

          <button
            className="another-button"
            type="button"
            onClick={startAnotherResearch}
          >
            Start another research topic <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      {!result && !isLoading && (
        <p className="privacy-note">
          Your agent will plan the research and gather sources for you.
        </p>
      )}

      <footer className="page-footer">
        <span>Research Agent</span>
        <span>From topic to understanding.</span>
      </footer>
    </main>
  );
}
