import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api, type Document, type Citation } from "./api";
interface Passage {
  text: string;
  page?: number;
  chunkIndex: number;
}
export default function DocumentPanel({
  slug,
  document,
  citation,
  onClose,
  onChanged,
  onReplace,
}: {
  slug: string;
  document?: Document;
  citation?: Citation;
  onClose: () => void;
  onChanged: () => void;
  onReplace: (doc: Document) => void;
}) {
  const [data, setData] = useState<{
    document: Document;
    chunks: Passage[];
    legacy: boolean;
  }>();
  const [name, setName] = useState(
    document?.docName ?? citation?.docName ?? "",
  );
  const [collection, setCollection] = useState(document?.collection ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const docId = document?.docId ?? citation!.docId;
  useEffect(() => {
    let active = true;
    api<{ document: Document; chunks: Passage[]; legacy: boolean }>(
      slug,
      `documents?id=${encodeURIComponent(docId)}`,
    )
      .then((result) => {
        if (active) {
          setData(result);
          if (!document) {
            setName(result.document.docName);
            setCollection(result.document.collection ?? "");
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug, docId, document]);
  const mutate = async (method: string, body?: object) => {
    setBusy(true);
    setError("");
    try {
      await api(
        slug,
        method === "DELETE"
          ? `documents?id=${encodeURIComponent(docId)}`
          : "documents",
        { method, ...(body ? { body: JSON.stringify(body) } : {}) },
      );
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };
  const current = data?.document ?? document;
  return (
    <Modal
      title={citation ? "Source passage" : "Manage document"}
      onClose={onClose}
    >
      {citation && (
        <section className="source-evidence">
          <p className="eyebrow">
            {citation.docName} ·{" "}
            {citation.page
              ? `page ${citation.page}`
              : `passage ${citation.chunkIndex + 1}`}
          </p>
          <blockquote>{citation.text}</blockquote>
          <p className="muted">
            This is the passage retrieved when the answer was generated.
            {data && citation.version !== data.document.version
              ? " The document has since changed; the current preview is below."
              : ""}
          </p>
        </section>
      )}
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p className="muted">Loading document…</p>}
      {current && (
        <>
          {current.error && (
            <p className="workspace-error" role="alert">
              {current.error}
            </p>
          )}
          <div className="document-fields">
            <label>
              File name
              <input
                value={name}
                maxLength={240}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Collection
              <input
                placeholder="Documents"
                value={collection}
                maxLength={80}
                onChange={(e) => setCollection(e.target.value)}
              />
            </label>
          </div>
          <div className="document-meta">
            <span>{current.status ?? "ready"}</span>
            <span>{current.totalChunks ?? 0} passages</span>
            {current.sourceProvider && (
              <span>
                Synced from{" "}
                {current.sourceProvider === "drive" ? "Google Drive" : "Notion"}
              </span>
            )}
          </div>
          <div className="workspace-actions">
            <button
              disabled={busy || !name.trim()}
              className="primary"
              onClick={() =>
                mutate("PATCH", { docId, docName: name, collection })
              }
            >
              Save changes
            </button>
            {!current.sourceProvider && (
              <button
                disabled={busy}
                onClick={() => {
                  onReplace(current);
                  onClose();
                }}
              >
                Replace file
              </button>
            )}
            {current.status === "error" && (
              <button
                disabled={busy}
                onClick={() => mutate("POST", { action: "retry", docId })}
              >
                Retry indexing
              </button>
            )}
            <button
              disabled={busy}
              className="danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          </div>
        </>
      )}
      {confirmDelete && (
        <div className="delete-confirmation">
          <p>
            Delete this document and its indexed passages?
            {current?.sourceProvider
              ? " A connected source can import it again on the next sync."
              : ""}
          </p>
          <button
            disabled={busy}
            className="danger"
            onClick={() => mutate("DELETE")}
          >
            Delete document
          </button>
          <button disabled={busy} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      )}
      {data && (
        <section className="document-preview">
          <h3>Document preview</h3>
          {data.legacy ? (
            <p className="muted">
              This document was indexed before previews were available. Replace
              the file to enable a full preview. Saved source passages are still
              shown above.
            </p>
          ) : (
            data.chunks.map((passage) => (
              <div
                className={`preview-passage ${citation && citation.version === data.document.version && citation.chunkIndex === passage.chunkIndex ? "highlighted" : ""}`}
                key={passage.chunkIndex}
              >
                <span className="eyebrow">
                  {passage.page ? `Page ${passage.page} · ` : ""}Passage{" "}
                  {passage.chunkIndex + 1}
                </span>
                <p>{passage.text}</p>
              </div>
            ))
          )}
        </section>
      )}
    </Modal>
  );
}
