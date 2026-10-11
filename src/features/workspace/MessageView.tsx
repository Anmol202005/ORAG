import { useState, type ReactNode } from "react";
import type { Message, Citation } from "./api";
function formatted(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}
export default function MessageView({
  message,
  onCitation,
  onBookmark,
  bookmarkDisabled,
}: {
  message: Message;
  onCitation: (citation: Citation) => void;
  onBookmark: () => void;
  bookmarkDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const citations = message.citations ?? [];
  const parts = message.content.split(/(\[\[cite:[^\]]+\]\])/g);
  const cited = new Set(
    parts.filter((p) => p.startsWith("[[cite:")).map((p) => p.slice(7, -2)),
  );
  const supporting = citations.filter((c) => cited.has(c.id));
  return (
    <article className={`workspace-message ${message.role}`}>
      <div className="workspace-message-meta">
        <span>{message.role === "user" ? "You" : "ORAG"}</span>
        <time>{message.timestamp}</time>
        {message.bookmarked && <span>Bookmarked</span>}
      </div>
      <div className="workspace-message-body">
        {parts.map((part, i) => {
          if (part.startsWith("[[cite:")) {
            const citation = citations.find((c) => c.id === part.slice(7, -2));
            return citation ? (
              <button
                key={i}
                className="citation-inline"
                title={`${citation.docName}${citation.page ? `, page ${citation.page}` : ""}`}
                onClick={() => onCitation(citation)}
              >
                [{citations.indexOf(citation) + 1}]
              </button>
            ) : (
              <span key={i} className="muted">
                [source unavailable]
              </span>
            );
          }
          return <span key={i}>{formatted(part)}</span>;
        })}
      </div>
      {message.role === "ai" && supporting.length > 0 && (
        <div className="citation-list">
          {supporting.map((citation) => (
            <button key={citation.id} onClick={() => onCitation(citation)}>
              {citation.docName}
              {citation.page
                ? ` · p. ${citation.page}`
                : ` · passage ${citation.chunkIndex + 1}`}
            </button>
          ))}
        </div>
      )}
      {message.role === "ai" && !supporting.length && citations.length > 0 && (
        <details className="retrieved-passages">
          <summary>{citations.length} retrieved passages</summary>
          <div className="citation-list">
            {citations.map((citation) => (
              <button key={citation.id} onClick={() => onCitation(citation)}>
                {citation.docName} · passage {citation.chunkIndex + 1}
              </button>
            ))}
          </div>
        </details>
      )}
      <div className="workspace-message-actions">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          disabled={bookmarkDisabled}
          onClick={onBookmark}
          aria-pressed={!!message.bookmarked}
        >
          {message.bookmarked ? "Remove bookmark" : "Bookmark"}
        </button>
      </div>
    </article>
  );
}
