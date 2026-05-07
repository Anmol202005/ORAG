import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useNavigate } from "react-router-dom";

// ── tiny reusable fade-in-up wrapper ──────────────────────────────────────────
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

// ── data ──────────────────────────────────────────────────────────────────────
const features = [
  {
    tag: "RAG Pipelines",
    title: "Retrieve what matters.",
    body: "Connect your org's documents, wikis, and databases into a unified retrieval layer. ORAG indexes, chunks, and embeds everything so your models always have the right context.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="1" y="1" width="8" height="8" rx="1.2" stroke="white" strokeWidth="1.1" />
        <rect x="11" y="1" width="8" height="8" rx="1.2" stroke="white" strokeWidth="1.1" strokeDasharray="2 1.5" />
        <rect x="1" y="11" width="8" height="8" rx="1.2" stroke="white" strokeWidth="1.1" strokeDasharray="2 1.5" />
        <rect x="11" y="11" width="8" height="8" rx="1.2" stroke="white" strokeWidth="1.1" />
        <line x1="9" y1="5" x2="11" y2="5" stroke="white" strokeWidth="1.1" />
        <line x1="5" y1="9" x2="5" y2="11" stroke="white" strokeWidth="1.1" />
        <line x1="15" y1="9" x2="15" y2="11" stroke="white" strokeWidth="1.1" />
        <line x1="9" y1="15" x2="11" y2="15" stroke="white" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    tag: "MCP Servers",
    title: "One protocol, every tool.",
    body: "Spin up Model Context Protocol servers that give your agents structured, permissioned access to internal APIs, code repos, CRMs, and more — without bespoke glue code.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8.5" stroke="white" strokeWidth="1.1" />
        <circle cx="10" cy="10" r="3" stroke="white" strokeWidth="1.1" />
        <line x1="10" y1="1.5" x2="10" y2="7" stroke="white" strokeWidth="1.1" />
        <line x1="10" y1="13" x2="10" y2="18.5" stroke="white" strokeWidth="1.1" />
        <line x1="1.5" y1="10" x2="7" y2="10" stroke="white" strokeWidth="1.1" />
        <line x1="13" y1="10" x2="18.5" y2="10" stroke="white" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    tag: "Access Control",
    title: "Org-grade permissions.",
    body: "Role-based access across every knowledge base and MCP server. Audit logs, team workspaces, and SSO keep enterprise compliance teams happy.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="4" y="9" width="12" height="9" rx="1.5" stroke="white" strokeWidth="1.1" />
        <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="10" cy="14" r="1.2" fill="white" />
      </svg>
    ),
  },
  {
    tag: "Observability",
    title: "Every call, traced.",
    body: "Full request tracing across retrievals, tool calls, and completions. Latency breakdowns, token usage, and retrieval quality scores — all in one view.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <polyline points="2,14 6,9 9,12 13,6 18,10" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="2" y1="17" x2="18" y2="17" stroke="white" strokeWidth="1.1" strokeOpacity="0.3" />
      </svg>
    ),
  },
];

const steps = [
  { num: "01", title: "Connect sources", body: "Link Notion, Confluence, S3, GitHub, or any custom data source." },
  { num: "02", title: "Configure pipelines", body: "Choose chunking strategy, embedding model, and retrieval parameters." },
  { num: "03", title: "Expose via MCP", body: "Your retrieval layer becomes a typed MCP server your agents can call." },
  { num: "04", title: "Ship to production", body: "Deploy with one click. Monitor latency and quality from the dashboard." },
];

const stats = [
  { value: "< 50ms", label: "Median retrieval latency" },
  { value: "10k+", label: "Documents indexed per minute" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "SOC 2", label: "Type II certified" },
];

// ── Terminal code lines ────────────────────────────────────────────────────────
// Rendered as proper syntax-highlighted spans, no JSX string interpolation issues
function TerminalSnippet() {
  return (
    <pre className="px-5 py-5 text-[12px] font-mono leading-6 overflow-x-auto">
      <span className="text-white/25">
        {"// ~/.claude/claude_code_config.json"}
      </span>

      {"\n"}

      <span className="text-white/50">{"{"}</span>

      {"\n"}
      {"  "}
      <span className="text-white/55">{"\"mcpServers\""}</span>
      <span className="text-white/30">{": {"}</span>

      {"\n"}
      {"    "}
      <span className="text-white/55">{"\"orag\""}</span>
      <span className="text-white/30">{": {"}</span>

      {"\n"}
      {"      "}
      <span className="text-white/55">{"\"type\""}</span>
      <span className="text-white/30">{": "}</span>
      <span className="text-white/65">{'"http"'}</span>
      <span className="text-white/30">{","}</span>

      {"\n"}
      {"      "}
      <span className="text-white/55">{"\"url\""}</span>
      <span className="text-white/30">{": "}</span>
      <span className="text-white/65">
        {
          '"https://your-orag-instance.com/api/orgs/acme-corp/mcp"'
        }
      </span>
      <span className="text-white/30">{","}</span>

      {"\n"}
      {"      "}
      <span className="text-white/55">{"\"headers\""}</span>
      <span className="text-white/30">{": {"}</span>

      {"\n"}
      {"        "}
      <span className="text-white/55">{"\"Authorization\""}</span>
      <span className="text-white/30">{": "}</span>
      <span className="text-white/65">
        {'"Bearer orag_live_xxxxxxxxxxxxxxxxxxxx"'}
      </span>

      {"\n"}
      {"      "}
      <span className="text-white/30">{"}"}</span>

      {"\n"}
      {"    "}
      <span className="text-white/30">{"}"}</span>

      {"\n"}
      {"  "}
      <span className="text-white/30">{"}"}</span>

      {"\n"}
      <span className="text-white/50">{"}"}</span>
    </pre>
  );
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">

      {/* ── Background grid ── */}
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

      {/* ── Top radial glow ── */}
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 z-0"
        style={{
          height: "50vh",
          background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)",
        }}
      />

      {/* ══════════════════════════════════════════
          NAV
      ══════════════════════════════════════════ */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between
                    px-8 md:px-20 lg:px-32 py-5 transition-all duration-300
                    ${scrolled ? " bg-[#0a0a0a]/80 backdrop-blur-md" : ""}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" className="opacity-60">
            <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
            <rect x="12" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
            <rect x="1" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
            <rect x="12" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" strokeDasharray="2 2" />
          </svg>
          <span className="text-lg font-light tracking-[0.2em] text-white">ORAG</span>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-8">
          {["Features", "How it works", "Docs"].map((label) => (
            <a
              key={label}
              href={label === "Docs" ? "/docs" : "#"}
              className="font-mono text-[10px] tracking-widest uppercase text-white/35
                         hover:text-white/70 transition-colors duration-150"
            >
              {label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate("/auth")}
          className="font-mono text-[10px] tracking-widest uppercase text-white
                     border border-white/[0.15] bg-white/[0.05] px-4 py-2 rounded
                     hover:bg-white/[0.10] hover:border-white/25 transition-all duration-150"
        >
          Sign in →
        </button>
      </motion.nav>

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center
                           px-6 text-center pt-24 pb-32">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="inline-flex items-center gap-2 border border-white/[0.10] bg-white/[0.04]
                     rounded-full px-4 py-1.5 mb-10"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
          <span className="font-mono text-[10px] tracking-widest uppercase text-white/40">
            Now in early access
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl md:text-7xl lg:text-8xl font-light tracking-tight leading-[1.05] mb-6 max-w-4xl"
        >
          Your org's knowledge,<br />
          <span className="text-white/40">ready for any model.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="text-base md:text-lg font-light text-white/40 max-w-xl leading-relaxed mb-12"
        >
          ORAG is an organizational RAG and MCP platform that connects your internal
          data to AI pipelines — with enterprise access controls built in from day one.
        </motion.p>

        {/* CTA group */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.36 }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          <button
            onClick={() => navigate("/auth")}
            className="bg-white text-black font-mono text-[11px] tracking-widest uppercase
                       px-7 py-3 rounded hover:bg-white/85 transition-opacity duration-150"
          >
            Get started free →
          </button>
          <a
            href="/docs"
            className="font-mono text-[11px] tracking-widest uppercase text-white/35
                       border border-white/[0.08] px-7 py-3 rounded
                       hover:text-white/55 hover:border-white/15 transition-all duration-150"
          >
            Read the docs
          </a>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
        >
          <span className="font-mono text-[9px] tracking-widest uppercase text-white/20">Scroll</span>
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="w-px h-6 bg-gradient-to-b from-white/20 to-transparent"
          />
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════ */}
      <section className="relative z-10 border-y border-white/[0.07] px-8 md:px-20 lg:px-32 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.07}>
              <p className="text-2xl md:text-3xl font-light tracking-tight mb-1">{s.value}</p>
              <p className="font-mono text-[10px] tracking-widest uppercase text-white/30">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════ */}
      <section className="relative z-10 px-8 md:px-20 lg:px-32 py-28">
        <Reveal className="mb-16">
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-3">
            Platform
          </p>
          <h2 className="text-4xl md:text-5xl font-light tracking-tight max-w-lg">
            Everything your AI stack needs.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-px border border-white/[0.07] rounded-lg overflow-hidden">
          {features.map((f, i) => (
            <Reveal key={f.tag} delay={i * 0.08}>
              <div className="group p-8 bg-white/[0.015] hover:bg-white/[0.035] transition-colors duration-200
                              border-white/[0.07] h-full">
                <div className="flex items-center gap-3 mb-5">
                  <span className="opacity-50 group-hover:opacity-80 transition-opacity duration-200">
                    {f.icon}
                  </span>
                  <span className="font-mono text-[10px] tracking-widest uppercase text-white/35">
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-xl font-light tracking-tight mb-3">{f.title}</h3>
                <p className="text-sm font-light text-white/40 leading-relaxed">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════ */}
      <section className="relative z-10 px-8 md:px-20 lg:px-32 py-28 border-t border-white/[0.07]">
        <Reveal className="mb-16">
          <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-3">
            How it works
          </p>
          <h2 className="text-4xl md:text-5xl font-light tracking-tight max-w-lg">
            From source to inference<br />
            <span className="text-white/35">in four steps.</span>
          </h2>
        </Reveal>

        <div className="space-y-0 divide-y divide-white/[0.06]">
          {steps.map((s, i) => (
            <Reveal key={s.num} delay={i * 0.07}>
              <div className="group flex items-start gap-10 py-8 hover:bg-white/[0.02]
                              -mx-4 px-4 transition-colors duration-150">
                <span className="font-mono text-[11px] tracking-widest text-white/20 mt-0.5 shrink-0 w-8">
                  {s.num}
                </span>
                <div className="flex-1">
                  <h4 className="text-lg font-light mb-1.5">{s.title}</h4>
                  <p className="text-sm font-light text-white/35 leading-relaxed">{s.body}</p>
                </div>
                <span className="font-mono text-[11px] text-white/15 group-hover:text-white/35
                                 transition-colors duration-150 shrink-0 mt-0.5">
                  →
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          TERMINAL SNIPPET
      ══════════════════════════════════════════ */}
      <section className="relative z-10 px-8 md:px-20 lg:px-32 py-20 border-t border-white/[0.07]">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <Reveal>
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-3">
              Developer first
            </p>
            <h2 className="text-3xl md:text-4xl font-light tracking-tight mb-5">
              MCP in minutes,<br />not months.
            </h2>
            <p className="text-sm font-light text-white/40 leading-relaxed mb-8 max-w-sm">
              One config file is all it takes to expose your entire knowledge
              base as a fully typed MCP server — complete with streaming,
              auth, and observability out of the box.
            </p>
            <a
              href="/docs"
              className="font-mono text-[10px] tracking-widest uppercase text-white/40
                         border border-white/[0.10] px-4 py-2.5 rounded inline-block
                         hover:text-white/70 hover:border-white/20 transition-all duration-150"
            >
              View documentation →
            </a>
          </Reveal>

          {/* Terminal */}
          <Reveal delay={0.1}>
            <div className="border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.02]">
              {/* Terminal bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="font-mono text-[10px] text-white/20 ml-2 tracking-wider">
                  orag.config.ts
                </span>
              </div>
              <TerminalSnippet />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA BANNER
      ══════════════════════════════════════════ */}
      <section className="relative z-10 px-8 md:px-20 lg:px-32 py-28 border-t border-white/[0.07]">
        <Reveal>
          <div className="border border-white/[0.08] rounded-lg p-12 md:p-16 bg-white/[0.02] text-center
                          relative overflow-hidden">
            {/* Inner glow */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: "radial-gradient(ellipse 60% 60% at 50% 100%, rgba(255,255,255,0.04) 0%, transparent 70%)",
              }}
            />
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-4">
              Early access
            </p>
            <h2 className="text-4xl md:text-5xl font-light tracking-tight mb-5 max-w-xl mx-auto">
              Start building with ORAG today.
            </h2>
            <p className="text-sm font-light text-white/35 max-w-md mx-auto mb-10 leading-relaxed">
              Get your organization's knowledge base production-ready in under
              an hour. No infrastructure to manage.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="bg-white text-black font-mono text-[11px] tracking-widest uppercase
                         px-8 py-3.5 rounded hover:bg-white/85 transition-opacity duration-150"
            >
              Get started free →
            </button>
          </div>
        </Reveal>
      </section>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.07] px-8 md:px-20 lg:px-32 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none" className="opacity-40">
              <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="12" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="1" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="12" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" strokeDasharray="2 2" />
            </svg>
            <span className="text-sm font-light tracking-[0.2em] text-white/40">ORAG</span>
          </div>

          <div className="flex flex-wrap gap-6">
            {["Privacy", "Terms", "Docs", "Status", "GitHub"].map((l) => (
              <a
                key={l}
                href={l === "Docs" ? "/docs" : "#"}
                className="font-mono text-[10px] tracking-widest uppercase text-white/25
                           hover:text-white/50 transition-colors duration-150"
              >
                {l}
              </a>
            ))}
          </div>

          <p className="font-mono text-[10px] tracking-widest text-white/20">
            © {new Date().getFullYear()} ORAG
          </p>
        </div>
      </footer>

    </div>
  );
}