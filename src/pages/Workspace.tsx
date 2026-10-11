import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { upload } from "@vercel/blob/client";
import {
  api,
  ApiError,
  authHeaders,
  streamAnswer,
  type Chat,
  type ChatSummary,
  type Citation,
  type Document,
  type Integrations,
  type Message,
} from "../features/workspace/api";
import MessageView from "../features/workspace/MessageView";
import DocumentPanel from "../features/workspace/DocumentPanel";
import IntegrationsPanel from "../features/workspace/IntegrationsPanel";
import Modal from "../features/workspace/Modal";
import "../features/workspace/workspace.css";
interface Org {
  orgId: string;
  name: string;
  slug: string;
  role: string;
}
interface UploadItem {
  id: string;
  name: string;
  stage: string;
  progress: number;
  error?: string;
  file: File;
  docId?: string;
  replaceId?: string;
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";
const newId = (): string => crypto.randomUUID();
export default function Workspace() {
  const { slug } = useParams<{ slug: string }>();
  return slug ? (
    <WorkspaceView key={slug} slug={slug} />
  ) : (
    <p>Workspace not found.</p>
  );
}
function WorkspaceView({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [org, setOrg] = useState<Org>();
  const [loadError, setLoadError] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState(newId);
  const [title, setTitle] = useState("New conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveConflict, setSaveConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"sources" | "history">("sources");
  const [search, setSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [integrations, setIntegrations] = useState<Integrations>({
    canManage: false,
    driveConfigured: false,
    connections: [],
  });
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [documentPanel, setDocumentPanel] = useState<{
    document?: Document;
    citation?: Citation;
  }>();
  const [showApi, setShowApi] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteChat, setDeleteChat] = useState<ChatSummary>();
  const fileInput = useRef<HTMLInputElement>(null);
  const replacement = useRef<Document | undefined>(undefined);
  const revisions = useRef(new Map<string, number>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const end = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const refreshFiles = useCallback(async () => {
    const result = await api<{ documents: Document[] }>(slug, "documents");
    if (!active.current) return;
    setDocuments(result.documents);
    setSelectedIds((ids) =>
      ids.filter((id) =>
        result.documents.some(
          (doc) => doc.docId === id && doc.status !== "deleting",
        ),
      ),
    );
    setFilesLoading(false);
  }, [slug]);
  const refreshIntegrations = useCallback(async () => {
    const result = await api<Integrations>(slug, "integrations");
    if (active.current) setIntegrations(result);
  }, [slug]);
  const refreshChats = useCallback(async () => {
    const result = await api<{ chats: ChatSummary[] }>(
      slug,
      `chats?search=${encodeURIComponent(chatSearch)}`,
    );
    if (active.current) setChats(result.chats);
  }, [slug, chatSearch]);
  useEffect(() => {
    active.current = true;
    api<{ org: Org }>(slug, "")
      .then((result) => {
        if (active.current) setOrg(result.org);
      })
      .catch((e) => {
        if (active.current) setLoadError(e.message);
      });
    refreshFiles().catch((e) => {
      if (active.current) {
        setNotice(e.message);
        setFilesLoading(false);
      }
    });
    refreshIntegrations().catch((e) => {
      if (active.current) setNotice(e.message);
    });
    const params = new URLSearchParams(window.location.search);
    if (params.has("connected") || params.has("connectionError")) {
      Promise.resolve().then(() => {
        if (active.current) {
          setShowIntegrations(true);
          setNotice(
            params.get("connectionError") ??
              "Google Drive connected. Select Sync now to import your folder.",
          );
        }
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => {
      active.current = false;
    };
  }, [slug, refreshFiles, refreshIntegrations]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ chats: ChatSummary[] }>(
        slug,
        `chats?search=${encodeURIComponent(chatSearch)}`,
      )
        .then((result) => {
          if (!cancelled) setChats(result.chats);
        })
        .catch((e) => {
          if (!cancelled) setNotice(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, chatSearch]);
  useEffect(() => {
    if (
      !uploadBusy &&
      !documents.some((doc) =>
        ["uploading", "extracting", "indexing"].includes(doc.status ?? ""),
      ) &&
      !integrations.connections.some((connection) => connection.syncing)
    )
      return;
    const timer = setInterval(() => {
      refreshFiles().catch(() => {});
      refreshIntegrations().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [uploadBusy, documents, integrations, refreshFiles, refreshIntegrations]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);
  const persist = useCallback(
    (snapshot: Omit<Chat, "revision">): Promise<void> => {
      setSaveState("Saving…");
      setSaveError("");
      setSaveConflict(false);
      const work = saveQueue.current
        .catch(() => {})
        .then(async () => {
          const result = await api<{ revision: number }>(slug, "chats", {
            method: "PUT",
            body: JSON.stringify({
              ...snapshot,
              expectedRevision: revisions.current.get(snapshot.id) ?? 0,
            }),
          });
          revisions.current.set(snapshot.id, result.revision);
          if (active.current) {
            setSaveState("Saved");
            await refreshChats();
          }
        });
      saveQueue.current = work;
      return work.catch((e) => {
        if (active.current) {
          setSaveState("Unsaved changes");
          setSaveError(e.message);
          setSaveConflict(e instanceof ApiError && e.status === 409);
        }
        throw e;
      });
    },
    [slug, refreshChats],
  );
  const saveCurrent = () =>
    messages.length
      ? persist({
          id: chatId,
          title: title.trim() || "Untitled conversation",
          messages,
          docIds: selectedIds,
        })
      : Promise.resolve();
  const saveAsNew = async () => {
    const id = newId();
    const copyTitle = `${(title.trim() || "Untitled conversation").slice(0, 113)} (copy)`;
    try {
      await persist({ id, title: copyTitle, messages, docIds: selectedIds });
      setChatId(id);
      setTitle(copyTitle);
      setSaveConflict(false);
    } catch {
      /* Keep the local version visible if saving fails. */
    }
  };
  const startChat = async () => {
    try {
      await saveCurrent();
      setChatId(newId());
      setMessages([]);
      setTitle("New conversation");
      setBookmarksOnly(false);
      setSaveState("");
      setSaveError("");
      setSidebarOpen(false);
    } catch {
      /* Retain unsaved conversation so the user can retry. */
    }
  };
  const openChat = async (id: string) => {
    try {
      await saveCurrent();
      const result = await api<{ chat: Chat }>(slug, `chats?id=${id}`);
      revisions.current.set(id, result.chat.revision);
      setChatId(id);
      setTitle(result.chat.title);
      setMessages(result.chat.messages);
      setSelectedIds(
        result.chat.docIds.filter((docId) =>
          documents.some(
            (doc) => doc.docId === docId && doc.status !== "deleting",
          ),
        ),
      );
      setBookmarksOnly(false);
      setSaveState("Saved");
      setSaveError("");
      setSidebarOpen(false);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const send = async () => {
    if (!input.trim() || chatLoading) return;
    const question = input.trim();
    setInput("");
    setChatLoading(true);
    setBookmarksOnly(false);
    const sessionTitle = messages.length
      ? title.trim() || "Untitled conversation"
      : title === "New conversation"
        ? question.slice(0, 80)
        : title.trim() || "Untitled conversation";
    setTitle(sessionTitle);
    const user: Message = {
      id: newId(),
      role: "user",
      content: question,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    const history = [...messages, user];
    const answer: Message = {
      id: newId(),
      role: "ai",
      content: "",
      timestamp: user.timestamp,
      citations: [],
    };
    setMessages([...history, { ...answer }]);
    const docIds = selectedIds.filter((id) =>
      documents.some(
        (doc) =>
          doc.docId === id &&
          (doc.version || !doc.status || doc.status === "ready") &&
          doc.status !== "deleting",
      ),
    );
    try {
      await persist({
        id: chatId,
        title: sessionTitle,
        messages: history,
        docIds,
      }).catch(() => {});
      await streamAnswer(
        slug,
        history,
        docIds,
        (token) => {
          answer.content += token;
          if (active.current) setMessages([...history, { ...answer }]);
        },
        (citations) => {
          const all = new Map(
            [...(answer.citations ?? []), ...citations].map((citation) => [
              citation.id,
              citation,
            ]),
          );
          answer.citations = [...all.values()];
          if (active.current) setMessages([...history, { ...answer }]);
        },
      );
    } catch (e) {
      answer.content += `\n\n${errorMessage(e)}`;
    }
    const finalMessages = [...history, { ...answer }];
    if (active.current) {
      setMessages(finalMessages);
      await persist({
        id: chatId,
        title: sessionTitle,
        messages: finalMessages,
        docIds,
      }).catch(() => {});
      setChatLoading(false);
    }
  };
  const bookmark = (id: string) => {
    const next = messages.map((message) =>
      message.id === id
        ? { ...message, bookmarked: !message.bookmarked }
        : message,
    );
    setMessages(next);
    persist({
      id: chatId,
      title: title.trim() || "Untitled conversation",
      messages: next,
      docIds: selectedIds,
    }).catch(() => {});
  };
  const uploadFiles = async (
    files: File[],
    replace?: Document,
    previous?: UploadItem,
  ) => {
    if (uploadBusy) return;
    setUploadBusy(true);
    for (const file of files) {
      const item: UploadItem = {
        id: previous?.id ?? newId(),
        name: file.name,
        file,
        stage: "Uploading",
        progress: 0,
        replaceId: replace?.docId ?? previous?.docId ?? previous?.replaceId,
      };
      const update = (changes: Partial<UploadItem>) => {
        Object.assign(item, changes);
        if (active.current)
          setUploads((items) => [
            ...items.filter((existing) => existing.id !== item.id),
            { ...item },
          ]);
      };
      update({});
      try {
        if (file.size > 100 * 1024 * 1024)
          throw new Error("File exceeds the 100 MB limit");
        const prepared = await api<{
          docId: string;
          uploadId: string;
          pathname: string;
        }>(slug, "documents", {
          method: "POST",
          body: JSON.stringify({
            action: "prepare",
            fileName: file.name,
            ...(item.replaceId ? { replaceId: item.replaceId } : {}),
          }),
        });
        update({ docId: prepared.docId });
        await refreshFiles();
        const blob = await upload(prepared.pathname, file, {
          access: "private",
          handleUploadUrl: `/api/orgs/${encodeURIComponent(slug)}/uploadFile`,
          clientPayload: JSON.stringify({
            docId: prepared.docId,
            uploadId: prepared.uploadId,
          }),
          headers: authHeaders(),
          onUploadProgress: ({ percentage }) =>
            update({ progress: Math.round(percentage) }),
        });
        update({ stage: "Processing", progress: 100 });
        await api(slug, "uploadFile", {
          method: "POST",
          body: JSON.stringify({
            docId: prepared.docId,
            uploadId: prepared.uploadId,
            blobUrl: blob.url,
          }),
        });
        update({ stage: "Ready", progress: 100 });
        await refreshFiles();
      } catch (e) {
        update({ stage: "Failed", error: errorMessage(e) });
        await refreshFiles().catch(() => {});
      }
    }
    if (active.current) setUploadBusy(false);
  };
  const replaceFile = (doc: Document) => {
    replacement.current = doc;
    fileInput.current?.click();
  };
  const filtered = documents.filter((doc) =>
    `${doc.docName} ${doc.collection ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const collections = [
    ...new Set(filtered.map((doc) => doc.collection || "Documents")),
  ].sort();
  const visibleMessages = bookmarksOnly
    ? messages.filter((message) => message.bookmarked)
    : messages;
  if (loadError)
    return (
      <div className="workspace-loading">
        <p className="workspace-error">{loadError}</p>
        <button onClick={() => navigate("/organizations")}>
          Back to organizations
        </button>
      </div>
    );
  if (!org) return <div className="workspace-loading">Loading workspace…</div>;
  return (
    <div className="workspace-shell">
      <input
        aria-label="Upload documents"
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.docx,.md,.txt,.csv,.json,.ts,.tsx,.js,.jsx,.py"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          const replace = replacement.current;
          replacement.current = undefined;
          event.target.value = "";
          if (files.length)
            uploadFiles(replace ? files.slice(0, 1) : files, replace);
        }}
      />
      {sidebarOpen && (
        <button
          className="workspace-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`workspace-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="workspace-brand">
          <button onClick={() => navigate("/organizations")}>← ORAG</button>
          <button
            className="mobile-only"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="workspace-org">
          <span className="eyebrow">Workspace</span>
          <h1>{org.name}</h1>
        </div>
        <div className="workspace-tabs">
          <button
            aria-pressed={tab === "sources"}
            onClick={() => setTab("sources")}
          >
            Sources <span>{documents.length}</span>
          </button>
          <button
            aria-pressed={tab === "history"}
            onClick={() => setTab("history")}
          >
            Chats <span>{chats.length}</span>
          </button>
        </div>
        {tab === "sources" ? (
          <>
            <div className="workspace-sidebar-tools">
              <input
                aria-label="Search documents"
                placeholder="Search files or collections…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                disabled={uploadBusy}
                onClick={() => {
                  replacement.current = undefined;
                  fileInput.current?.click();
                }}
              >
                + Upload files
              </button>
            </div>
            <div className="workspace-source-list">
              {filesLoading ? (
                <p className="muted">Loading documents…</p>
              ) : !documents.length ? (
                <div className="workspace-empty">
                  <p>Your knowledge starts here.</p>
                  <p className="muted">Upload documents or connect a source.</p>
                </div>
              ) : !filtered.length ? (
                <p className="muted">No matching documents.</p>
              ) : (
                collections.map((collection) => (
                  <details key={collection} open>
                    <summary>
                      {collection}
                      <span>
                        {
                          filtered.filter(
                            (doc) =>
                              (doc.collection || "Documents") === collection,
                          ).length
                        }
                      </span>
                    </summary>
                    {filtered
                      .filter(
                        (doc) => (doc.collection || "Documents") === collection,
                      )
                      .map((doc) => {
                        const pending = [
                          "uploading",
                          "extracting",
                          "indexing",
                        ].includes(doc.status ?? "");
                        const ready =
                          doc.status !== "deleting" &&
                          (doc.version ||
                            !doc.status ||
                            doc.status === "ready");
                        return (
                          <div
                            className={`workspace-file ${selectedIds.includes(doc.docId) ? "selected" : ""}`}
                            key={doc.docId}
                          >
                            <label>
                              <input
                                type="checkbox"
                                disabled={!ready || chatLoading}
                                checked={selectedIds.includes(doc.docId)}
                                onChange={() =>
                                  setSelectedIds((ids) =>
                                    ids.includes(doc.docId)
                                      ? ids.filter((id) => id !== doc.docId)
                                      : [...ids, doc.docId],
                                  )
                                }
                              />
                              <span className="workspace-file-label">
                                <span title={doc.docName}>{doc.docName}</span>
                                <small
                                  className={
                                    doc.status === "error" ? "error-text" : ""
                                  }
                                >
                                  {doc.status === "indexing"
                                    ? `Indexing ${doc.progress ?? 0}%`
                                    : pending
                                      ? `${doc.status}…`
                                      : doc.status === "error"
                                        ? "Indexing failed"
                                        : doc.status === "deleting"
                                          ? "Deletion pending"
                                          : `${doc.totalChunks ?? 0} passages`}
                                </small>
                              </span>
                            </label>
                            <button
                              aria-label={`Manage ${doc.docName}`}
                              title="Preview and manage document"
                              onClick={() =>
                                setDocumentPanel({ document: doc })
                              }
                            >
                              ⋯
                            </button>
                          </div>
                        );
                      })}
                  </details>
                ))
              )}
            </div>
            <div className="workspace-source-footer">
              <button
                onClick={() => setSelectedIds([])}
                disabled={!selectedIds.length}
              >
                Clear selection
              </button>
              <button
                onClick={() =>
                  refreshFiles().catch((e) => setNotice(e.message))
                }
              >
                Refresh
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="workspace-sidebar-tools">
              <input
                aria-label="Search conversations"
                placeholder="Search chats and messages…"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
              />
              <button disabled={chatLoading} onClick={startChat}>
                + New conversation
              </button>
            </div>
            <div className="workspace-chat-list">
              {!chats.length && (
                <p className="muted">
                  {chatSearch
                    ? "No matching conversations."
                    : "Conversations are saved as you chat."}
                </p>
              )}
              {chats.map((chat) => (
                <div
                  className={`workspace-chat-row ${chat.id === chatId ? "selected" : ""}`}
                  key={chat.id}
                >
                  <button
                    disabled={chatLoading}
                    onClick={() => openChat(chat.id)}
                  >
                    <span>{chat.title}</span>
                    <small>
                      {chat.messageCount} messages
                      {chat.bookmarkedCount
                        ? ` · ${chat.bookmarkedCount} bookmarks`
                        : ""}
                    </small>
                    <small>
                      {new Date(chat.updatedAt).toLocaleDateString()}
                    </small>
                  </button>
                  <button
                    disabled={chatLoading}
                    aria-label={`Delete ${chat.title}`}
                    onClick={() => setDeleteChat(chat)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="workspace-integration-footer">
          <button onClick={() => setShowIntegrations(true)}>
            Connected sources{" "}
            <span>
              {integrations.connections.length
                ? `${integrations.connections.length} connected`
                : "Connect →"}
            </span>
          </button>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-header">
          <button
            className="mobile-only"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="workspace-title">
            <input
              aria-label="Conversation title"
              maxLength={120}
              value={title}
              disabled={chatLoading}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveCurrent().catch(() => {})}
            />
            <span className="muted" role="status">
              {chatLoading
                ? "Generating answer…"
                : saveState || "Ask about your organization's knowledge"}
            </span>
          </div>
          <div className="workspace-header-actions">
            <button
              aria-pressed={bookmarksOnly}
              onClick={() => setBookmarksOnly((value) => !value)}
            >
              Bookmarks
            </button>
            <button onClick={() => setShowApi(true)}>API</button>
            <button disabled={chatLoading} onClick={startChat}>
              + New chat
            </button>
          </div>
        </header>
        {notice && (
          <div className="workspace-banner" role="status">
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ✕
            </button>
          </div>
        )}
        {saveError && (
          <div className="workspace-banner error-text" role="alert">
            <span>{saveError}</span>
            <button
              disabled={chatLoading || saveState === "Saving…"}
              onClick={() =>
                saveConflict ? saveAsNew() : saveCurrent().catch(() => {})
              }
            >
              {saveConflict ? "Save as new conversation" : "Retry save"}
            </button>
          </div>
        )}
        {uploads.length > 0 && (
          <div className="workspace-upload-queue" aria-live="polite">
            {uploads.map((item) => {
              const doc = documents.find(
                (document) => document.docId === item.docId,
              );
              const stage =
                item.stage === "Processing" && doc?.status
                  ? doc.status === "indexing"
                    ? `Indexing ${doc.progress ?? 0}%`
                    : doc.status
                  : item.stage;
              return (
                <div key={item.id} className="workspace-upload">
                  <span className="upload-name">{item.name}</span>
                  <span>
                    {stage}
                    {item.stage === "Uploading" ? ` ${item.progress}%` : ""}
                  </span>
                  {item.stage === "Uploading" && (
                    <progress
                      max={100}
                      value={item.progress}
                      aria-label={`${item.name} upload progress`}
                    />
                  )}
                  {item.error && (
                    <span className="error-text">{item.error}</span>
                  )}
                  {item.error && (
                    <button
                      disabled={uploadBusy}
                      onClick={() => uploadFiles([item.file], undefined, item)}
                    >
                      Retry upload
                    </button>
                  )}
                  {["Ready", "Failed"].includes(item.stage) && (
                    <button
                      aria-label={`Dismiss ${item.name}`}
                      onClick={() =>
                        setUploads((items) =>
                          items.filter((upload) => upload.id !== item.id),
                        )
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="workspace-messages">
          {!visibleMessages.length && (
            <div className="workspace-chat-empty">
              <span className="workspace-empty-icon">⌘</span>
              <h2>
                {bookmarksOnly
                  ? "No bookmarked messages"
                  : "Answers from your team's knowledge."}
              </h2>
              <p className="muted">
                {bookmarksOnly
                  ? "Bookmark useful messages to find them here."
                  : documents.length
                    ? "Ask a question. Select documents to narrow the context, or search the whole workspace."
                    : "Upload your first document or connect Google Drive or Notion to begin."}
              </p>
              {!bookmarksOnly && (
                <div className="workspace-prompts">
                  {[
                    "Summarize the key points in our documents",
                    "What should a new team member know?",
                    "Compare the selected documents",
                  ].map((prompt) => (
                    <button key={prompt} onClick={() => setInput(prompt)}>
                      {prompt} ↗
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {visibleMessages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              onCitation={(citation) => setDocumentPanel({ citation })}
              onBookmark={() => {
                if (!chatLoading) bookmark(message.id);
              }}
              bookmarkDisabled={chatLoading}
            />
          ))}
          {chatLoading && !messages.at(-1)?.content && (
            <p className="workspace-thinking">Searching your knowledge…</p>
          )}
          <div ref={end} />
        </div>
        <footer className="workspace-composer">
          <div className="workspace-context">
            <span>Context</span>
            {selectedIds.length ? (
              <>
                {documents
                  .filter((doc) => selectedIds.includes(doc.docId))
                  .map((doc) => (
                    <button
                      key={doc.docId}
                      onClick={() =>
                        setSelectedIds((ids) =>
                          ids.filter((id) => id !== doc.docId),
                        )
                      }
                      disabled={chatLoading}
                    >
                      {doc.docName} ×
                    </button>
                  ))}
              </>
            ) : (
              <span>All workspace documents</span>
            )}
          </div>
          <div className="workspace-input">
            <textarea
              aria-label="Ask a question"
              rows={2}
              value={input}
              maxLength={50_000}
              disabled={chatLoading}
              placeholder="Ask anything about your sources…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div>
              <span className="muted">
                Enter to send · Shift + Enter for a new line
              </span>
              <button
                className="primary"
                disabled={chatLoading || !input.trim()}
                onClick={send}
              >
                {chatLoading ? "Thinking…" : "Send →"}
              </button>
            </div>
          </div>
          <p className="workspace-composer-note">
            Check the cited passages when accuracy matters.
          </p>
        </footer>
      </main>
      {documentPanel && (
        <DocumentPanel
          slug={slug}
          {...documentPanel}
          onClose={() => setDocumentPanel(undefined)}
          onChanged={() => refreshFiles().catch((e) => setNotice(e.message))}
          onReplace={replaceFile}
        />
      )}
      {showIntegrations && (
        <IntegrationsPanel
          slug={slug}
          data={integrations}
          onClose={() => setShowIntegrations(false)}
          onChanged={async () => {
            await Promise.all([refreshFiles(), refreshIntegrations()]);
          }}
        />
      )}
      {showApi && (
        <Modal title="API access token" onClose={() => setShowApi(false)}>
          <p className="muted">
            Use your current session token to authenticate requests to this
            organization's MCP endpoint. Keep it private; it expires with your
            session.
          </p>
          <code className="workspace-token">
            {authHeaders().Authorization.slice(7)}
          </code>
          <button
            className="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  authHeaders().Authorization.slice(7),
                );
                setCopied(true);
              } catch {
                setNotice("Could not copy the token");
              }
            }}
          >
            {copied ? "Copied" : "Copy token"}
          </button>
          <p className="muted">MCP endpoint</p>
          <code className="workspace-token">
            {window.location.origin}/api/orgs/{slug}/mcp
          </code>
        </Modal>
      )}
      {deleteChat && (
        <Modal
          title="Delete conversation"
          onClose={() => setDeleteChat(undefined)}
        >
          <p>Delete “{deleteChat.title}” and its bookmarked messages?</p>
          <div className="workspace-actions">
            <button
              className="danger"
              onClick={async () => {
                try {
                  await saveQueue.current.catch(() => {});
                  await api(slug, `chats?id=${deleteChat.id}`, {
                    method: "DELETE",
                  });
                  if (chatId === deleteChat.id) {
                    setMessages([]);
                    setChatId(newId());
                    setTitle("New conversation");
                    setSaveState("");
                    setSaveError("");
                  }
                  setDeleteChat(undefined);
                  await refreshChats();
                } catch (e) {
                  setNotice(errorMessage(e));
                }
              }}
            >
              Delete conversation
            </button>
            <button onClick={() => setDeleteChat(undefined)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
