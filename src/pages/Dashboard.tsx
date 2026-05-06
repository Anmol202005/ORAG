import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";

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

interface OrgState {
  orgId: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

// ── API helpers ────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  // Adjust the key name to match wherever you store your token
  const token =
    localStorage.getItem("auth_token") ??
    localStorage.getItem("access_token") ??
    sessionStorage.getItem("token");

  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function apiFetchOrg(slug: string): Promise<OrgState> {
  const res = await fetch(`/api/orgs/${slug}`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`/api/orgs/${slug} ${res.status}`);
  const data = await res.json();
  return data.org as OrgState;
}

async function apiFetchFiles(slug: string): Promise<FileNode[]> {
  const res = await fetch(`/api/orgs/${slug}/getFilesByOrgId`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });
  if (!res.ok)
    throw new Error(`/api/orgs/${slug}/getFilesByOrgId ${res.status}`);
  const data = await res.json();

  const documents: Array<{
    docId: string;
    docName: string;
    orgId: string;
    totalChunks?: number;
    uploadedAt?: string;
  }> = data.documents ?? [];

  const fileNodes: FileNode[] = documents.map((doc) => ({
    id: doc.docId,
    type: "file",
    name: doc.docName,
    ext: doc.docName.includes(".") ? doc.docName.split(".").pop() : undefined,
    checked: false,
  }));

  // Wrap everything in a single "Documents" folder, mirroring the old shape
  return [
    {
      id: "__org_docs__",
      type: "folder",
      name: "Documents",
      checked: false,
      open: true,
      children: fileNodes,
    },
  ];
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
  if (fileNames.length)
    parts.push(
      `The user has the following files in context: ${fileNames.join(", ")}.`,
    );
  if (webSearch)
    parts.push("You may search the web to supplement your answer.");
  return parts.join(" ");
}

async function apiChatStream(
  messages: AgentMessage[],
  onToken: (token: string) => void,
  orgId: string,
): Promise<string> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, orgId }),
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
        /* skip */
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

function nowStr() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function renderContent(text: string) {
  return text
    .replace(
      /\*\*(.*?)\*\*/g,
      '<strong class="text-white/90 font-normal">$1</strong>',
    )
    .replace(
      /`(.*?)`/g,
      '<code class="font-mono text-[10.5px] bg-white/[0.10] border border-white/[0.14] rounded px-1.5 py-0.5 text-white/75">$1</code>',
    )
    .replace(
      /^• (.+)$/gm,
      '<div class="flex gap-2 my-1"><span class="text-white/35 mt-0.5 flex-shrink-0">·</span><span>$1</span></div>',
    )
    .split("\n\n")
    .map((p) => `<p class="mb-2 last:mb-0">${p}</p>`)
    .join("");
}

// ── SVG Icons ──────────────────────────────────────────────────
const Icon = {
  folder: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="w-3 h-3"
    >
      <path d="M1 3.5h4.5l1.5 1.5H13v7H1z" />
    </svg>
  ),
  file: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="w-3 h-3"
    >
      <path d="M2.5 1.5h7l3 3v8h-10z" />
      <polyline points="9.5,1.5 9.5,4.5 12.5,4.5" />
    </svg>
  ),
  chevron: (
    <svg
      viewBox="0 0 8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="w-2 h-2"
    >
      <polyline points="2,1 6,4 2,7" />
    </svg>
  ),
  check: (
    <svg
      viewBox="0 0 8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="w-2 h-2"
    >
      <polyline points="1.5,4 3.5,6.5 6.5,1.5" />
    </svg>
  ),
  plus: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <line x1="6" y1="2" x2="6" y2="10" />
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  ),
  upload: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <path d="M2 8v2h8V8" />
      <polyline points="4,4 6,2 8,4" />
      <line x1="6" y1="2" x2="6" y2="8" />
    </svg>
  ),
  search: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <circle cx="5" cy="5" r="3.5" />
      <line x1="7.5" y1="7.5" x2="10.5" y2="10.5" />
    </svg>
  ),
  web: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <circle cx="6" cy="6" r="4.5" />
      <path d="M1.5 6h9M6 1.5c-1.5 1.5-2 3-2 4.5s.5 3 2 4.5M6 1.5c1.5 1.5 2 3 2 4.5s-.5 3-2 4.5" />
    </svg>
  ),
  drive: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <polygon points="6,1 11,10 1,10" />
    </svg>
  ),
  summary: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="w-3.5 h-3.5"
    >
      <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
      <line x1="4" y1="5" x2="10" y2="5" />
      <line x1="4" y1="7" x2="8" y2="7" />
      <line x1="4" y1="9" x2="9" y2="9" />
    </svg>
  ),
  flash: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="w-3.5 h-3.5"
    >
      <rect x="1.5" y="3.5" width="11" height="8" rx="1.5" />
      <line x1="7" y1="3.5" x2="7" y2="11.5" />
    </svg>
  ),
  mindmap: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="w-3.5 h-3.5"
    >
      <circle cx="7" cy="7" r="1.5" />
      <line x1="7" y1="5.5" x2="7" y2="2" />
      <line x1="7" y1="8.5" x2="7" y2="12" />
      <line x1="5.5" y1="7" x2="2" y2="7" />
      <line x1="8.5" y1="7" x2="12" y2="7" />
    </svg>
  ),
  report: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="w-3.5 h-3.5"
    >
      <path d="M2.5 1.5h7l2 2v9h-9z" />
      <line x1="5" y1="6" x2="9.5" y2="6" />
      <line x1="5" y1="8" x2="8" y2="8" />
      <line x1="5" y1="10" x2="9" y2="10" />
    </svg>
  ),
  spinner: (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-3 h-3 animate-spin"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        strokeDasharray="12 22"
        strokeLinecap="round"
      />
    </svg>
  ),
  trash: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <path d="M2 3h8M5 3V2h2v1M4 3l.5 7h3l.5-7" />
    </svg>
  ),
  copy: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <path d="M2 8V2h6" />
    </svg>
  ),
  logo: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 22 22"
      fill="none"
      className="opacity-50"
    >
      <rect
        x="1"
        y="1"
        width="9"
        height="9"
        rx="1.5"
        stroke="white"
        strokeWidth="1.2"
      />
      <rect
        x="12"
        y="1"
        width="9"
        height="9"
        rx="1.5"
        stroke="white"
        strokeWidth="1.2"
      />
      <rect
        x="1"
        y="12"
        width="9"
        height="9"
        rx="1.5"
        stroke="white"
        strokeWidth="1.2"
      />
      <rect
        x="12"
        y="12"
        width="9"
        height="9"
        rx="1.5"
        stroke="white"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
    </svg>
  ),
  back: (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="w-2.5 h-2.5"
    >
      <polyline points="7,2 3,6 7,10" />
      <line x1="3" y1="6" x2="11" y2="6" />
    </svg>
  ),
};

const artifactColors: Record<Artifact["type"], string> = {
  Summary: "text-blue-300/80 border-blue-400/20 bg-blue-400/[0.07]",
  Flashcards: "text-emerald-300/80 border-emerald-400/20 bg-emerald-400/[0.07]",
  "Mind Map": "text-amber-300/80 border-amber-400/20 bg-amber-400/[0.07]",
  Report: "text-violet-300/80 border-violet-400/20 bg-violet-400/[0.07]",
};
const artifactDots: Record<Artifact["type"], string> = {
  Summary: "bg-blue-300/70",
  Flashcards: "bg-emerald-400/70",
  "Mind Map": "bg-amber-300/70",
  Report: "bg-violet-300/70",
};

// ── Checkbox ───────────────────────────────────────────────────
function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-3 h-3 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-all duration-150
        ${checked ? "bg-white border border-transparent text-black" : "border border-white/[0.25] bg-transparent text-transparent hover:border-white/50"}`}
    >
      {Icon.check}
    </button>
  );
}

// ── TreeNode ───────────────────────────────────────────────────
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
          className="w-full flex items-center gap-2 py-[5px] pr-3 text-left hover:bg-white/[0.05] transition-colors duration-150 group"
        >
          <span
            className={`transition-transform duration-150 text-white/35 ${node.open ? "rotate-90" : ""}`}
          >
            {Icon.chevron}
          </span>
          <span className="text-white/35 group-hover:text-white/55 transition-colors">
            {Icon.folder}
          </span>
          <span className="font-mono text-[10px] text-white/50 group-hover:text-white/75 transition-colors flex-1 truncate">
            {node.name}
          </span>
          <span className="font-mono text-[9px] text-white/25">
            {node.children?.length}
          </span>
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
        ${node.checked ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
      onClick={() => onToggleCheck(node.id)}
    >
      {node.checked && (
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-white/60 rounded-r-full" />
      )}
      <span className="w-[10px] flex-shrink-0" />
      <span
        className={`${node.checked ? "text-white/70" : "text-white/30"} transition-colors`}
      >
        {Icon.file}
      </span>
      <span
        className={`font-mono text-[10px] flex-1 truncate transition-colors ${node.checked ? "text-white/80" : "text-white/45"}`}
      >
        {node.name}
      </span>
      <Checkbox
        checked={node.checked}
        onChange={() => onToggleCheck(node.id)}
      />
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────
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
        <span className="font-mono text-[9px] tracking-widest uppercase text-white/40">
          {msg.role === "user" ? "You" : "AI"}
        </span>
        <span className="font-mono text-[9px] text-white/20">·</span>
        <span className="font-mono text-[9px] text-white/30">
          {msg.timestamp}
        </span>
        {msg.sources && (
          <>
            <span className="font-mono text-[9px] text-white/20">·</span>
            <span className="font-mono text-[9px] text-white/30">
              {msg.sources.length} sources
            </span>
          </>
        )}
      </div>

      <div
        className={`rounded-lg border px-4 py-3 text-[13px] font-light leading-relaxed text-white/85
          ${msg.role === "user" ? "bg-white/[0.06] border-white/[0.12] ml-6" : "bg-white/[0.02] border-white/[0.08]"}`}
        dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
      />

      {msg.sources && (
        <div className="flex gap-1.5 px-1 flex-wrap">
          {msg.sources.map((s) => (
            <span
              key={s}
              className="font-mono text-[9px] text-white/45 border border-white/[0.12] bg-white/[0.04] rounded px-2 py-0.5"
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
                className="font-mono text-[9px] tracking-widest uppercase text-white/40 border border-white/[0.12] bg-transparent px-2.5 py-1 rounded hover:text-white/70 hover:border-white/25 transition-all duration-150"
              >
                Save
              </button>
            )}
            <button
              onClick={handleCopy}
              className="font-mono text-[9px] tracking-widest uppercase text-white/40 border border-white/[0.12] bg-transparent px-2.5 py-1 rounded hover:text-white/70 hover:border-white/25 transition-all duration-150"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {msg.role === "user" && (
              <button className="font-mono text-[9px] tracking-widest uppercase text-white/40 border border-white/[0.12] bg-transparent px-2.5 py-1 rounded hover:text-white/70 hover:border-white/25 transition-all duration-150">
                Edit
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Sidebar section label ──────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] tracking-widest uppercase text-white/30 px-4 pt-3 pb-1.5">
      {children}
    </p>
  );
}

// ── Typing Indicator ───────────────────────────────────────────
function TypingIndicator() {
  return (
    <motion.div
      key="typing"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-2 px-1">
        <span className="font-mono text-[9px] tracking-widest uppercase text-white/40">
          AI
        </span>
        <span className="font-mono text-[9px] text-white/20">·</span>
        <motion.span
          className="font-mono text-[9px] text-white/30"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          thinking
        </motion.span>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-lg px-5 py-4 w-fit flex items-center gap-5">
        <div className="relative w-5 h-5 shrink-0">
          <svg viewBox="0 0 20 20" className="w-5 h-5 absolute inset-0">
            {[
              { x: 0, y: 0, delay: 0 },
              { x: 11, y: 0, delay: 0.15 },
              { x: 0, y: 11, delay: 0.3 },
              { x: 11, y: 11, delay: 0.45, dashed: true },
            ].map((sq, i) => (
              <motion.rect
                key={i}
                x={sq.x}
                y={sq.y}
                width={8}
                height={8}
                rx={1}
                fill="none"
                stroke="white"
                strokeWidth={1.1}
                strokeDasharray={sq.dashed ? "2 1.5" : undefined}
                animate={{ opacity: [0.15, 0.55, 0.15] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.6,
                  delay: sq.delay,
                  ease: "easeInOut",
                }}
              />
            ))}
          </svg>
        </div>

        <div className="flex flex-col gap-1.5">
          {[
            { w: "w-28", delay: 0 },
            { w: "w-20", delay: 0.1 },
            { w: "w-24", delay: 0.2 },
          ].map((line, i) => (
            <motion.div
              key={i}
              className={`h-[3px] ${line.w} rounded-full bg-white/[0.12]`}
              animate={{ opacity: [0.2, 0.55, 0.2], scaleX: [0.95, 1, 0.95] }}
              transition={{
                repeat: Infinity,
                duration: 1.8,
                delay: line.delay,
                ease: "easeInOut",
              }}
              style={{ transformOrigin: "left" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function Workspace() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  // ── Org state ──────────────────────────────────────────────
  const [org, setOrg] = useState<OrgState | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  // ── Workspace state ────────────────────────────────────────
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
  const [sessionTitle, setSessionTitle] = useState("Research Session");
  const [editingTitle, setEditingTitle] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch org on mount ─────────────────────────────────────
  useEffect(() => {
    if (!slug) {
      setOrgError("No workspace slug found in URL.");
      setOrgLoading(false);
      return;
    }
    setOrgLoading(true);
    apiFetchOrg(slug)
      .then((data) => {
        setOrg(data);
        setSessionTitle(data.name ?? "Research Session");
        setOrgError(null);
      })
      .catch((e) => setOrgError(e.message))
      .finally(() => setOrgLoading(false));
  }, [slug]);

  // ── Fetch files once org is ready ─────────────────────────
  useEffect(() => {
    if (!org) return;
    setFilesLoading(true);
    apiFetchFiles(org.slug) // ← pass slug
      .then((tree) => {
        setSources(tree);
        setFilesError(null);
      })
      .catch((e) => setFilesError(e.message))
      .finally(() => setFilesLoading(false));
  }, [org]);

  useEffect(() => {
    setArtifacts(stubLoadArtifacts());
  }, []);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  const flattenNodes = useCallback(
    (nodes: FileNode[]): FileNode[] =>
      nodes.flatMap((n) => [
        n,
        ...(n.children ? flattenNodes(n.children) : []),
      ]),
    [],
  );

  const toggleCheck = (id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] =>
      nodes.map((n) =>
        n.id === id
          ? { ...n, checked: !n.checked }
          : n.children
            ? { ...n, children: toggle(n.children) }
            : n,
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
            : n,
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
        } else updated.push(newNode);
        return updated;
      });
    } catch (err: unknown) {
      alert(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  const activeContextFiles = flattenNodes(sources).filter(
    (n) => n.type === "file" && n.checked,
  );
  const activeContextNames = activeContextFiles.map((n) => n.name);

  const sendMessage = async () => {
    const val = input.trim();
    if (!val || chatLoading || !org) return;
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
      if (systemContent)
        agentMessages.push({ role: "system", content: systemContent });
      setMessages((prev) => {
        prev.forEach((m) =>
          agentMessages.push({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.content,
          }),
        );
        return prev;
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

      await apiChatStream(
        agentMessages,
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId ? { ...m, content: m.content + token } : m,
            ),
          );
        },
        org.orgId,
      );

      setChatLoading(false);
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
            c.name.toLowerCase().includes(searchQ.toLowerCase()),
          ),
        }))
        .filter(
          (n) =>
            n.name.toLowerCase().includes(searchQ.toLowerCase()) ||
            (n.children && n.children.length > 0),
        )
    : sources;

  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    chatLoading &&
    (!lastMessage || lastMessage.role !== "ai" || lastMessage.content === "");

  // ── Org loading / error gates ──────────────────────────────
  if (orgLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="flex items-center gap-3 text-white/40">
          {Icon.spinner}
          <span className="font-mono text-[11px]">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (orgError || !org) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d] flex-col gap-3">
        <span className="font-mono text-[11px] text-red-300/70">
          Failed to load workspace: {orgError ?? "unknown error"}
        </span>
        <button
          onClick={() => navigate("/organizations")}
          className="font-mono text-[10px] text-white/40 border border-white/[0.12] px-3 py-1.5 rounded hover:text-white/70 hover:border-white/25 transition-all duration-150"
        >
          ← Back to organizations
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="flex h-screen text-white overflow-hidden"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.md,.txt,.docx,.csv"
        onChange={handleFileChange}
      />

      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.018) 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
        }}
      />

      {/* ══════════════════════════════════════════
          LEFT SIDEBAR — Sources
      ══════════════════════════════════════════ */}
      <aside className="w-[230px] flex-shrink-0 border-r border-white/[0.08] flex flex-col bg-[#0d0d0d] overflow-hidden relative z-10">
        {/* Nav identity strip */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
          <button
            onClick={() => navigate("/organizations")}
            className="flex items-center gap-2 group"
          >
            <span className="text-white/30 group-hover:text-white/60 transition-colors duration-150">
              {Icon.back}
            </span>
            <div className="flex items-center gap-1.5">
              {Icon.logo}
              <span className="text-sm font-light tracking-[0.18em] text-white/50 group-hover:text-white/70 transition-colors duration-150">
                ORAG
              </span>
            </div>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLoading}
            title="Upload file"
            className="w-6 h-6 flex items-center justify-center rounded border border-white/[0.10]
              bg-transparent text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/[0.05]
              transition-all duration-150 disabled:opacity-30"
          >
            {uploadLoading ? Icon.spinner : Icon.upload}
          </button>
        </div>

        {/* Section: Sources */}
        <SectionLabel>Sources</SectionLabel>

        {/* Search */}
        <div className="mx-3 mb-2 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 focus-within:border-white/[0.18] transition-colors duration-150">
          <span className="text-white/30">{Icon.search}</span>
          <input
            type="text"
            placeholder="Search files…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none font-mono text-[10px] text-white/70 placeholder-white/25 caret-white/60"
          />
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto">
          {filesLoading && (
            <div className="flex items-center gap-2 px-4 py-4 text-white/35">
              {Icon.spinner}
              <span className="font-mono text-[9px]">Loading…</span>
            </div>
          )}
          {filesError && (
            <div className="mx-3 my-2 rounded-md border border-red-400/25 bg-red-400/[0.07] px-3 py-2">
              <p className="font-mono text-[9px] text-red-300/80">
                Failed to load files
              </p>
              <p className="font-mono text-[8px] text-red-300/50 mt-0.5">
                {filesError}
              </p>
              <button
                onClick={() => {
                  setFilesError(null);
                  setFilesLoading(true);
                  apiFetchFiles(org!.slug) // ← pass slug
                    .then(setSources)
                    .catch((e) => setFilesError(e.message))
                    .finally(() => setFilesLoading(false));
                }}
                className="mt-1.5 font-mono text-[9px] text-red-300/60 hover:text-red-300 underline"
              >
                Retry
              </button>
            </div>
          )}
          {!filesLoading && !filesError && filteredSources.length === 0 && (
            <p className="font-mono text-[9px] text-white/25 italic px-4 py-3">
              No files — upload one above
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
          <div className="mt-3">
            <SectionLabel>Quick Sources</SectionLabel>
            <div
              className={`flex items-center gap-2 py-[5px] px-4 cursor-pointer transition-colors duration-150 relative
                ${webSearch ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}
              onClick={() => setWebSearch((v) => !v)}
            >
              {webSearch && (
                <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-white/50 rounded-r-full" />
              )}
              <span
                className={`${webSearch ? "text-white/60" : "text-white/30"} transition-colors`}
              >
                {Icon.web}
              </span>
              <span
                className={`font-mono text-[10px] flex-1 transition-colors ${webSearch ? "text-white/70" : "text-white/40"}`}
              >
                Web Search
              </span>
              <Checkbox
                checked={webSearch}
                onChange={() => setWebSearch((v) => !v)}
              />
            </div>
          </div>
        </div>

        {/* Integrations */}
        <div className="border-t border-white/[0.08] p-3 flex-shrink-0 space-y-1.5">
          <SectionLabel>Integrations</SectionLabel>
          {[
            {
              icon: Icon.drive,
              label: "Google Drive",
              connected: driveConnected,
            },
            { icon: Icon.web, label: "Notion", connected: false },
          ].map(({ icon, label, connected }) => (
            <button
              key={label}
              disabled
              className="w-full flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.07] rounded-md px-3 py-2
                hover:bg-white/[0.06] transition-all duration-150 opacity-40 cursor-not-allowed"
            >
              <span className="text-white/40">{icon}</span>
              <span className="font-mono text-[9.5px] text-white/50">
                {label}
              </span>
              <span
                className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? "bg-emerald-400/70" : "bg-white/20"}`}
              />
            </button>
          ))}
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          CENTER — Chat
      ══════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Chat header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.08] flex-shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
                className="bg-transparent border-b border-white/[0.20] outline-none text-[15px] font-light text-white/90 pb-0.5 min-w-0"
              />
            ) : (
              <p
                className="text-[15px] font-light text-white/80 cursor-text hover:text-white/95 transition-colors duration-150 truncate"
                onClick={() => setEditingTitle(true)}
              >
                {sessionTitle}
              </p>
            )}
            <span className="font-mono text-[9px] text-white/25 shrink-0">
              · {messages.length} messages
            </span>
            {/* Org badge */}
            <span className="font-mono text-[9px] text-white/20 border border-white/[0.08] bg-white/[0.03] rounded px-2 py-0.5 shrink-0 truncate max-w-[120px]">
              {org.slug}
            </span>
          </div>
          <button
            onClick={() => setMessages([])}
            className="w-6 h-6 flex items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/35
              hover:text-white/65 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-150"
            title="New chat"
          >
            {Icon.plus}
          </button>
        </motion.div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
          {messages.length === 0 && !chatLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-4 text-center"
            >
              <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center opacity-40">
                {Icon.logo}
              </div>
              <div>
                <p className="text-white/35 text-[13px] font-light mb-1">
                  Select sources, then ask anything.
                </p>
                <p className="font-mono text-[9px] text-white/20">
                  {activeContextNames.length} file
                  {activeContextNames.length !== 1 ? "s" : ""} in context
                  {webSearch ? " · web search on" : ""}
                </p>
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) =>
              msg.role === "ai" && msg.content === "" ? null : (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onSave={(title) => saveArtifact("Summary", title)}
                />
              ),
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showTypingIndicator && <TypingIndicator />}
          </AnimatePresence>

          <div ref={chatEndRef} />
        </div>

        {/* Context bar */}
        <div className="border-t border-white/[0.08] px-5 py-2 flex items-center gap-2 flex-wrap flex-shrink-0 bg-[#0d0d0d]/60">
          <span className="font-mono text-[8.5px] uppercase tracking-widest text-white/25">
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
                className="font-mono text-[9px] text-white/50 border border-white/[0.10] bg-white/[0.04] rounded px-2 py-0.5"
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
                className="font-mono text-[9px] text-white/50 border border-white/[0.10] bg-white/[0.04] rounded px-2 py-0.5"
              >
                Web Search
              </motion.span>
            )}
            {activeContextNames.length === 0 && !webSearch && (
              <span className="font-mono text-[9px] text-white/20 italic">
                No sources selected
              </span>
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="border-t border-white/[0.08] px-5 py-4 flex-shrink-0">
          <div className="border border-white/[0.10] rounded-lg bg-white/[0.03] focus-within:border-white/[0.22] transition-colors duration-150">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your sources…"
              disabled={chatLoading}
              className="w-full bg-transparent border-none outline-none resize-none font-light text-[13px] text-white/80
                placeholder-white/25 px-4 pt-3 pb-2 leading-relaxed caret-white/70 disabled:opacity-40"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <span className="font-mono text-[9px] text-white/25">
                ⏎ send · ⇧⏎ newline
              </span>
              <button
                onClick={sendMessage}
                disabled={!input.trim() || chatLoading}
                className="bg-white text-black font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded
                  hover:bg-white/85 transition-opacity duration-150 disabled:opacity-25 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {chatLoading ? (
                  <>
                    <span className="text-black/50">{Icon.spinner}</span>{" "}
                    Thinking
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
      <aside className="w-[210px] flex-shrink-0 border-l border-white/[0.08] flex flex-col bg-[#0d0d0d] overflow-hidden relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="px-4 py-3.5 border-b border-white/[0.08] flex-shrink-0"
        >
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/35">
            Tools
          </p>
        </motion.div>

        {/* Transform tools */}
        <div className="p-3 flex-shrink-0">
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/25 mb-2.5 px-1">
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
                className="flex flex-col gap-2 bg-white/[0.03] border border-white/[0.08] rounded-md p-2.5 text-left
                  hover:bg-white/[0.07] hover:border-white/[0.15] transition-all duration-150 group
                  disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <span className="text-white/40 group-hover:text-white/65 transition-colors">
                  {icon}
                </span>
                <span className="font-mono text-[9px] tracking-widest uppercase text-white/40 group-hover:text-white/65 transition-colors">
                  {type}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-white/[0.08] flex-shrink-0" />

        {/* Artifacts list */}
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 bg-[#0d0d0d] px-4 pt-3 pb-2 flex items-center justify-between z-10">
            <p className="font-mono text-[9px] tracking-widest uppercase text-white/25">
              Artifacts
            </p>
            <span className="font-mono text-[9px] text-white/30 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-full">
              {artifacts.length}
            </span>
          </div>

          {artifacts.length === 0 && (
            <p className="font-mono text-[9px] text-white/20 italic px-4 py-2">
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
                  className="bg-white/[0.02] border border-white/[0.08] rounded-md p-2.5 hover:bg-white/[0.05] hover:border-white/[0.13] transition-all duration-150 cursor-pointer group relative"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${artifactDots[a.type]}`}
                    />
                    <span
                      className={`font-mono text-[8.5px] tracking-widest uppercase ${artifactColors[a.type].split(" ")[0]}`}
                    >
                      {a.type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteArtifact(a.id);
                      }}
                      className="ml-auto text-white/0 group-hover:text-white/30 hover:!text-white/65 transition-colors duration-150"
                      title="Delete"
                    >
                      {Icon.trash}
                    </button>
                  </div>
                  <p className="text-[11px] text-white/60 leading-snug">
                    {a.title}
                  </p>
                  <p className="font-mono text-[8px] text-white/25 mt-1">
                    {a.timestamp}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Status bar */}
        <div className="border-t border-white/[0.08] px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              background: chatLoading ? "#fbbf24" : "#34d399",
              opacity: 0.65,
              animation: "blinkDot 2.5s ease infinite",
            }}
          />
          <span className="font-mono text-[8.5px] text-white/30 truncate">
            {chatLoading ? "Processing…" : "claude-sonnet-4 · ready"}
          </span>
        </div>
      </aside>

      <style>{`
        @keyframes pulseThink { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.7; } }
        @keyframes blinkDot { 0%, 100% { opacity: 0.65; } 50% { opacity: 0.25; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 0.8s linear infinite; }
        textarea { font-family: 'IBM Plex Sans', sans-serif !important; }
        * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 9999px; }
      `}</style>
    </div>
  );
}
