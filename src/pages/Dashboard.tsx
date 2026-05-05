import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────
interface FileNode {
  id: string;
  type: "file" | "folder" | "integration";
  name: string;
  checked: boolean;
  open?: boolean;
  children?: FileNode[];
  ext?: string;
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

// ── Initial Data ───────────────────────────────────────────────
const initialSources: FileNode[] = [
  {
    id: "papers",
    type: "folder",
    name: "Research Papers",
    checked: false,
    open: true,
    children: [
      { id: "p1", type: "file", name: "paper-01.pdf", checked: true, ext: "pdf" },
      { id: "p2", type: "file", name: "paper-02.pdf", checked: false, ext: "pdf" },
      { id: "p3", type: "file", name: "paper-03.pdf", checked: true, ext: "pdf" },
    ],
  },
  {
    id: "notes",
    type: "folder",
    name: "My Notes",
    checked: false,
    open: false,
    children: [
      { id: "n1", type: "file", name: "session-notes.md", checked: false, ext: "md" },
      { id: "n2", type: "file", name: "outline.md", checked: false, ext: "md" },
    ],
  },
];

const initialMessages: Message[] = [
  {
    id: "m1",
    role: "user",
    content:
      "Summarize the key themes from the uploaded papers and compare them with current web findings on transformer architectures.",
    timestamp: "10:41 AM",
  },
  {
    id: "m2",
    role: "ai",
    content: `**Key themes identified across sources:**

• Attention mechanisms scale better than recurrence at long sequences — consistent across paper-01.pdf and paper-03.pdf.
• Positional encodings remain an open research question; rotary vs. learned representations diverge in recent web literature.
• Mixture-of-experts models are emerging as the dominant efficiency paradigm in 2024–25.

Web sources largely confirm paper conclusions but add recent empirical benchmarks not present in the uploaded files. The gap between theoretical bounds (papers) and deployment realities (web) is notable — hardware co-design is now a first-class concern.`,
    timestamp: "10:42 AM",
    sources: ["paper-01.pdf", "paper-03.pdf", "Web Search"],
  },
  {
    id: "m3",
    role: "user",
    content: "Can you generate flashcards from these themes?",
    timestamp: "10:44 AM",
  },
];

const initialArtifacts: Artifact[] = [
  { id: "a1", type: "Summary", title: "Transformer architecture themes", timestamp: "10:42 AM" },
  { id: "a2", type: "Flashcards", title: "Attention mechanisms · 6 cards", timestamp: "10:38 AM" },
];

const artifactColors: Record<Artifact["type"], string> = {
  Summary: "text-blue-300/70 border-blue-400/15 bg-blue-400/[0.06]",
  Flashcards: "text-green-300/70 border-green-400/15 bg-green-400/[0.06]",
  "Mind Map": "text-amber-300/70 border-amber-400/15 bg-amber-400/[0.06]",
  Report: "text-purple-300/70 border-purple-400/15 bg-purple-400/[0.06]",
};

const artifactDots: Record<Artifact["type"], string> = {
  Summary: "bg-blue-300/60",
  Flashcards: "bg-green-400/60",
  "Mind Map": "bg-amber-300/60",
  Report: "bg-purple-300/60",
};

// ── SVG Icons ──────────────────────────────────────────────────
const Icon = {
  folder: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
      <path d="M1 3.5h4.5l1.5 1.5H13v7H1z" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
      <path d="M2.5 1.5h7l3 3v8h-10z" /><polyline points="9.5,1.5 9.5,4.5 12.5,4.5" />
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
      <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <path d="M2 8v2h8V8" /><polyline points="4,4 6,2 8,4" /><line x1="6" y1="2" x2="6" y2="8" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5">
      <circle cx="5" cy="5" r="3.5" /><line x1="7.5" y1="7.5" x2="10.5" y2="10.5" />
    </svg>
  ),
  save: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <path d="M2 1h6l2 2v8H2z" /><rect x="4" y="7" width="4" height="3.5" /><rect x="3.5" y="1" width="4" height="2.5" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <rect x="4" y="4" width="7" height="7" rx="1" /><path d="M2 8V2h6" />
    </svg>
  ),
  web: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <circle cx="6" cy="6" r="4.5" /><path d="M1.5 6h9M6 1.5c-1.5 1.5-2 3-2 4.5s.5 3 2 4.5M6 1.5c1.5 1.5 2 3 2 4.5s-.5 3-2 4.5" />
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
      <line x1="4" y1="5" x2="10" y2="5" /><line x1="4" y1="7" x2="8" y2="7" /><line x1="4" y1="9" x2="9" y2="9" />
    </svg>
  ),
  flash: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="1.5" y="3.5" width="11" height="8" rx="1.5" /><line x1="7" y1="3.5" x2="7" y2="11.5" />
    </svg>
  ),
  mindmap: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <circle cx="7" cy="7" r="1.5" />
      <line x1="7" y1="5.5" x2="7" y2="2" /><line x1="7" y1="8.5" x2="7" y2="12" />
      <line x1="5.5" y1="7" x2="2" y2="7" /><line x1="8.5" y1="7" x2="12" y2="7" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M2.5 1.5h7l2 2v9h-9z" /><line x1="5" y1="6" x2="9.5" y2="6" /><line x1="5" y1="8" x2="8" y2="8" /><line x1="5" y1="10" x2="9" y2="10" />
    </svg>
  ),
  newchat: (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-2.5 h-2.5">
      <path d="M10.5 7.5v3h-9v-9h3" /><line x1="8" y1="1" x2="11" y2="1" /><line x1="9.5" y1="2.5" x2="9.5" y2="-0.5" />
    </svg>
  ),
};

// ── Helpers ────────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function renderContent(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/80 font-normal">$1</strong>')
    .replace(/`(.*?)`/g, '<code class="font-mono text-[10.5px] bg-white/[0.07] border border-white/[0.08] rounded px-1.5 py-0.5 text-white/60">$1</code>')
    .replace(/^• (.+)$/gm, '<div class="flex gap-2 my-1"><span class="text-white/25 mt-0.5 flex-shrink-0">·</span><span>$1</span></div>')
    .split("\n\n")
    .map((p) => `<p class="mb-2 last:mb-0">${p}</p>`)
    .join("");
}

// ── Sub-components ─────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-3 h-3 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-all duration-150
        ${checked
          ? "bg-white/85 border border-transparent text-black"
          : "border border-white/[0.15] bg-transparent text-transparent hover:border-white/30"}`}
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
          className="w-full flex items-center gap-2 py-[5px] pr-3 text-left
            hover:bg-white/[0.04] transition-colors duration-150 group"
        >
          <span className={`transition-transform duration-150 text-white/25 ${node.open ? "rotate-90" : ""}`}>
            {Icon.chevron}
          </span>
          <span className="text-white/35 group-hover:text-white/50 transition-colors">{Icon.folder}</span>
          <span className="font-mono text-[10px] text-white/50 group-hover:text-white/70 transition-colors flex-1 truncate">
            {node.name}
          </span>
          <span className="font-mono text-[9px] text-white/20">{node.children?.length}</span>
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
        ${node.checked ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}
      onClick={() => onToggleCheck(node.id)}
    >
      {node.checked && (
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-white/70 rounded-r-full" />
      )}
      <span className="w-[10px] flex-shrink-0" />
      <span className={`${node.checked ? "text-white/60" : "text-white/25"} transition-colors`}>{Icon.file}</span>
      <span className={`font-mono text-[10px] flex-1 truncate transition-colors ${node.checked ? "text-white/70" : "text-white/40"}`}>
        {node.name}
      </span>
      <Checkbox checked={node.checked} onChange={() => onToggleCheck(node.id)} />
    </div>
  );
}

function MessageBubble({ msg, onSave }: { msg: Message; onSave: (title: string) => void }) {
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
      {/* meta */}
      <div className="flex items-center gap-2 px-1">
        <span className="font-mono text-[9px] tracking-widest uppercase text-white/30">
          {msg.role === "user" ? "You" : "AI"}
        </span>
        <span className="font-mono text-[9px] text-white/15">·</span>
        <span className="font-mono text-[9px] text-white/20">{msg.timestamp}</span>
        {msg.sources && (
          <>
            <span className="font-mono text-[9px] text-white/15">·</span>
            <span className="font-mono text-[9px] text-white/20">{msg.sources.length} sources</span>
          </>
        )}
      </div>

      {/* bubble */}
      <div
        className={`rounded-lg border px-4 py-3 text-[13px] font-light leading-relaxed text-white/75
          ${msg.role === "user"
            ? "bg-white/[0.05] border-white/[0.09] ml-6"
            : "bg-white/[0.02] border-white/[0.07]"}`}
        dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
      />

      {/* source tags */}
      {msg.sources && (
        <div className="flex gap-1.5 px-1 flex-wrap">
          {msg.sources.map((s) => (
            <span key={s} className="font-mono text-[9px] text-white/25 border border-white/[0.07] bg-white/[0.03] rounded px-2 py-0.5">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* actions */}
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
                className="font-mono text-[9px] tracking-widest uppercase text-white/30
                  border border-white/[0.08] bg-transparent px-2.5 py-1 rounded
                  hover:text-white/55 hover:border-white/15 transition-all duration-150"
              >
                Save
              </button>
            )}
            <button
              onClick={handleCopy}
              className="font-mono text-[9px] tracking-widest uppercase text-white/30
                border border-white/[0.08] bg-transparent px-2.5 py-1 rounded
                hover:text-white/55 hover:border-white/15 transition-all duration-150"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {msg.role === "user" && (
              <button className="font-mono text-[9px] tracking-widest uppercase text-white/30
                border border-white/[0.08] bg-transparent px-2.5 py-1 rounded
                hover:text-white/55 hover:border-white/15 transition-all duration-150">
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
  const [sources, setSources] = useState<FileNode[]>(initialSources);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [artifacts, setArtifacts] = useState<Artifact[]>(initialArtifacts);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [driveConnected, setDriveConnected] = useState(true);
  const [activeTab, setActiveTab] = useState<"sources" | "integrations">("sources");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Flatten all file nodes for search
  const flattenNodes = (nodes: FileNode[]): FileNode[] =>
    nodes.flatMap((n) => [n, ...(n.children ? flattenNodes(n.children) : [])]);

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

  const addFolder = () => {
    const name = prompt("Folder name:");
    if (!name) return;
    setSources((prev) => [
      ...prev,
      { id: uid(), type: "folder", name, checked: false, open: true, children: [] },
    ]);
  };

  const addFile = () => {
    const name = prompt("File name (e.g. notes.pdf):");
    if (!name) return;
    setSources((prev) => {
      const updated = [...prev];
      if (updated[0]?.type === "folder") {
        updated[0] = {
          ...updated[0],
          open: true,
          children: [...(updated[0].children || []), { id: uid(), type: "file", name, checked: false, ext: name.split(".").pop() }],
        };
      }
      return updated;
    });
  };

  const activeContextSources = flattenNodes(sources)
    .filter((n) => n.type === "file" && n.checked)
    .map((n) => n.name);

  const sendMessage = () => {
    const val = input.trim();
    if (!val) return;
    setInput("");
    setTyping(false);

    const userMsg: Message = { id: uid(), role: "user", content: val, timestamp: now() };
    setMessages((prev) => [...prev, userMsg]);

    setTimeout(() => {
      setTyping(true);
      setTimeout(() => {
        const aiMsg: Message = {
          id: uid(),
          role: "ai",
          content: `Based on your selected sources, here's what I found:\n\n${val.length > 40 ? "This is a nuanced topic. " : ""}The key insight is that your sources provide complementary perspectives — the uploaded files offer theoretical grounding while web data adds recent empirical evidence.\n\nWould you like me to transform this into a **summary**, **flashcards**, or a **report**?`,
          timestamp: now(),
          sources: [...activeContextSources.slice(0, 2), ...(webSearch ? ["Web Search"] : [])],
        };
        setMessages((prev) => [...prev, aiMsg]);
        setTyping(false);
      }, 1600);
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const saveArtifact = (type: Artifact["type"], title: string) => {
    setArtifacts((prev) => [
      { id: uid(), type, title, timestamp: now() },
      ...prev,
    ]);
  };

  const runTool = (type: Artifact["type"]) => {
    const lastAi = [...messages].reverse().find((m) => m.role === "ai");
    const title =
      type === "Summary" ? "Key themes · AI session" :
      type === "Flashcards" ? `Flashcards · ${messages.length} msgs` :
      type === "Mind Map" ? "Concept map · workspace" :
      "Full report · session";
    saveArtifact(type, title);
  };

  const filteredSources = searchQ
    ? sources.map((n) => ({
        ...n,
        open: true,
        children: n.children?.filter((c) => c.name.toLowerCase().includes(searchQ.toLowerCase())),
      })).filter((n) =>
          n.name.toLowerCase().includes(searchQ.toLowerCase()) ||
          (n.children && n.children.length > 0)
        )
    : sources;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ══════════════════════════════════════════
          LEFT SIDEBAR — Sources
      ══════════════════════════════════════════ */}
      <aside className="w-[240px] flex-shrink-0 border-r border-white/[0.07] flex flex-col bg-[#111111] overflow-hidden">

        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] flex-shrink-0"
        >
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/35">Sources</p>
          <div className="flex gap-1.5">
            <button
              onClick={addFolder}
              title="New folder"
              className="w-[22px] h-[22px] flex items-center justify-center rounded border border-white/[0.08]
                bg-transparent text-white/30 hover:text-white/60 hover:border-white/20 hover:bg-white/[0.05]
                transition-all duration-150"
            >
              {Icon.folder}
            </button>
            <button
              onClick={addFile}
              title="Upload file"
              className="w-[22px] h-[22px] flex items-center justify-center rounded border border-white/[0.08]
                bg-transparent text-white/30 hover:text-white/60 hover:border-white/20 hover:bg-white/[0.05]
                transition-all duration-150"
            >
              {Icon.upload}
            </button>
          </div>
        </motion.div>

        {/* search */}
        <div className="mx-3 my-2.5 flex items-center gap-2 bg-white/[0.03] border border-white/[0.07] rounded-md px-3 py-1.5 flex-shrink-0">
          <span className="text-white/25">{Icon.search}</span>
          <input
            type="text"
            placeholder="Search sources…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none font-mono text-[10px]
              text-white/70 placeholder-white/20 caret-white/50"
          />
        </div>

        {/* tree */}
        <div className="flex-1 overflow-y-auto">
          <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/20 px-3 pt-1 pb-1">
            Files
          </p>
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

          {/* web search toggle */}
          <div className="mt-3 mb-1">
            <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/20 px-3 pb-1">Quick Sources</p>
            <div
              className={`flex items-center gap-2 py-[5px] px-3 cursor-pointer transition-colors duration-150 relative
                ${webSearch ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"}`}
              onClick={() => setWebSearch((v) => !v)}
            >
              {webSearch && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-white/70 rounded-r-full" />}
              <span className={`${webSearch ? "text-white/60" : "text-white/25"} transition-colors`}>{Icon.web}</span>
              <span className={`font-mono text-[10px] flex-1 ${webSearch ? "text-white/70" : "text-white/40"}`}>Web Search</span>
              <Checkbox checked={webSearch} onChange={() => setWebSearch((v) => !v)} />
            </div>
          </div>
        </div>

        {/* integrations */}
        <div className="border-t border-white/[0.07] p-3 flex-shrink-0 space-y-2">
          <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/20 mb-2">Integrations</p>
          <button
            onClick={() => setDriveConnected((v) => !v)}
            className="w-full flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.07]
              rounded-md px-3 py-2 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-150"
          >
            <span className="text-white/30">{Icon.drive}</span>
            <span className="font-mono text-[9.5px] text-white/35">Google Drive</span>
            <span className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${driveConnected ? "bg-green-400/60" : "bg-white/15"}`} />
          </button>
          <button className="w-full flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.07]
            rounded-md px-3 py-2 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-150 opacity-50 cursor-not-allowed">
            <span className="text-white/30">{Icon.web}</span>
            <span className="font-mono text-[9.5px] text-white/35">Notion</span>
            <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 bg-white/15" />
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          CENTER — Chat
      ══════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">

        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.07] flex-shrink-0"
        >
          <div className="flex items-center gap-3">
            <p className="text-[15px] font-light text-white/85">Research Session</p>
            <span className="font-mono text-[9px] text-white/25">· {messages.length} messages</span>
          </div>
          <div className="flex gap-1.5">
            <button
              className="w-[22px] h-[22px] flex items-center justify-center rounded border border-white/[0.08]
                bg-transparent text-white/30 hover:text-white/60 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-150"
              title="Save session"
            >
              {Icon.save}
            </button>
            <button
              onClick={() => { setMessages([]); setTyping(false); }}
              className="w-[22px] h-[22px] flex items-center justify-center rounded border border-white/[0.08]
                bg-transparent text-white/30 hover:text-white/60 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-150"
              title="New chat"
            >
              {Icon.plus}
            </button>
          </div>
        </motion.div>

        {/* messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onSave={(title) => saveArtifact("Summary", title)}
              />
            ))}
          </AnimatePresence>

          {/* typing indicator */}
          <AnimatePresence>
            {typing && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[9px] tracking-widest uppercase text-white/30">AI</span>
                  <span className="font-mono text-[9px] text-white/15">·</span>
                  <span className="font-mono text-[9px] text-white/20">typing…</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.07] rounded-lg px-4 py-3 w-fit">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[5px] h-[5px] rounded-full bg-white/25"
                      style={{ animation: `pulse 1.2s ease ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={chatEndRef} />
        </div>

        {/* context bar */}
        <div className="border-t border-white/[0.07] px-5 py-2 flex items-center gap-2 flex-wrap flex-shrink-0">
          <span className="font-mono text-[8.5px] uppercase tracking-widest text-white/20">Context:</span>
          <AnimatePresence>
            {activeContextSources.map((s) => (
              <motion.span
                key={s}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="font-mono text-[9px] text-white/35 border border-white/[0.08] bg-white/[0.03] rounded px-2 py-0.5"
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
                className="font-mono text-[9px] text-white/35 border border-white/[0.08] bg-white/[0.03] rounded px-2 py-0.5"
              >
                Web Search
              </motion.span>
            )}
            {activeContextSources.length === 0 && !webSearch && (
              <span className="font-mono text-[9px] text-white/15 italic">No sources selected</span>
            )}
          </AnimatePresence>
        </div>

        {/* input */}
        <div className="border-t border-white/[0.07] px-5 py-4 flex-shrink-0">
          <div className="border border-white/[0.09] rounded-lg bg-white/[0.02] focus-within:border-white/[0.18] transition-colors duration-150">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your sources…"
              className="w-full bg-transparent border-none outline-none resize-none
                font-light text-[13px] text-white/80 placeholder-white/20
                px-4 pt-3 pb-2 leading-relaxed caret-white/60"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <span className="font-mono text-[9px] text-white/20">⏎ send &nbsp;·&nbsp; ⇧⏎ newline</span>
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="bg-white text-black font-mono text-[10px] tracking-widest uppercase
                  px-4 py-1.5 rounded hover:bg-white/85 transition-opacity duration-150
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Send →
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════
          RIGHT SIDEBAR — Tools & Artifacts
      ══════════════════════════════════════════ */}
      <aside className="w-[220px] flex-shrink-0 border-l border-white/[0.07] flex flex-col bg-[#111111] overflow-hidden">

        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="px-4 py-3.5 border-b border-white/[0.07] flex-shrink-0"
        >
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/35">Tools</p>
        </motion.div>

        {/* transform tools */}
        <div className="p-3 flex-shrink-0">
          <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/20 mb-2.5">Transform Output</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { type: "Summary" as const, icon: Icon.summary },
                { type: "Flashcards" as const, icon: Icon.flash },
                { type: "Mind Map" as const, icon: Icon.mindmap },
                { type: "Report" as const, icon: Icon.report },
              ]
            ).map(({ type, icon }) => (
              <button
                key={type}
                onClick={() => runTool(type)}
                className="flex flex-col gap-2 bg-white/[0.03] border border-white/[0.07]
                  rounded-md p-2.5 text-left hover:bg-white/[0.07] hover:border-white/[0.12]
                  transition-all duration-150 group"
              >
                <span className="text-white/30 group-hover:text-white/55 transition-colors">{icon}</span>
                <span className="font-mono text-[9px] tracking-widest uppercase text-white/30 group-hover:text-white/55 transition-colors">
                  {type}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-white/[0.07] flex-shrink-0" />

        {/* artifacts */}
        <div className="flex-1 overflow-y-auto">
          <div className="sticky top-0 bg-[#111111] px-4 pt-3 pb-2 flex items-center justify-between z-10">
            <p className="font-mono text-[8.5px] tracking-widest uppercase text-white/20">Artifacts</p>
            <span className="font-mono text-[9px] text-white/20 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-full">
              {artifacts.length}
            </span>
          </div>

          <div className="px-3 pb-3 space-y-1.5">
            <AnimatePresence initial={false}>
              {artifacts.map((a) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white/[0.03] border border-white/[0.07] rounded-md p-2.5
                    hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-150 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${artifactDots[a.type]}`} />
                    <span className={`font-mono text-[8.5px] tracking-widest uppercase ${artifactColors[a.type].split(" ")[0]}`}>
                      {a.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/55 leading-snug">{a.title}</p>
                  <p className="font-mono text-[8px] text-white/20 mt-1">{a.timestamp}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* status */}
        <div className="border-t border-white/[0.07] px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 flex-shrink-0" style={{ animation: "blink 2s ease infinite" }} />
          <span className="font-mono text-[8.5px] text-white/25">Model ready · claude-sonnet-4</span>
        </div>
      </aside>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.75; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        textarea { font-family: 'IBM Plex Sans', sans-serif !important; }
        * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
      `}</style>
    </div>
  );
}