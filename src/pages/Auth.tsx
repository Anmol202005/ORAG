import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Auth() {
  const [mounted, setMounted] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const gisReady = useRef(false);

  useEffect(() => {
    setMounted(true);

    const scriptId = "google-gis-script";

    function waitForGIS() {
      // Poll until window.google.accounts.id is actually populated
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGISResponse,
            // FedCM is now mandatory (post Aug 2025), no flag needed
          });
          gisReady.current = true;
        }
      }, 100);

      // Give up after 10 seconds
      setTimeout(() => {
        clearInterval(interval);
        if (!gisReady.current) {
          setError("Google Sign-In failed to load. Please refresh.");
        }
      }, 10000);
    }

    if (document.getElementById(scriptId)) {
      // Script tag exists — but window.google may or may not be ready yet
      waitForGIS();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = waitForGIS; // wait for window.google to populate AFTER load
    script.onerror = () => setError("Failed to load Google Sign-In.");
    document.body.appendChild(script);

    return () => {
      if (gisReady.current) {
        window.google?.accounts?.id?.cancel();
      }
    };
  }, []);

  async function handleGISResponse(response) {
    const idToken = response.credential;
    if (!idToken) {
      setError("No credential received from Google.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Server error: ${res.status}`);
      }

      // ✅ Fixed: backend returns "token", not "jwt"
      const { token } = await res.json();
      localStorage.setItem("auth_token", token);

      window.location.href = "/organizations";

    } catch (err) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleLogin() {
    if (!gisReady.current) {
      setError("Google Sign-In is not ready yet. Please wait a moment.");
      return;
    }

    setError(null);
    setLoading(true);

    // With FedCM (now mandatory), the notification callback APIs are removed —
    // just call prompt() without a callback.
    window.google.accounts.id.prompt();

    // Safety: if FedCM prompt doesn't fire handleGISResponse, unblock UI after 8s
    setTimeout(() => {
      if (loading) setLoading(false);
    }, 8000);
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-xs tracking-widest text-white/30 animate-pulse uppercase">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">

      {/* Subtle background grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
        }}
      />

      {/* Faint radial glow at center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm relative"
      >

        {/* Wordmark + tagline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="mb-10 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="opacity-60">
              <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="12" y="1" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="1" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" />
              <rect x="12" y="12" width="9" height="9" rx="1.5" stroke="white" strokeWidth="1.2" strokeDasharray="2 2" />
            </svg>
            <span className="text-3xl font-light tracking-[0.18em] text-white">ORAG</span>
          </div>
          <p className="font-mono text-[10px] tracking-widest text-white/30 uppercase">
            Organizational RAG &amp; MCP Platform
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16 }}
          className="border border-white/[0.08] rounded-lg p-8 bg-white/[0.02] space-y-7"
        >

          {/* Heading */}
          <div>
            <p className="font-mono text-[10px] tracking-widest text-white/35 uppercase mb-2">
              Welcome
            </p>
            <h1 className="text-2xl font-light tracking-tight">Sign in to your workspace</h1>
          </div>

          {/* Separator */}
          <div className="border-t border-white/[0.06]" />

          {/* Google OAuth button */}
          <div className="space-y-3">
            <motion.button
              onClick={handleGoogleLogin}
              onHoverStart={() => setHovering(true)}
              onHoverEnd={() => setHovering(false)}
              whileTap={{ scale: 0.985 }}
              disabled={loading}
              className="relative w-full flex items-center gap-3 px-4 py-3 rounded-md
                         border border-white/[0.10] bg-white/[0.04]
                         hover:bg-white/[0.08] hover:border-white/[0.18]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 group"
            >
              {/* Google G */}
              <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                {loading ? (
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                    <path d="M9 2a7 7 0 0 1 7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
              </span>

              <span className="flex-1 text-left font-mono text-[11px] tracking-widest uppercase text-white/70
                               group-hover:text-white transition-colors duration-150">
                {loading ? "Signing in…" : "Continue with Google"}
              </span>

              {!loading && (
                <motion.span
                  animate={{ x: hovering ? 2 : 0 }}
                  transition={{ duration: 0.18 }}
                  className="font-mono text-[11px] text-white/25 group-hover:text-white/50 transition-colors duration-150"
                >
                  →
                </motion.span>
              )}
            </motion.button>

            {/* Error message */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono text-[9px] text-red-400/70 text-center tracking-widest uppercase"
              >
                {error}
              </motion.p>
            )}

            {!error && (
              <p className="font-mono text-[9px] text-white/20 text-center tracking-widest uppercase">
                Google is the only supported sign-in method
              </p>
            )}
          </div>

          {/* Separator */}
          <div className="border-t border-white/[0.06]" />

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {["RAG Pipelines", "MCP Servers", "Knowledge Bases", "Team Access"].map((feat) => (
              <span
                key={feat}
                className="font-mono text-[9px] tracking-widest uppercase text-white/25
                           border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 rounded-full"
              >
                {feat}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="font-mono text-[9px] text-white/20 text-center tracking-widest mt-6 uppercase"
        >
          By signing in, you agree to ORAG's terms of service
        </motion.p>

      </motion.div>
    </main>
  );
}