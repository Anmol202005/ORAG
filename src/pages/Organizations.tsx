import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Org {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  role?: "owner" | "admin" | "member";
  sources?: number;
  mcpServers?: number;
  isPublic?: boolean;
  description?: string;
  tags?: string[];
}

interface Me {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OrgInitial({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-md border border-white/[0.10] bg-white/[0.05]
                 flex items-center justify-center shrink-0"
    >
      <span className="font-mono text-[11px] tracking-widest text-white/50">
        {initials}
      </span>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  return (
    <span
      className="font-mono text-[9px] tracking-widest uppercase
                 border border-white/[0.08] text-white/30 px-2 py-0.5 rounded-full"
    >
      {role}
    </span>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span
      className="font-mono text-[9px] tracking-widest uppercase
                 border border-white/[0.07] bg-white/[0.03] text-white/25
                 px-2 py-0.5 rounded-full"
    >
      {label}
    </span>
  );
}

function UserAvatar({ user }: { user: Me }) {
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        className="w-8 h-8 rounded-full border border-white/[0.10] object-cover"
      />
    );
  }

  return (
    <div
      className="w-8 h-8 rounded-full border border-white/[0.10] bg-white/[0.06]
                    flex items-center justify-center"
    >
      <span className="font-mono text-[11px] text-white/50">{initials}</span>
    </div>
  );
}

// ── Create Org Modal ──────────────────────────────────────────────────────────
interface CreateOrgModalProps {
  onClose: () => void;
  onCreated: (org: Org) => void;
}

function CreateOrgModal({ onClose, onCreated }: CreateOrgModalProps) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    isPublic: false,
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toSlug = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const handleName = (v: string) => {
    setForm((f) => ({
      ...f,
      name: v,
      slug: slugEdited ? f.slug : toSlug(v),
    }));
  };

  const handleCreate = async () => {
    setError(null);
    setLoading(true);

    const token = localStorage.getItem("auth_token");

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug,
          description: form.description.trim(),
          isPublic: form.isPublic,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      onCreated({
        id: data.org.id,
        name: data.org.name,
        slug: data.org.slug,
        description: data.org.description,
        isPublic: data.org.isPublic,
        memberCount: data.org.memberCount,
        sources: data.org.sources,
        mcpServers: data.org.mcpServers,
        role: data.org.role,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md border border-white/[0.10] rounded-lg
                   bg-[#0e0e0e] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-7">
          <div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-1.5">
              New organization
            </p>
            <h2 className="text-2xl font-light tracking-tight">
              Create workspace
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="font-mono text-[11px] text-white/25 hover:text-white/60
                       border border-white/[0.08] px-2.5 py-1 rounded transition-colors duration-150
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="font-mono text-[10px] tracking-widest uppercase text-white/30 block mb-2">
              Organization name
            </label>
            <input
              type="text"
              placeholder="Acme Engineering"
              value={form.name}
              onChange={(e) => handleName(e.target.value)}
              disabled={loading}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-4 py-2.5
                         text-sm font-light text-white placeholder-white/20 outline-none
                         focus:border-white/20 transition-colors duration-150
                         disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-widest uppercase text-white/30 block mb-2">
              URL slug
            </label>
            <div
              className="flex items-center border border-white/[0.08] rounded-md overflow-hidden
                            focus-within:border-white/20 transition-colors duration-150"
            >
              <span className="font-mono text-[11px] text-white/20 px-3 py-2.5 bg-white/[0.02] border-r border-white/[0.07] shrink-0">
                orag.app/
              </span>
              <input
                type="text"
                placeholder="acme-eng"
                value={form.slug}
                disabled={loading}
                onChange={(e) => {
                  setSlugEdited(true);
                  setForm((f) => ({ ...f, slug: toSlug(e.target.value) }));
                }}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm font-light text-white
                           placeholder-white/20 outline-none
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-widest uppercase text-white/30 block mb-2">
              Description{" "}
              <span className="text-white/15 normal-case tracking-normal">
                (optional)
              </span>
            </label>
            <textarea
              rows={3}
              placeholder="What does this organization do?"
              value={form.description}
              disabled={loading}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-4 py-2.5
                         text-sm font-light text-white placeholder-white/20 outline-none resize-none
                         focus:border-white/20 transition-colors duration-150
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <label className="flex items-center justify-between cursor-pointer group">
            <div>
              <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-0.5">
                Public organization
              </p>
              <p className="text-xs font-light text-white/25">
                Anyone can discover and request to join
              </p>
            </div>
            <div
              onClick={() =>
                !loading && setForm((f) => ({ ...f, isPublic: !f.isPublic }))
              }
              className={`relative rounded-full border transition-all duration-200 cursor-pointer
                          ${form.isPublic ? "bg-white/20 border-white/30" : "bg-white/[0.04] border-white/[0.10]"}
                          ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              style={{ height: 22, width: 40 }}
            >
              <motion.div
                animate={{ x: form.isPublic ? 18 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className="absolute top-[3px] w-4 h-4 rounded-full bg-white/60"
              />
            </div>
          </label>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-5 border border-red-500/20 bg-red-500/[0.06] rounded-md px-4 py-3"
            >
              <p className="font-mono text-[11px] text-red-400/80 tracking-wider">
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="border-t border-white/[0.07] my-7" />

        <div className="flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={!form.name || !form.slug || loading}
            className="flex-1 bg-white text-black font-mono text-[11px] tracking-widest uppercase
                       py-2.5 rounded hover:bg-white/85 transition-opacity duration-150
                       disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
              >
                Creating…
              </motion.span>
            ) : (
              "Create organization"
            )}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="font-mono text-[11px] tracking-widest uppercase text-white/35
                       border border-white/[0.08] px-4 py-2.5 rounded
                       hover:text-white/55 hover:border-white/15 transition-all duration-150
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Organizations() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  // ── Join state ──
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});

  // ── User state ──
  const [user, setUser] = useState<Me | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  // ── My orgs state ──
  const [myOrgs, setMyOrgs] = useState<Org[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  // ── Public orgs state ──
  const [publicOrgs, setPublicOrgs] = useState<Org[]>([]);
  const [publicOrgsLoading, setPublicOrgsLoading] = useState(true);
  const [publicOrgsError, setPublicOrgsError] = useState<string | null>(null);

  // ── Sync joined set with myOrgs so already-member orgs show "Joined" in public list ──
  useEffect(() => {
    if (myOrgs.length > 0) {
      setJoined((prev) => new Set([...prev, ...myOrgs.map((o) => o.id)]));
    }
  }, [myOrgs]);

  // ── Fetch current user ──
  useEffect(() => {
    const fetchMe = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        navigate("/");
        return;
      }
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("auth_token");
          navigate("/");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed: ${res.status}`);
        }
        const data: Me = await res.json();
        setUser(data);
      } catch (err) {
        setUserError(
          err instanceof Error ? err.message : "Failed to load user",
        );
      } finally {
        setUserLoading(false);
      }
    };

    fetchMe();
  }, [navigate]);

  // ── Fetch user's organizations ──
  useEffect(() => {
    const fetchMyOrgs = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) return;

      try {
        const res = await fetch("/api/orgs/mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("auth_token");
          navigate("/");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed: ${res.status}`);
        }
        const data = await res.json();
        setMyOrgs(data.orgs);
      } catch (err) {
        setOrgsError(
          err instanceof Error ? err.message : "Failed to load organizations",
        );
      } finally {
        setOrgsLoading(false);
      }
    };

    fetchMyOrgs();
  }, [navigate]);

  // ── Fetch public organizations ──
  useEffect(() => {
    const fetchPublicOrgs = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/orgs/public", { headers });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed: ${res.status}`);
        }
        const data = await res.json();
        setPublicOrgs(data.orgs);
      } catch (err) {
        setPublicOrgsError(
          err instanceof Error
            ? err.message
            : "Failed to load public organizations",
        );
      } finally {
        setPublicOrgsLoading(false);
      }
    };

    fetchPublicOrgs();
  }, []);

  // ── Prepend newly created org to the list ──
  const handleOrgCreated = (newOrg: Org) => {
    setMyOrgs((prev) => [newOrg, ...prev]);
  };

  // ── Filter public orgs client-side ──
  const filteredPublic = publicOrgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.description?.toLowerCase().includes(search.toLowerCase()) ||
      o.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase())),
  );

  // ── Join organization ──
  const handleJoin = async (id: string) => {
    setJoining(id);
    setJoinErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const token = localStorage.getItem("auth_token");

    try {
      const res = await fetch(`/api/orgs/join?id=${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();

      if (!res.ok) {
        // 409 = already a member — treat as success silently
        if (res.status === 409) {
          setJoined((prev) => new Set([...prev, id]));
          return;
        }
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      setJoined((prev) => new Set([...prev, id]));

      // Optimistically increment member count in the list
      setPublicOrgs((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, memberCount: o.memberCount + 1 } : o,
        ),
      );
    } catch (err) {
      setJoinErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Failed to join",
      }));
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="relative min-h-screen text-white">
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

      {/* ── Nav ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between
                      px-8 md:px-20 lg:px-32 py-5 border-b border-white/[0.07]
                      bg-[#0a0a0a]/80 backdrop-blur-md"
      >
        <div className="flex items-center gap-2.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 22 22"
            fill="none"
            className="opacity-60"
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
          <span className="text-lg font-light tracking-[0.2em] text-white">
            ORAG
          </span>
        </div>

        <div className="flex items-center gap-3">
          {userLoading ? (
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="w-32 h-4 rounded bg-white/[0.07]"
            />
          ) : userError ? (
            <span className="font-mono text-[10px] text-red-400/60 tracking-wider">
              {userError}
            </span>
          ) : user ? (
            <>
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-light text-white/70">
                  {user.name}
                </span>
                <span className="font-mono text-[10px] text-white/25 tracking-wider">
                  {user.email}
                </span>
              </div>
              <UserAvatar user={user} />
            </>
          ) : null}

          <button
            onClick={() => {
              localStorage.removeItem("auth_token");
              navigate("/");
            }}
            className="font-mono text-[10px] tracking-widest uppercase text-white/25
             border border-white/[0.07] px-3 py-1.5 rounded
             hover:text-white/50 hover:border-white/15 transition-all duration-150"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Page body ── */}
      <main className="relative z-10 px-8 md:px-20 lg:px-32 pt-28 pb-24">
        {/* ── Page header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-end justify-between border-b border-white/[0.08] pb-8 mb-12"
        >
          <div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30 mb-3">
              Workspaces
            </p>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight">
              Organizations
            </h1>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-white text-black font-mono text-[11px]
                       tracking-widest uppercase px-5 py-2.5 rounded
                       hover:bg-white/85 transition-opacity duration-150"
          >
            <span className="text-base leading-none">+</span>
            <span>New org</span>
          </button>
        </motion.div>

        {/* ══════════════════════════════════════════
            MY ORGANIZATIONS
        ══════════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="mb-16"
        >
          <div className="flex items-center justify-between mb-5">
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30">
              My organizations
              {!orgsLoading && (
                <span
                  className="ml-2 font-mono text-[9px] text-white/20 bg-white/[0.05]
                                 border border-white/[0.07] px-1.5 py-0.5 rounded-full"
                >
                  {myOrgs.length}
                </span>
              )}
            </p>
          </div>

          {orgsLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px border border-white/[0.07] rounded-lg overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white/[0.015] p-6">
                  <div className="flex items-start gap-3 mb-5">
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.2,
                        delay: i * 0.15,
                      }}
                      className="w-9 h-9 rounded-md bg-white/[0.07]"
                    />
                    <div className="flex-1 space-y-2">
                      <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.15,
                        }}
                        className="h-3.5 w-32 rounded bg-white/[0.07]"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.15 + 0.1,
                        }}
                        className="h-3 w-14 rounded-full bg-white/[0.05]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-5 pt-4 border-t border-white/[0.06]">
                    {[0, 1, 2].map((j) => (
                      <motion.div
                        key={j}
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.15 + j * 0.05,
                        }}
                        className="h-8 w-10 rounded bg-white/[0.05]"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : orgsError ? (
            <div className="border border-white/[0.07] rounded-lg px-6 py-10 text-center">
              <p className="font-mono text-[11px] text-red-400/60 tracking-widest">
                {orgsError}
              </p>
            </div>
          ) : myOrgs.length === 0 ? (
            <p className="font-mono text-[11px] text-white/20 py-10 text-center tracking-widest">
              You haven't joined any organizations yet
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px border border-white/[0.07] rounded-lg overflow-hidden">
              <AnimatePresence>
                {myOrgs.map((org, i) => (
                  <motion.div
                    key={org.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.35, delay: i * 0.04 }}
                    onClick={() => navigate(`/org/${org.slug}`)}
                    className="group relative bg-white/[0.015] hover:bg-white/[0.04]
                               transition-colors duration-200 p-6 cursor-pointer"
                  >
                    <span
                      className="absolute top-5 right-5 font-mono text-[11px] text-white/0
                                     group-hover:text-white/30 transition-colors duration-200"
                    >
                      →
                    </span>

                    <div className="flex items-start gap-3 mb-5">
                      <OrgInitial name={org.name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-light truncate mb-1">
                          {org.name}
                        </p>
                        <RolePill role={org.role!} />
                      </div>
                    </div>

                    <div className="flex items-center gap-5 pt-4 border-t border-white/[0.06]">
                      <div>
                        <p className="text-base font-light">
                          {org.sources ?? 0}
                        </p>
                        <p className="font-mono text-[9px] tracking-widest uppercase text-white/25">
                          Sources
                        </p>
                      </div>
                      <div className="w-px h-6 bg-white/[0.06]" />
                      <div>
                        <p className="text-base font-light">
                          {org.mcpServers ?? 0}
                        </p>
                        <p className="font-mono text-[9px] tracking-widest uppercase text-white/25">
                          MCP Servers
                        </p>
                      </div>
                      <div className="w-px h-6 bg-white/[0.06]" />
                      <div>
                        <p className="text-base font-light">
                          {org.memberCount}
                        </p>
                        <p className="font-mono text-[9px] tracking-widest uppercase text-white/25">
                          Members
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Create new — ghost card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: 0.1 + myOrgs.length * 0.04,
                }}
                onClick={() => setShowCreate(true)}
                className="group bg-white/[0.01] hover:bg-white/[0.03] transition-colors duration-200
                           p-6 cursor-pointer flex flex-col items-center justify-center gap-3
                           border-dashed border border-white/[0.07] rounded-sm min-h-[140px]"
              >
                <span
                  className="w-9 h-9 rounded-md border border-white/[0.10] bg-white/[0.04]
                                 flex items-center justify-center text-white/30 text-xl font-light
                                 group-hover:border-white/20 group-hover:text-white/50
                                 transition-all duration-200"
                >
                  +
                </span>
                <p
                  className="font-mono text-[10px] tracking-widest uppercase text-white/25
                               group-hover:text-white/45 transition-colors duration-200"
                >
                  Create organization
                </p>
              </motion.div>
            </div>
          )}
        </motion.section>

        {/* ══════════════════════════════════════════
            PUBLIC ORGANIZATIONS
        ══════════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <p className="font-mono text-[10px] tracking-widest uppercase text-white/30">
              Discover public organizations
              {!publicOrgsLoading && (
                <span
                  className="ml-2 font-mono text-[9px] text-white/20 bg-white/[0.05]
                                 border border-white/[0.07] px-1.5 py-0.5 rounded-full"
                >
                  {filteredPublic.length}
                </span>
              )}
            </p>

            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 opacity-25"
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4.5"
                  stroke="white"
                  strokeWidth="1.2"
                />
                <line
                  x1="9.5"
                  y1="9.5"
                  x2="13"
                  y2="13"
                  stroke="white"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                placeholder="Search organizations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-md pl-8 pr-4 py-2
                           font-mono text-[11px] text-white placeholder-white/20 outline-none
                           focus:border-white/20 transition-colors duration-150 w-56"
              />
            </div>
          </div>

          <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-lg overflow-hidden">
            {publicOrgsLoading ? (
              <div className="divide-y divide-white/[0.06]">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-5 px-6 py-5 bg-white/[0.01]"
                  >
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.2,
                        delay: i * 0.15,
                      }}
                      className="w-9 h-9 rounded-md bg-white/[0.07] shrink-0"
                    />
                    <div className="flex-1 space-y-2">
                      <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.15,
                        }}
                        className="h-3.5 w-40 rounded bg-white/[0.07]"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.15 + 0.1,
                        }}
                        className="h-3 w-72 rounded bg-white/[0.05]"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: i * 0.15 + 0.15,
                        }}
                        className="h-2.5 w-20 rounded bg-white/[0.04]"
                      />
                    </div>
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.2,
                        delay: i * 0.15,
                      }}
                      className="h-7 w-16 rounded bg-white/[0.05] shrink-0"
                    />
                  </div>
                ))}
              </div>
            ) : publicOrgsError ? (
              <div className="px-6 py-10 text-center">
                <p className="font-mono text-[11px] text-red-400/60 tracking-widest">
                  {publicOrgsError}
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredPublic.length === 0 ? (
                  <p className="font-mono text-[11px] text-white/20 py-12 text-center tracking-widest">
                    {search
                      ? "No organizations match your search"
                      : "No public organizations yet"}
                  </p>
                ) : (
                  filteredPublic.map((org, i) => {
                    const isJoined = joined.has(org.id);
                    const isJoining = joining === org.id;
                    return (
                      <motion.div
                        key={org.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                        className="group flex items-center gap-5 px-6 py-5
                                   bg-white/[0.01] hover:bg-white/[0.03]
                                   transition-colors duration-150"
                      >
                        <OrgInitial name={org.name} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                            <p className="text-[15px] font-light">{org.name}</p>
                            {org.tags?.map((t) => (
                              <Tag key={t} label={t} />
                            ))}
                          </div>
                          <p className="text-xs font-light text-white/35 leading-relaxed mb-1.5 max-w-xl">
                            {org.description}
                          </p>
                          <p className="font-mono text-[10px] text-white/20 tracking-wider">
                            {org.memberCount.toLocaleString()} members
                          </p>
                        </div>

                        {/* ── Join / Joined button + per-org error ── */}
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          {isJoined ? (
                            <span
                              className="font-mono text-[10px] tracking-widest uppercase
                                         text-white/30 border border-white/[0.08] px-3 py-1.5 rounded"
                            >
                              ✓ Joined
                            </span>
                          ) : (
                            <button
                              onClick={() => handleJoin(org.id)}
                              disabled={isJoining}
                              className="font-mono text-[10px] tracking-widest uppercase
                                         text-white/50 border border-white/[0.12] px-4 py-1.5 rounded
                                         hover:bg-white/[0.07] hover:border-white/25 hover:text-white/80
                                         transition-all duration-150 disabled:opacity-40 min-w-[80px]"
                            >
                              {isJoining ? (
                                <motion.span
                                  animate={{ opacity: [1, 0.3, 1] }}
                                  transition={{
                                    repeat: Infinity,
                                    duration: 0.9,
                                  }}
                                >
                                  …
                                </motion.span>
                              ) : (
                                "Join →"
                              )}
                            </button>
                          )}

                          <AnimatePresence>
                            {joinErrors[org.id] && (
                              <motion.p
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.2 }}
                                className="font-mono text-[9px] text-red-400/60 tracking-wider
                                           max-w-[120px] text-right leading-relaxed"
                              >
                                {joinErrors[org.id]}
                              </motion.p>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            )}
          </div>
        </motion.section>
      </main>

      {/* ── Create org modal ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateOrgModal
            onClose={() => setShowCreate(false)}
            onCreated={handleOrgCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
