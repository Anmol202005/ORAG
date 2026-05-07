import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useNavigate } from "react-router-dom";

// ── Reveal wrapper ────────────────────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Code block with copy ──────────────────────────────────────────────────────
function CodeBlock({
  filename,
  lang = "json",
  children,
}: {
  filename?: string;
  lang?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.02] my-5">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white/10" />
          <span className="w-2 h-2 rounded-full bg-white/10" />
          <span className="w-2 h-2 rounded-full bg-white/10" />
          {filename && (
            <span className="font-mono text-[10px] text-white/25 ml-1 tracking-wider">
              {filename}
            </span>
          )}
          {!filename && (
            <span className="font-mono text-[10px] text-white/20 ml-1 tracking-wider">
              {lang}
            </span>
          )}
        </div>
        <button
          onClick={copy}
          className="font-mono text-[9px] tracking-widest uppercase text-white/25
                     hover:text-white/60 transition-colors duration-150 border border-white/[0.08]
                     px-2 py-1 rounded"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="px-5 py-5 text-[12px] font-mono leading-6 overflow-x-auto text-white/55 whitespace-pre">
        {children.trim()}
      </pre>
    </div>
  );
}

// ── Section anchor heading ────────────────────────────────────────────────────
function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="text-2xl md:text-3xl font-light tracking-tight mb-4 scroll-mt-28"
    >
      {children}
    </h2>
  );
}

function SubHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="text-lg font-light tracking-tight mb-3 mt-10 text-white/80 scroll-mt-28"
    >
      {children}
    </h3>
  );
}

// ── Sidebar nav data ──────────────────────────────────────────────────────────
const NAV = [
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "overview", label: "Overview" },
  { id: "mcp-url", label: "MCP URL format" },
  { id: "auth", label: "Authentication" },
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "windsurf", label: "Windsurf" },
  { id: "custom-agent", label: "Custom agents" },
  { id: "tools", label: "Available tools" },
  { id: "streaming", label: "Streaming events" },
  { id: "errors", label: "Error reference" },
];

// ── Inline code ───────────────────────────────────────────────────────────────
function IC({ children }: { children: string }) {
  return (
    <code
      className="font-mono text-[11px] bg-white/[0.07] border border-white/[0.08]
                     px-1.5 py-0.5 rounded text-white/70"
    >
      {children}
    </code>
  );
}

// ── Callout ───────────────────────────────────────────────────────────────────
function Callout({
  type = "note",
  children,
}: {
  type?: "note" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    note: "border-white/[0.12] bg-white/[0.03] text-white/50",
    warning: "border-yellow-400/20 bg-yellow-400/[0.04] text-yellow-300/60",
    tip: "border-green-400/20 bg-green-400/[0.04] text-green-300/60",
  };
  const labels = { note: "NOTE", warning: "WARNING", tip: "TIP" };
  return (
    <div className={`border rounded-lg px-5 py-4 my-5 ${styles[type]}`}>
      <p className="font-mono text-[9px] tracking-widest uppercase mb-1.5 opacity-60">
        {labels[type]}
      </p>
      <div className="text-sm font-light leading-relaxed">{children}</div>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border border-white/[0.08] rounded-lg p-5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors duration-200">
      <div className="mb-3 text-white/40">{icon}</div>
      <h4 className="text-sm font-light text-white/80 mb-2 tracking-tight">{title}</h4>
      <p className="text-xs font-light text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}

// ── Step ──────────────────────────────────────────────────────────────────────
function Step({
  number,
  title,
  description,
  last = false,
}: {
  number: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full border border-white/[0.12] bg-white/[0.04] flex items-center justify-center shrink-0">
          <span className="font-mono text-[10px] text-white/50">{number}</span>
        </div>
        {!last && <div className="w-px flex-1 bg-white/[0.06] mt-2 mb-0" />}
      </div>
      <div className={`pb-10 ${last ? "" : ""}`}>
        <h4 className="text-sm font-light text-white/80 mb-1.5 tracking-tight">{title}</h4>
        <p className="text-sm font-light text-white/40 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DocsPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState("features");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hash-based scroll on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const el = document.getElementById(hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, []);

  // Track active section
  useEffect(() => {
    const ids = NAV.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden bg-[#0a0a0a]">
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.022) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.022) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
        }}
      />

      {/* Top radial glow */}
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 z-0"
        style={{
          height: "40vh",
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)",
        }}
      />

      {/* ── NAV ── */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between
                    px-8 md:px-20 lg:px-32 py-5 transition-all duration-300
                    ${scrolled ? "bg-[#0a0a0a]/80 backdrop-blur-md" : ""}`}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5"
        >
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" className="opacity-60">
            <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
            <rect x="12" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
            <rect x="1" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
            <rect x="12" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" strokeDasharray="2 2" />
          </svg>
          <span className="text-lg font-light tracking-[0.2em] text-white">ORAG</span>
        </button>

        <div className="hidden md:flex items-center gap-8">
          {[
            { label: "Features", href: "/docs#features" },
            { label: "How it works", href: "/docs#how-it-works" },
            { label: "Docs", href: "/docs#overview" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className={`font-mono text-[10px] tracking-widest uppercase transition-colors duration-150
                         ${
                           (label === "Features" && activeId === "features") ||
                           (label === "How it works" && activeId === "how-it-works") ||
                           (label === "Docs" && !["features", "how-it-works"].includes(activeId))
                             ? "text-white/70"
                             : "text-white/35 hover:text-white/70"
                         }`}
            >
              {label}
            </a>
          ))}
        </div>

        <button
          onClick={() => navigate("/auth")}
          className="font-mono text-[10px] tracking-widest uppercase text-white
                     border border-white/[0.15] bg-white/[0.05] px-4 py-2 rounded
                     hover:bg-white/[0.10] hover:border-white/25 transition-all duration-150"
        >
          Sign in →
        </button>
      </motion.nav>

      {/* ── LAYOUT ── */}
      <div className="relative z-10 flex pt-24">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-24 self-start h-[calc(100vh-6rem)] px-8 py-8 overflow-y-auto">
          <p className="font-mono text-[9px] tracking-widest uppercase text-white/25 mb-5">
            On this page
          </p>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`font-mono text-[10px] tracking-widest uppercase py-1 transition-colors duration-150
                           ${
                             activeId === item.id
                               ? "text-white/80"
                               : "text-white/25 hover:text-white/55"
                           }`}
              >
                {activeId === item.id && (
                  <span className="inline-block w-3 border-t border-white/40 mr-2 translate-y-[-1px]" />
                )}
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 max-w-3xl px-8 md:px-16 lg:px-12 pb-32">
          {/* Page header */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-16 pt-4"
          >
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-3">
              Documentation
            </p>
            <h1 className="text-5xl md:text-6xl font-light tracking-tight mb-5">
              MCP Integration
              <br />
              <span className="text-white/35">Guide.</span>
            </h1>
            <p className="text-base font-light text-white/40 leading-relaxed max-w-xl">
              Connect your ORAG knowledge base to any MCP-compatible agent —
              Claude Code, Cursor, Windsurf, or your own custom pipeline.
            </p>
          </motion.div>

          {/* ── FEATURES ── */}
          <Reveal>
            <section id="features" className="mb-16 scroll-mt-28">
              <SectionHeading id="features">Features</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-8">
                ORAG gives your AI agents instant, secure access to everything your organisation knows —
                docs, wikis, runbooks, and more — via a single MCP endpoint.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <FeatureCard
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                  }
                  title="Semantic search"
                  description="Embedding-based vector search using Pinecone. Finds conceptually relevant chunks even when the exact keywords don't match."
                />
                <FeatureCard
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  }
                  title="Org-scoped security"
                  description="Every request is authenticated with a Bearer token and scoped to your organisation's slug. No cross-org data leakage possible."
                />
                <FeatureCard
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  }
                  title="Streaming responses"
                  description="Agent endpoint streams tokens via SSE so your UI stays responsive and users see results as they arrive."
                />
                <FeatureCard
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  }
                  title="MCP-native protocol"
                  description="Speaks standard Model Context Protocol over HTTP+SSE. Drop into Claude Code, Cursor, Windsurf, LangChain, or any custom agent without adapters."
                />
                <FeatureCard
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                  }
                  title="Multi-source ingestion"
                  description="Index documents from Notion, Confluence, Google Drive, GitHub, or direct uploads. All sources are unified into a single searchable index."
                />
                <FeatureCard
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                    </svg>
                  }
                  title="Real-time re-indexing"
                  description="Documents are re-embedded automatically on update. Your agents always search the freshest version of your knowledge base."
                />
              </div>

              <Callout type="tip">
                All features are available from day one — no tier upgrades required. Start with a free API key and scale as your document count grows.
              </Callout>
            </section>
          </Reveal>

          {/* ── HOW IT WORKS ── */}
          <Reveal>
            <section id="how-it-works" className="mb-16 scroll-mt-28">
              <SectionHeading id="how-it-works">How it works</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-10">
                From document upload to agent response in four steps.
              </p>

              <div className="mb-10">
                <Step
                  number="01"
                  title="Ingest your documents"
                  description="Connect a source (Notion, Google Drive, file upload, etc.) via the ORAG dashboard. Documents are chunked into overlapping segments optimised for retrieval."
                />
                <Step
                  number="02"
                  title="Embed & index"
                  description="Each chunk is run through an embedding model and stored in your org's Pinecone namespace with full metadata — title, source, page number, and timestamp."
                />
                <Step
                  number="03"
                  title="Connect your agent"
                  description="Point any MCP-compatible agent at your org's MCP URL with a Bearer token. The agent discovers the searchDocument tool automatically via the MCP handshake."
                />
                <Step
                  number="04"
                  title="Query at runtime"
                  description="When the agent calls searchDocument, ORAG embeds the query, runs a cosine similarity search, and returns the top-k ranked chunks in milliseconds — ready to be injected into the model's context window."
                  last
                />
              </div>

              {/* Architecture diagram */}
              <div className="border border-white/[0.08] rounded-lg p-6 bg-white/[0.02]">
                <p className="font-mono text-[9px] tracking-widest uppercase text-white/25 mb-5">
                  Architecture
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
                  {[
                    { label: "Your agent", sub: "Claude Code / Cursor / custom" },
                    null,
                    { label: "ORAG MCP server", sub: "/api/orgs/{slug}/mcp" },
                    null,
                    { label: "Pinecone", sub: "Vector index" },
                  ].map((item, i) =>
                    item === null ? (
                      <div key={i} className="text-white/20 font-mono text-xs hidden sm:block">→</div>
                    ) : (
                      <div
                        key={i}
                        className="border border-white/[0.08] rounded-lg px-4 py-3 bg-white/[0.03] min-w-[130px]"
                      >
                        <p className="text-xs font-light text-white/70 mb-1">{item.label}</p>
                        <p className="font-mono text-[9px] text-white/25 tracking-wide">{item.sub}</p>
                      </div>
                    )
                  )}
                </div>
                <div className="mt-5 pt-5 border-t border-white/[0.06]">
                  <p className="text-xs font-light text-white/35 leading-relaxed">
                    All traffic is HTTPS. The MCP server handles authentication, rate-limiting, and org isolation before
                    forwarding the embedded query to Pinecone. Results are ranked by cosine similarity and returned as
                    structured JSON chunks.
                  </p>
                </div>
              </div>
            </section>
          </Reveal>

          {/* ── OVERVIEW ── */}
          <Reveal>
            <section id="overview" className="mb-16 scroll-mt-28">
              <SectionHeading id="overview">Overview</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                ORAG exposes your organization's indexed documents as a{" "}
                <a
                  href="https://modelcontextprotocol.io"
                  className="text-white/70 underline underline-offset-2 hover:text-white transition-colors"
                >
                  Model Context Protocol (MCP)
                </a>{" "}
                server. Any agent that supports MCP — Claude Code, Cursor,
                Windsurf, LangChain, or a bespoke pipeline — can connect and
                call <IC>searchDocument</IC> to retrieve relevant context from
                your knowledge base.
              </p>
              <p className="text-sm font-light text-white/45 leading-relaxed">
                The MCP server is automatically scoped per organisation using the org slug in the URL
                and secured with the same JWT your frontend uses. Everything
                goes through HTTPS; no inbound firewall rules required.
              </p>
              <Callout type="tip">
                All examples below assume your ORAG instance is deployed at{" "}
                <IC>https://your-orag-instance.com</IC>. Replace this with your
                actual domain.
              </Callout>
            </section>
          </Reveal>

          {/* ── MCP URL FORMAT ── */}
          <Reveal>
            <section id="mcp-url" className="mb-16 scroll-mt-28">
              <SectionHeading id="mcp-url">MCP URL format</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                Every MCP endpoint is scoped to an organisation. The URL format is:
              </p>
              <CodeBlock lang="text">
                {`https://your-orag-instance.com/api/orgs/{slug}/mcp`}
              </CodeBlock>
              <p className="text-sm font-light text-white/45 leading-relaxed">
                The <IC>slug</IC> is the URL-safe identifier for your org (e.g.{" "}
                <IC>acme-corp</IC>).
              </p>
            </section>
          </Reveal>

          {/* ── AUTH ── */}
          <Reveal>
            <section id="auth" className="mb-16 scroll-mt-28">
              <SectionHeading id="auth">Authentication</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                Every request to the MCP server must include a valid Bearer
                token in the <IC>Authorization</IC> header. Use a long-lived API
                token generated from the dashboard, not a session JWT.
              </p>
              <CodeBlock lang="http">
                {`Authorization: Bearer orag_live_xxxxxxxxxxxxxxxxxxxx`}
              </CodeBlock>

              <SubHeading id="auth-token">Generating an API token</SubHeading>
              <ol className="space-y-2 text-sm font-light text-white/45 leading-relaxed list-decimal list-inside">
                <li>
                  Open your ORAG dashboard and navigate to{" "}
                  <IC>Settings → API Keys</IC>.
                </li>
                <li>
                  Click{" "}
                  <strong className="text-white/70 font-normal">
                    Generate new key
                  </strong>{" "}
                  and give it a descriptive label (e.g.{" "}
                  <IC>cursor-integration</IC>).
                </li>
                <li>Copy the key immediately — it won't be shown again.</li>
                <li>
                  Store it in your agent's secret store or <IC>.env</IC> file.
                </li>
              </ol>
              <Callout type="warning">
                API tokens grant full read access to your org's knowledge base.
                Rotate tokens immediately if they are ever exposed.
              </Callout>
            </section>
          </Reveal>

          {/* ── CLAUDE CODE ── */}
          <Reveal>
            <section id="claude-code" className="mb-16 scroll-mt-28">
              <SectionHeading id="claude-code">Claude Code</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                Claude Code supports MCP servers via its{" "}
                <IC>claude_code_config.json</IC> file (global) or a
                project-level <IC>.claude/config.json</IC>. Add an entry under{" "}
                <IC>mcpServers</IC>:
              </p>

              <SubHeading id="claude-code-global">Global config</SubHeading>
              <CodeBlock filename="~/.claude/claude_code_config.json" lang="json">
                {`{
  "mcpServers": {
    "orag": {
      "type": "http",
      "url": "https://your-orag-instance.com/api/orgs/acme-corp/mcp",
      "headers": {
        "Authorization": "Bearer orag_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}`}
              </CodeBlock>

              <SubHeading id="claude-code-project">Project-level config</SubHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-2">
                Commit a project-scoped config so every team member gets the
                same server automatically:
              </p>
              <CodeBlock filename=".claude/config.json" lang="json">
                {`{
  "mcpServers": {
    "orag": {
      "type": "http",
      "url": "https://your-orag-instance.com/api/orgs/acme-corp/mcp",
      "headers": {
        "Authorization": "Bearer \${process.env.ORAG_API_KEY}"
      }
    }
  }
}`}
              </CodeBlock>
              <Callout type="tip">
                Use an environment variable for the token so the key never lands
                in version control. Claude Code expands{" "}
                <IC>{"${process.env.VAR}"}</IC> at runtime.
              </Callout>

              <SubHeading id="claude-code-verify">Verify the connection</SubHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-2">
                After saving the config, restart Claude Code and run:
              </p>
              <CodeBlock lang="bash">
                {`# List available MCP tools
claude mcp list

# Expected output:
# orag  ·  searchDocument  ·  connected`}
              </CodeBlock>
            </section>
          </Reveal>

          {/* ── CURSOR ── */}
          <Reveal>
            <section id="cursor" className="mb-16 scroll-mt-28">
              <SectionHeading id="cursor">Cursor</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                Cursor supports MCP servers from version 0.43+. Open{" "}
                <IC>Cursor Settings → MCP</IC> and add the server, or edit the
                config file directly.
              </p>

              <SubHeading id="cursor-ui">Via Cursor Settings UI</SubHeading>
              <ol className="space-y-2 text-sm font-light text-white/45 leading-relaxed list-decimal list-inside mb-6">
                <li>
                  Open Cursor and press <IC>⌘ ,</IC> to open Settings.
                </li>
                <li>
                  Navigate to <IC>Features → MCP Servers</IC>.
                </li>
                <li>
                  Click{" "}
                  <strong className="text-white/70 font-normal">
                    Add new MCP server
                  </strong>
                  .
                </li>
                <li>Fill in the fields as below and click Save.</li>
              </ol>

              <SubHeading id="cursor-json">Via mcp.json</SubHeading>
              <CodeBlock filename="~/.cursor/mcp.json" lang="json">
                {`{
  "mcpServers": {
    "orag": {
      "url": "https://your-orag-instance.com/api/orgs/acme-corp/mcp",
      "headers": {
        "Authorization": "Bearer orag_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}`}
              </CodeBlock>

              <p className="text-sm font-light text-white/45 leading-relaxed">
                Once saved, Cursor's Composer will automatically include ORAG's{" "}
                <IC>searchDocument</IC> tool in the available tool palette.
                You'll see a <span className="text-white/65">🔌 orag</span> chip
                in the status bar when the server is connected.
              </p>

              <SubHeading id="cursor-rules">Cursor rules for auto-retrieval</SubHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-2">
                Add a rule to <IC>.cursorrules</IC> so the model always checks
                your knowledge base before answering:
              </p>
              <CodeBlock filename=".cursorrules" lang="text">
                {`When answering questions about our codebase, internal APIs, or product decisions:
1. Always call the orag.searchDocument tool first.
2. Pass relevant keywords from the user's question as the query.
3. If results are found, ground your answer in them and cite the document title.
4. If no results are found, say so and proceed with general knowledge.`}
              </CodeBlock>
            </section>
          </Reveal>

          {/* ── WINDSURF ── */}
          <Reveal>
            <section id="windsurf" className="mb-16 scroll-mt-28">
              <SectionHeading id="windsurf">Windsurf</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                Windsurf (by Codeium) supports MCP via{" "}
                <IC>~/.codeium/windsurf/mcp_config.json</IC>:
              </p>
              <CodeBlock filename="~/.codeium/windsurf/mcp_config.json" lang="json">
                {`{
  "mcpServers": {
    "orag": {
      "serverUrl": "https://your-orag-instance.com/api/orgs/acme-corp/mcp",
      "headers": {
        "Authorization": "Bearer orag_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}`}
              </CodeBlock>
              <Callout type="note">
                Windsurf uses the key <IC>serverUrl</IC> instead of <IC>url</IC>
                . Restart Windsurf after editing the config. The Cascade panel
                will display a green MCP indicator when connected.
              </Callout>
            </section>
          </Reveal>

          {/* ── CUSTOM AGENT ── */}
          <Reveal>
            <section id="custom-agent" className="mb-16 scroll-mt-28">
              <SectionHeading id="custom-agent">Custom agents</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                Connect directly from any LangChain, LlamaIndex, or raw HTTP
                agent. The MCP server speaks the standard SSE-based MCP
                protocol.
              </p>

              <SubHeading id="custom-langchain">LangChain (TypeScript)</SubHeading>
              <CodeBlock filename="agent.ts" lang="typescript">
                {`import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const mcpClient = new MultiServerMCPClient({
  orag: {
    transport: "http",
    url: "https://your-orag-instance.com/api/orgs/acme-corp/mcp",
    headers: {
      Authorization: \`Bearer \${process.env.ORAG_API_KEY}\`,
    },
  },
});

const tools = await mcpClient.getTools();

const model = new ChatAnthropic({ model: "claude-opus-4-5" });
const agent = createReactAgent({ llm: model, tools });

const result = await agent.invoke({
  messages: [{ role: "user", content: "Summarise our onboarding docs." }],
});

await mcpClient.close();`}
              </CodeBlock>

              <SubHeading id="custom-python">Python (MCP SDK)</SubHeading>
              <CodeBlock filename="agent.py" lang="python">
                {`import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    url = (
        "https://your-orag-instance.com"
        "/api/orgs/acme-corp/mcp"
    )
    headers = {"Authorization": "Bearer orag_live_xxxxxxxxxxxxxxxxxxxx"}

    async with sse_client(url, headers=headers) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print([t.name for t in tools.tools])  # ['searchDocument']

            # Call searchDocument
            result = await session.call_tool(
                "searchDocument",
                arguments={
                    "query": "API authentication flow",
                    "doc_ids": [],   # empty = search all docs
                    "top_k": 5,
                },
            )
            print(result.content[0].text)

asyncio.run(main())`}
              </CodeBlock>

              <SubHeading id="custom-http">Raw HTTP / curl</SubHeading>
              <CodeBlock lang="bash">
                {`# Initialise MCP session (SSE handshake)
curl -N \\
  -H "Authorization: Bearer orag_live_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Accept: text/event-stream" \\
  "https://your-orag-instance.com/api/orgs/acme-corp/mcp"

# Call searchDocument via JSON-RPC over SSE
# In practice, use a proper MCP client library for production use.`}
              </CodeBlock>
            </section>
          </Reveal>

          {/* ── AVAILABLE TOOLS ── */}
          <Reveal>
            <section id="tools" className="mb-16 scroll-mt-28">
              <SectionHeading id="tools">Available tools</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-6">
                The ORAG MCP server currently exposes one tool:
              </p>

              <div className="border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.02]">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07]">
                  <span className="font-mono text-sm text-white/80">searchDocument</span>
                  <span className="font-mono text-[9px] tracking-widest uppercase text-white/25 border border-white/[0.08] px-2 py-0.5 rounded">
                    tool
                  </span>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                    Searches the org's Pinecone vector store and returns the
                    most relevant document chunks ranked by cosine similarity.
                  </p>

                  <table className="w-full text-[12px] font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left text-white/30 font-normal py-2 pr-4 tracking-wider uppercase text-[9px]">Param</th>
                        <th className="text-left text-white/30 font-normal py-2 pr-4 tracking-wider uppercase text-[9px]">Type</th>
                        <th className="text-left text-white/30 font-normal py-2 tracking-wider uppercase text-[9px]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { param: "query", type: "string", req: true, desc: "Natural language query to embed and search against." },
                        { param: "doc_ids", type: "string[]", req: false, desc: "Restrict search to specific document IDs. Empty array searches all." },
                        { param: "top_k", type: "number", req: false, desc: "Number of chunks to return. Default: 5. Max: 20." },
                        { param: "threshold", type: "number", req: false, desc: "Minimum similarity score 0–1. Default: 0.7." },
                      ].map((row) => (
                        <tr key={row.param} className="border-b border-white/[0.04] last:border-0">
                          <td className="py-2.5 pr-4 text-white/70 align-top">
                            {row.param}
                            {row.req && <span className="text-red-400/60 ml-0.5">*</span>}
                          </td>
                          <td className="py-2.5 pr-4 text-white/35 align-top">{row.type}</td>
                          <td className="py-2.5 text-white/40 font-sans font-light align-top text-[12px]">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <SubHeading id="tools-response">Response shape</SubHeading>
              <CodeBlock lang="json">
                {`{
  "results": [
    {
      "chunk_id": "doc_abc123_chunk_4",
      "doc_id": "doc_abc123",
      "doc_title": "Engineering Onboarding Guide",
      "score": 0.921,
      "text": "...relevant chunk text...",
      "metadata": {
        "page": 3,
        "source": "notion",
        "updated_at": "2025-04-12T09:00:00Z"
      }
    }
  ],
  "total": 1,
  "query_embedding_ms": 38,
  "search_ms": 11
}`}
              </CodeBlock>
            </section>
          </Reveal>

          {/* ── STREAMING EVENTS ── */}
          <Reveal>
            <section id="streaming" className="mb-16 scroll-mt-28">
              <SectionHeading id="streaming">Streaming events</SectionHeading>
              <p className="text-sm font-light text-white/45 leading-relaxed mb-4">
                When calling the agent endpoint directly (
                <IC>/api/orgs/[slug]/agent</IC>), the response is a Server-Sent
                Events stream. Each event is a JSON object with a <IC>type</IC>{" "}
                field:
              </p>

              <div className="space-y-3">
                {[
                  { type: "token", desc: "Streamed text chunk from the model.", example: '{ "type": "token", "content": "The onboarding doc states..." }' },
                  { type: "tool_start", desc: "Agent is about to call a tool.", example: '{ "type": "tool_start", "name": "searchDocument", "input": { "query": "..." } }' },
                  { type: "tool_end", desc: "Tool call completed; raw output included.", example: '{ "type": "tool_end", "name": "searchDocument", "output": [...] }' },
                  { type: "done", desc: "Stream complete. No more events.", example: '{ "type": "done" }' },
                  { type: "error", desc: "An error occurred.", example: '{ "type": "error", "message": "Token expired" }' },
                ].map((ev) => (
                  <div key={ev.type} className="border border-white/[0.07] rounded-lg p-4 bg-white/[0.015]">
                    <div className="flex items-center gap-3 mb-2">
                      <IC>{ev.type}</IC>
                      <span className="text-xs font-light text-white/35">{ev.desc}</span>
                    </div>
                    <pre className="font-mono text-[11px] text-white/40 overflow-x-auto">{ev.example}</pre>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>

          {/* ── ERROR REFERENCE ── */}
          <Reveal>
            <section id="errors" className="mb-16 scroll-mt-28">
              <SectionHeading id="errors">Error reference</SectionHeading>

              <table className="w-full text-[12px] font-mono border-collapse border border-white/[0.08] rounded-lg overflow-hidden">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                    <th className="text-left text-white/30 font-normal py-3 px-4 tracking-wider uppercase text-[9px]">Status</th>
                    <th className="text-left text-white/30 font-normal py-3 px-4 tracking-wider uppercase text-[9px]">Message</th>
                    <th className="text-left text-white/30 font-normal py-3 px-4 tracking-wider uppercase text-[9px]">Cause</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { status: "401", msg: "Authentication required", cause: "Missing Authorization header." },
                    { status: "401", msg: "Token expired", cause: "JWT or API token has expired. Generate a new one." },
                    { status: "401", msg: "Invalid token", cause: "Malformed or tampered token." },
                    { status: "404", msg: "Org not found", cause: "The org slug is invalid or you are not a member of the org." },
                    { status: "400", msg: "'messages' array required", cause: "Agent endpoint requires at least one message." },
                    { status: "405", msg: "Method not allowed", cause: "Only POST is accepted." },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-white/[0.05] last:border-0">
                      <td className="py-3 px-4 text-white/60">{row.status}</td>
                      <td className="py-3 px-4 text-white/50">{row.msg}</td>
                      <td className="py-3 px-4 text-white/35 font-sans font-light text-[12px]">{row.cause}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </Reveal>

          {/* ── FOOTER CTA ── */}
          <Reveal>
            <div className="border border-white/[0.08] rounded-lg p-8 bg-white/[0.02] text-center relative overflow-hidden mt-8">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: "radial-gradient(ellipse 60% 60% at 50% 100%, rgba(255,255,255,0.03) 0%, transparent 70%)",
                }}
              />
              <p className="font-mono text-[9px] tracking-widest uppercase text-white/25 mb-3">
                Ready to connect?
              </p>
              <h3 className="text-2xl font-light tracking-tight mb-3">
                Your knowledge base is waiting.
              </h3>
              <p className="text-sm font-light text-white/35 max-w-sm mx-auto mb-6">
                Set up takes under five minutes. Generate an API key and paste
                the MCP URL into your agent config.
              </p>
              <button
                onClick={() => navigate("/auth")}
                className="bg-white text-black font-mono text-[11px] tracking-widest uppercase
                           px-7 py-3 rounded hover:bg-white/85 transition-opacity duration-150"
              >
                Get started free →
              </button>
            </div>
          </Reveal>
        </main>

        {/* ── RIGHT SPACER ── */}
        <div className="hidden xl:block w-16 shrink-0" />
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.07] px-8 md:px-20 lg:px-32 py-8 mt-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <svg width="14" height="14" viewBox="0 0 22 22" fill="none" className="opacity-35">
              <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="12" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="1" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="12" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" strokeDasharray="2 2" />
            </svg>
            <span className="text-sm font-light tracking-[0.2em] text-white/35">ORAG</span>
          </div>
          <div className="flex flex-wrap gap-5">
            {["Privacy", "Terms", "Docs", "Status", "GitHub"].map((l) => (
              <a
                key={l}
                href="#"
                className="font-mono text-[10px] tracking-widest uppercase text-white/20 hover:text-white/45 transition-colors duration-150"
              >
                {l}
              </a>
            ))}
          </div>
          <p className="font-mono text-[10px] tracking-widest text-white/15">
            © {new Date().getFullYear()} ORAG
          </p>
        </div>
      </footer>
    </div>
  );
}