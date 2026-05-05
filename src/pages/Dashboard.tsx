import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────
interface FileNode {
  id: string;
  type: "file" | "folder";
  name: string;
  checked: boolean;
  open?: boolean;
  children?: FileNode[];
  ext?: string;
  url?: string;
  size?: number;
}

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
  sources?: string[];
}

interface Artifact {
  id: string;
  type: "Summary" | "Flashcards" | "Mind Map" | "Report";
  title: string;
  timestamp: string;
}

// ── API helpers ────────────────────────────────────────────────

async function apiFetchFiles(): Promise<FileNode[]> {
  const res = await fetch("/api/files");
  if (!res.ok) throw new Error(`/api/files ${res.status}`);
  const data = await res.json();

  const { files = [], folders = [] } = data;

  const folderMap: Record<string, FileNode> = {};
  folders.forEach((f: { id: string; name: string }) => {
    folderMap[f.id] = {
      id: f.id,
      type: "folder",
      name: f.name,
      checked: false,
      open: true,
      children: [],
    };
  });

  const orphans: FileNode[] = [];
  files.forEach(
    (f: { id: string; name: string; ext: string; folderId?: string; url?: string; size?: number }) => {
      const node: FileNode = {
        id: f.id,
        type: "file",
        name: f.name,
        ext: f.ext,
        checked: false,
        url: f.url,
        size: f.size,
      };
      if (f.folderId && folderMap[f.folderId]) {
        folderMap[f.folderId].children!.push(node);
      } else {
        orphans.push(node);
      }
    }
  );

  const result = Object.values(folderMap);
  if (orphans.length) {
    result.push({
      id: "__uploads__",
      type: "folder",
      name: "Uploads",
      checked: false,
      open: true,
      children: orphans,
    });
  }
  return result;
}

async function apiUploadFile(file: File): Promise<FileNode> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`/api/upload ${res.status}`);
  const data = await res.json();
  return {
    id: data.id,
    type: "file",
    name: data.name ?? file.name,
    ext: data.ext ?? file.name.split(".").pop(),
    checked: false,
    url: data.url,
  };
}

type AgentMessage = { role: "user" | "assistant" | "system"; content: string };

function buildSystemMessage(fileNames: string[], webSearch: boolean): string {
  const parts: string[] = [];
  if (fileNames.length) {
    parts.push(`The user has the following files in context: ${fileNames.join(", ")}.`);
  }
  if (webSearch) {
    parts.push("You may search the web to supplement your answer.");
  }
  return parts.join(" ");
}

async function apiChatStream(
  messages: AgentMessage[],
  onToken: (token: string) => void
): Promise<string> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`/api/agent ${res.status}${text ? `: ${text}` : ""}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from /api/agent");

  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === "token" && typeof evt.content === "string") {
          full += evt.content;
          onToken(evt.content);
        }
      } catch {
        // skip
      }
    }
  }

  return full;
}

const ARTIFACTS_KEY = "workspace_artifacts";

function stubLoadArtifacts(): Artifact[] {
  try {
    return JSON.parse(localStorage.getItem(ARTIFACTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function stubSaveArtifact(a: Artifact) {
  const list = stubLoadArtifacts();
  list.unshift(a);
  localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(list.slice(0, 50)));
}

function stubDeleteArtifact(id: string) {
  const list = stubLoadArtifacts().filter((a) => a.id !== id);
  localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(list));
}

// ── Helpers ────────────────────────────────────────────────────
function nowStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function renderContent(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/90 font-normal">$1</strong>')
    .replace(
      /`(.*?)`/g,
      '<code class="font-mono text-[10.5px] bg-white/[0.12] border border-white/[0.18] rounded px-1.5 py-0.5 text-white/80">$1</code>'
    )
    .replace(
      /^• (.+)$/gm,
      '<div class="flex gap-2 my-1"><span class="text-white/45 mt-0.5 flex-shrink-0">·</span><span>$1</span></div>'
    )
    .split("\n\n")
    .map((p) => `<p class="mb-2 last:mb-0">${p}</p>`)
    .join("");
}

// ── SVG Icons ──────────────────────────────────────────────────
const Icon = {
  folder: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
      <path d="M1 3.5h4.5l1.5 1.5H13v7H1z" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
      <path d="M2.5 1.5h7l3 3v8h-10z" />
      <polyline points="9.5,1.5 9.5,4.5 12.5,4.5" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2" className="w-2 h-2">
      <polyline points="2,1 6,4 2,7" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2 h-2">
      <polyline points="1.5,4 3.5,6.5 6.5,1.5" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <line x1="6" y1="2" x2="6" y2="10" />
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <path d="M2 8v2h8V8" />
      <polyline points="4,4 6,2 8,4" />
      <line x1="6" y1="2" x2="6" y2="8" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5">
      <circle cx="5" cy="5" r="3.5" />
      <line x1="7.5" y1="7.5" x2="10.5" y2="10.5" />
    </svg>
  ),
  save: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <path d="M2 1h6l2 2v8H2z" />
      <rect x="4" y="7" width="4" height="3.5" />
      <rect x="3.5" y="1" width="4" height="2.5" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <path d="M2 8V2h6" />
    </svg>
  ),
  web: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <circle cx="6" cy="6" r="4.5" />
      <path d="M1.5 6h9M6 1.5c-1.5 1.5-2 3-2 4.5s.5 3 2 4.5M6 1.5c1.5 1.5 2 3 2 4.5s-.5 3-2 4.5" />
    </svg>
  ),
  drive: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <polygon points="6,1 11,10 1,10" />
    </svg>
  ),
  summary: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
      <line x1="4" y1="5" x2="10" y2="5" />
      <line x1="4" y1="7" x2="8" y2="7" />
      <line x1="4" y1="9" x2="9" y2="9" />
    </svg>
  ),
  flash: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="1.5" y="3.5" width="11" height="8" rx="1.5" />
      <line x1="7" y1="3.5" x2="7" y2="11.5" />
    </svg>
  ),
  mindmap: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <circle cx="7" cy="7" r="1.5" />
      <line x1="7" y1="5.5" x2="7" y2="2" />
      <line x1="7" y1="8.5" x2="7" y2="12" />
      <line x1="5.5" y1="7" x2="2" y2="7" />
      <line x1="8.5" y1="7" x2="12" y2="7" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M2.5 1.5h7l2 2v9h-9z" />
      <line x1="5" y1="6" x2="9.5" y2="6" />
      <line x1="5" y1="8" x2="8" y2="8" />
      <line x1="5" y1="10" x2="9" y2="10" />
    </svg>
  ),
  spinner: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 animate-spin">
      <circle cx="7" cy="7" r="5.5" strokeDasharray="12 22" strokeLinecap="round" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <path d="M2 3h8M5 3V2h2v1M4 3l.5 7h3l.5-7" />
    </svg>
  ),
};

// ── Artifact color maps ────────────────────────────────────────
const artifactColors: Record<Artifact["type"], string> = {
  Summary: "text-blue-300 border-blue-400/30 bg-blue-400/[0.10]",
  Flashcards: "text-green-300 border-green-400/30 bg-green-400/[0.10]",
  "Mind Map": "text-amber-300 border-amber-400/30 bg-amber-400/[0.10]",
  Report: "text-purple-300 border-purple-400/30 bg-purple-400/[0.10]",
};

const artifactDots: Record<Artifact["type"], string> = {
  Summary: "bg-blue-300/80",
  Flashcards: "bg-green-400/80",
  "Mind Map": "bg-amber-300/80",
  Report: "bg-purple-300/80",
};

// ── Sub-components ─────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-3 h-3 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-all duration-150
        ${checked
          ? "bg-white border border-transparent text-black"
          : "border border-white/40 bg-transparent text-transparent hover:border-white/60"
        }`}
    >
      {Icon.check}
    </button>
  );
}

function TreeNode({
  node,
  depth = 0,
  onToggleCheck,
  onToggleFolder,
}: {
  node: FileNode;
  depth?: number;
  onToggleCheck: (id: string) => void;
  onToggleFolder: (id: string) => void;
}) {
  const pl = depth * 12;

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.id)}
          style={{ paddingLeft: 12 + pl }}
          className="w-full flex items-center gap-2 py-[5px] pr-3 text-left hover:bg-white/[0.07] transition-colors duration-150 group"
        >
          <span className={`transition-transform duration-150 text-white/50 ${node.open ? "rotate-90" : ""}`}>
            {Icon.chevron}
          </span>
          <span className="text-white/55 group-hover:text-white/75 transition-colors">{Icon.folder}</span>
          <span className="font-mono text-[10px] text-white/70 group-hover:text-white/90 transition-colors flex-1 truncate">
            {node.name}
          </span>
          <span className="font-mono text-[9px] text-white/40">{node.children?.length}</span>
        </button>

        <AnimatePresence initial={false}>
          {node.open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              {node.children?.map((child) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onToggleCheck={onToggleCheck}
                  onToggleFolder={onToggleFolder}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      style={{ paddingLeft: 12 + pl }}
      className={`flex items-center gap-2 py-[5px] pr-3 cursor-pointer transition-colors duration-150 relative
        ${node.checked ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"}`}
      onClick={() => onToggleCheck(node.id)}
    >
      {node.checked && (
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-white rounded-r-full" />
      )}
      <span className="w-[10px] flex-shrink-0" />
      <span className={`${node.checked ? "text-white/80" : "text-white/45"} transition-colors`}>
        {Icon.file}
      </span>
      <span
        className={`font-mono text-[10px] flex-1 truncate transition-colors ${
          node.checked ? "text-white/90" : "text-white/60"
        }`}
      >
        {node.name}
      </span>
      <Checkbox checked={node.checked} onChange={() => onToggleCheck(node.id)} />
    </div>
  );
}

function MessageBubble({
  msg,
  onSave,
}: {
  msg: Message;
  onSave: (title: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="font-mono text-[9px] tracking-widest uppercase text-white/55">
          {msg.role === "user" ? "You" : "AI"}
        </span>
        <span className="font-mono text-[9px] text-white/30">·</span>
        <span className="font-mono text-[9px] text-white/40">{msg.timestamp}</span>
        {msg.sources && (
          <>
            <span className="font-mono text-[9px] text-white/30">·</span>
            <span className="font-mono text-[9px] text-white/40">{msg.sources.length} sources</span>
          </>
        )}
      </div>

      <div
        className={`rounded-lg border px-4 py-3 text-[13px] font-light leading-relaxed text-white/90
          ${msg.role === "user"
            ? "bg-white/[0.08] border-white/[0.18] ml-6"
            : "bg-white/[0.04] border-white/[0.12]"
          }`}
        dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
      />

      {msg.sources && (
        <div className="flex gap-1.5 px-1 flex-wrap">
          {msg.sources.map((s) => (
            <span
              key={s}
              className="font-mono text-[9px] text-white/55 border border-white/[0.18] bg-white/[0.06] rounded px-2 py-0.5"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="flex gap-1.5 px-1"
          >
            {msg.role === "ai" && (
              <button
                onClick={() => onSave(msg.content.slice(0, 32) + "…")}
                className="font-mono text-[9px] tracking-widest uppercase text-white/55
                  border border-white/[0.20] bg-transparent px-2.5 py-1 rounded
                  hover:text-white/85 hover:border-white/35 transition-all duration-150"
              >
                Save
              </button>
            )}
            <button
              onClick={handleCopy}
              className="font-mono text-[9px] tracking-widest uppercase text-white/55
                border border-white/[0.20] bg-transparent px-2.5 py-1 rounded
                hover:text-white/85 hover:border-white/35 transition-all duration-150"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {msg.role === "user" && (
              <button className="font-mono text-[9px] tracking-widest uppercase text-white/55
                border border-white/[0.20] bg-transparent px-2.5 py-1 rounded
                hover:text-white/85 hover:border-white/35 transition-all duration-150">
                Edit
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function Workspace() {
  const [sources, setSources] = useState<FileNode[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [driveConnected] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFilesLoading(true);
    apiFetchFiles()
      .then((tree) => {
        setSources(tree);
        setFilesError(null);
      })
      .catch((e) => setFilesError(e.message))
      .finally(() => setFilesLoading(false));
  }, []);

  useEffect(() => {
    setArtifacts(stubLoadArtifacts());
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  const flattenNodes = useCallback(
    (nodes: FileNode[]): FileNode[] =>
      nodes.flatMap((n) => [n, ...(n.children ? flattenNodes(n.children) : [])]),
    []
  );

  const toggleCheck = (id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) =>
        n.id === id
          ? { ...n, checked: !n.checked }
          : n.children
          ? { ...n, children: toggle(n.children) }
          : n
      );
    setSources((prev) => toggle(prev));
  };

  const toggleFolder = (id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) =>
        n.id === id
          ? { ...n, open: !n.open }
          : n.children
          ? { ...n, children: toggle(n.children) }
          : n
      );
    setSources((prev) => toggle(prev));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const newNode = await apiUploadFile(file);
      setSources((prev) => {
        const updated = [...prev];
        const firstFolder = updated.find((n) => n.type === "folder");
        if (firstFolder) {
          firstFolder.children = [...(firstFolder.children ?? []), newNode];
          firstFolder.open = true;
        } else {
          updated.push(newNode);
        }
        return updated;
      });
    } catch (err: unknown) {
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  const activeContextFiles = flattenNodes(sources).filter(
    (n) => n.type === "file" && n.checked
  );
  const activeContextNames = activeContextFiles.map((n) => n.name);

  const sendMessage = async () => {
    const val = input.trim();
    if (!val || chatLoading) return;
    setInput("");

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: val,
      timestamp: nowStr(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const agentMessages: AgentMessage[] = [];

      const systemContent = buildSystemMessage(activeContextNames, webSearch);
      if (systemContent) {
        agentMessages.push({ role: "system", content: systemContent });
      }

      messages.forEach((m) => {
        agentMessages.push({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.content,
        });
      });

      agentMessages.push({ role: "user", content: val });

      const aiId = uid();
      const aiMsg: Message = {
        id: aiId,
        role: "ai",
        content: "",
        timestamp: nowStr(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setChatLoading(false);

      await apiChatStream(agentMessages, (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, content: m.content + token } : m
          )
        );
      });
    } catch (err: unknown) {
      const errMsg: Message = {
        id: uid(),
        role: "ai",
        content: `⚠ Request failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: nowStr(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const saveArtifact = (type: Artifact["type"], title: string) => {
    const a: Artifact = { id: uid(), type, title, timestamp: nowStr() };
    stubSaveArtifact(a);
    setArtifacts((prev) => [a, ...prev]);
  };

  const deleteArtifact = (id: string) => {
    stubDeleteArtifact(id);
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
  };

  const runTool = (type: Artifact["type"]) => {
    const titleMap: Record<Artifact["type"], string> = {
      Summary: "Key themes · AI session",
      Flashcards: `Flashcards · ${messages.length} msgs`,
      "Mind Map": "Concept map · workspace",
      Report: "Full report · session",
    };
    saveArtifact(type, titleMap[type]);
  };

  const filteredSources = searchQ
    ? sources
        .map((n) => ({
          ...n,
          open: true,
          children: n.children?.filter((c) =>
            c.name.toLowerCase().includes(searchQ.toLowerCase())
          ),
        }))
        .filter(
          (n) =>
            n.name.toLowerCase().includes(searchQ.toLowerCase()) ||
            (n.children && n.children.length > 0)
        )
    : sources;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div
      className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.md,.txt,.docx,.csv"
        onChange={handleFileChange}
      />

      {/* ══════════════════════════════════════════
          LEFT SIDEBAR — Sources
      ══════════════════════════════════════════ */}
      <aside className="w-[240px] flex-shrink-0 border-r border-white/[0.14] flex flex-col bg-[#111111] overflow-hidden">

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.14] flex-shrink-0"
        >
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/60">Sources</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadLoading}
              title="Upload file"
              className="w-[22px] h-[22px] flex items-center justify-center rounded border border-white/[0.22]
                bg-transparent text-white/55 hover:text-white/85 hover:border-white/40 hover:bg-white/[0.08]
                transition-all duration-150 disabled:opacity-40"
            >
              {uploadLoading ? Icon.spinner : Icon.upload}
            </button>
          </div>
        </motion.div>

        {/* Search */}
        <div className="mx-3 my-2.5 flex items-center gap-2 bg-white/[0.06] border border-white/[0.16] rounded-md px-3 py-1.5 flex-shrink-0">
          <span className="text-white/50">{Icon.search}</span>
          <input
            type="text"
            placeholder="Search sources…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none font-mono text-[10px]
              text-white/80 placeholder-white/35 caret-white/70"
          />
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto">
          <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/40 px-3 pt-1 pb-1">
            Files
          </p>

          {filesLoading && (
            <div className="flex items-center gap-2 px-3 py-4 text-white/45">
              {Icon.spinner}
              <span className="font-mono text-[9px]">Loading files…</span>
            </div>
          )}

          {filesError && (
            <div className="mx-3 my-2 rounded-md border border-red-400/35 bg-red-400/[0.10] px-3 py-2">
              <p className="font-mono text-[9px] text-red-300/90">Failed to load files</p>
              <p className="font-mono text-[8px] text-red-300/60 mt-0.5">{filesError}</p>
              <button
                onClick={() => {
                  setFilesError(null);
                  setFilesLoading(true);
                  apiFetchFiles()
                    .then(setSources)
                    .catch((e) => setFilesError(e.message))
                    .finally(() => setFilesLoading(false));
                }}
                className="mt-1.5 font-mono text-[9px] text-red-300/70 hover:text-red-300 underline"
              >
                Retry
              </button>
            </div>
          )}

          {!filesLoading && !filesError && filteredSources.length === 0 && (
            <p className="font-mono text-[9px] text-white/35 italic px-3 py-2">
              No files yet — upload one above
            </p>
          )}

          <AnimatePresence>
            {filteredSources.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                onToggleCheck={toggleCheck}
                onToggleFolder={toggleFolder}
              />
            ))}
          </AnimatePresence>

          {/* Web search toggle */}
          <div className="mt-3 mb-1">
            <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/40 px-3 pb-1">
              Quick Sources
            </p>
            <div
              className={`flex items-center gap-2 py-[5px] px-3 cursor-pointer transition-colors duration-150 relative
                ${webSearch ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"}`}
              onClick={() => setWebSearch((v) => !v)}
            >
              {webSearch && (
                <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-white rounded-r-full" />
              )}
              <span className={`${webSearch ? "text-white/80" : "text-white/45"} transition-colors`}>
                {Icon.web}
              </span>
              <span className={`font-mono text-[10px] flex-1 ${webSearch ? "text-white/90" : "text-white/60"}`}>
                Web Search
              </span>
              <Checkbox checked={webSearch} onChange={() => setWebSearch((v) => !v)} />
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="border-t border-white/[0.14] p-3 flex-shrink-0 space-y-2">
          <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/40 mb-2">
            Integrations
          </p>
          <button
            className="w-full flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.14]
              rounded-md px-3 py-2 hover:bg-white/[0.08] hover:border-white/[0.22] transition-all duration-150 opacity-50 cursor-not-allowed"
            title="Google Drive integration coming soon"
          >
            <span className="text-white/50">{Icon.drive}</span>
            <span className="font-mono text-[9.5px] text-white/60">Google Drive</span>
            <span className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${driveConnected ? "bg-green-400/80" : "bg-white/25"}`} />
          </button>
          <button
            className="w-full flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.14]
              rounded-md px-3 py-2 hover:bg-white/[0.08] hover:border-white/[0.22] transition-all duration-150 opacity-50 cursor-not-allowed"
            title="Notion integration coming soon"
          >
            <span className="text-white/50">{Icon.web}</span>
            <span className="font-mono text-[9.5px] text-white/60">Notion</span>
            <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 bg-white/25" />
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          CENTER — Chat
      ══════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.14] flex-shrink-0"
        >
          <div className="flex items-center gap-3">
            <p className="text-[15px] font-light text-white/95">Research Session</p>
            <span className="font-mono text-[9px] text-white/45">· {messages.length} messages</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => { setMessages([]); }}
              className="w-[22px] h-[22px] flex items-center justify-center rounded border border-white/[0.22]
                bg-transparent text-white/55 hover:text-white/85 hover:border-white/40 hover:bg-white/[0.08] transition-all duration-150"
              title="New chat"
            >
              {Icon.plus}
            </button>
          </div>
        </motion.div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
          {messages.length === 0 && !chatLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-3 text-center"
            >
              <p className="text-white/40 text-[13px] font-light">
                Select sources on the left, then ask anything.
              </p>
              <p className="font-mono text-[9px] text-white/25">
                {activeContextNames.length} file{activeContextNames.length !== 1 ? "s" : ""} in context
                {webSearch ? " · web search on" : ""}
              </p>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onSave={(title) => saveArtifact("Summary", title)}
              />
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {chatLoading && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[9px] tracking-widest uppercase text-white/55">AI</span>
                  <span className="font-mono text-[9px] text-white/30">·</span>
                  <span className="font-mono text-[9px] text-white/40">thinking…</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.12] rounded-lg px-4 py-3 w-fit">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[5px] h-[5px] rounded-full bg-white/45"
                      style={{ animation: `pulse 1.2s ease ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={chatEndRef} />
        </div>

        {/* Context bar */}
        <div className="border-t border-white/[0.14] px-5 py-2 flex items-center gap-2 flex-wrap flex-shrink-0">
          <span className="font-mono text-[8.5px] uppercase tracking-widest text-white/40">
            Context:
          </span>
          <AnimatePresence>
            {activeContextNames.map((s) => (
              <motion.span
                key={s}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="font-mono text-[9px] text-white/65 border border-white/[0.18] bg-white/[0.06] rounded px-2 py-0.5"
              >
                {s}
              </motion.span>
            ))}
            {webSearch && (
              <motion.span
                key="web"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="font-mono text-[9px] text-white/65 border border-white/[0.18] bg-white/[0.06] rounded px-2 py-0.5"
              >
                Web Search
              </motion.span>
            )}
            {activeContextNames.length === 0 && !webSearch && (
              <span className="font-mono text-[9px] text-white/30 italic">No sources selected</span>
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="border-t border-white/[0.14] px-5 py-4 flex-shrink-0">
          <div className="border border-white/[0.18] rounded-lg bg-white/[0.04] focus-within:border-white/[0.35] transition-colors duration-150">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your sources…"
              disabled={chatLoading}
              className="w-full bg-transparent border-none outline-none resize-none
                font-light text-[13px] text-white/90 placeholder-white/35
                px-4 pt-3 pb-2 leading-relaxed caret-white/80 disabled:opacity-50"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <span className="font-mono text-[9px] text-white/35">⏎ send · ⇧⏎ newline</span>
              <button
                onClick={sendMessage}
                disabled={!input.trim() || chatLoading}
                className="bg-white text-black font-mono text-[10px] tracking-widest uppercase
                  px-4 py-1.5 rounded hover:bg-white/85 transition-opacity duration-150
                  disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {chatLoading ? (
                  <>
                    <span className="text-black/60">{Icon.spinner}</span> Thinking
                  </>
                ) : (
                  "Send →"
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════
          RIGHT SIDEBAR — Tools & Artifacts
      ══════════════════════════════════════════ */}
      <aside className="w-[220px] flex-shrink-0 border-l border-white/[0.14] flex flex-col bg-[#111111] overflow-hidden">

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="px-4 py-3.5 border-b border-white/[0.14] flex-shrink-0"
        >
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/60">Tools</p>
        </motion.div>

        {/* Transform tools */}
        <div className="p-3 flex-shrink-0">
          <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/40 mb-2.5">
            Transform Output
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { type: "Summary" as const, icon: Icon.summary },
                { type: "Flashcards" as const, icon: Icon.flash },
                { type: "Mind Map" as const, icon: Icon.mindmap },
                { type: "Report" as const, icon: Icon.report },
              ] as const
            ).map(({ type, icon }) => (
              <button
                key={type}
                onClick={() => runTool(type)}
                disabled={messages.length === 0}
                className="flex flex-col gap-2 bg-white/[0.05] border border-white/[0.14]
                  rounded-md p-2.5 text-left hover:bg-white/[0.10] hover:border-white/[0.25]
                  transition-all duration-150 group disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="text-white/55 group-hover:text-white/80 transition-colors">{icon}</span>
                <span className="font-mono text-[9px] tracking-widest uppercase text-white/55 group-hover:text-white/80 transition-colors">
                  {type}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-white/[0.14] flex-shrink-0" />

        {/* Artifacts list */}
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 bg-[#111111] px-4 pt-3 pb-2 flex items-center justify-between z-10">
            <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/40">Artifacts</p>
            <span className="font-mono text-[9px] text-white/50 bg-white/[0.08] border border-white/[0.18] px-1.5 py-0.5 rounded-full">
              {artifacts.length}
            </span>
          </div>

          {artifacts.length === 0 && (
            <p className="font-mono text-[9px] text-white/30 italic px-4 py-2">
              No artifacts yet
            </p>
          )}

          <div className="px-3 pb-3 space-y-1.5">
            <AnimatePresence initial={false}>
              {artifacts.map((a) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white/[0.04] border border-white/[0.14] rounded-md p-2.5
                    hover:bg-white/[0.08] hover:border-white/[0.22] transition-all duration-150 cursor-pointer group relative"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${artifactDots[a.type]}`} />
                    <span className={`font-mono text-[8.5px] tracking-widest uppercase ${artifactColors[a.type].split(" ")[0]}`}>
                      {a.type}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteArtifact(a.id); }}
                      className="ml-auto text-white/0 group-hover:text-white/40 hover:!text-white/75 transition-colors duration-150"
                      title="Delete artifact"
                    >
                      {Icon.trash}
                    </button>
                  </div>
                  <p className="text-[11px] text-white/70 leading-snug">{a.title}</p>
                  <p className="font-mono text-[8px] text-white/35 mt-1">{a.timestamp}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Status bar */}
        <div className="border-t border-white/[0.14] px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              background: chatLoading ? "#facc15" : "#4ade80",
              opacity: 0.75,
              animation: "blink 2s ease infinite",
            }}
          />
          <span className="font-mono text-[8.5px] text-white/45">
            {chatLoading ? "Processing…" : "Model ready · claude-sonnet-4"}
          </span>
        </div>
      </aside>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin { animation: spin 0.8s linear infinite; }
        textarea { font-family: 'IBM Plex Sans', sans-serif !important; }
        * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
      `}</style>
    </div>
  );
}