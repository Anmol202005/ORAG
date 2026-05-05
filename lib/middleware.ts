import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends VercelRequest {
  user?: AuthenticatedUser;
}

type Handler = (req: AuthenticatedRequest, res: VercelResponse) => Promise<void | VercelResponse>;

// ── Token extractor ───────────────────────────────────────────────────────────

function extractToken(req: VercelRequest): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  // 2. Cookie: token=<token>  (if you ever move to httpOnly cookies)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

// ── Core verify helper ────────────────────────────────────────────────────────

export function verifyToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthenticatedUser & {
    iat?: number;
    exp?: number;
  };

  if (!decoded.userId || !decoded.email) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: decoded.userId,
    email: decoded.email,
    name: decoded.name,
  };
}

// ── withAuth HOC ──────────────────────────────────────────────────────────────
// Wraps a handler and injects req.user if the JWT is valid.
// Usage:
//   export default withAuth(async (req, res) => {
//     const { userId } = req.user!;
//     ...
//   });

export function withAuth(handler: Handler) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      req.user = verifyToken(token);
    } catch (err) {
      const name = (err as Error).name;

      if (name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired" });
      }

      if (name === "JsonWebTokenError") {
        return res.status(401).json({ error: "Invalid token" });
      }

      return res.status(401).json({ error: "Authentication failed" });
    }

    return handler(req, res);
  };
}

// ── optionalAuth HOC ──────────────────────────────────────────────────────────
// Like withAuth but does NOT block if no token is present.
// req.user will be undefined for unauthenticated requests.
// Useful for public endpoints that behave differently when logged in.

export function withOptionalAuth(handler: Handler) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    const token = extractToken(req);

    if (token) {
      try {
        req.user = verifyToken(token);
      } catch {
        // Token present but invalid — treat as unauthenticated
        req.user = undefined;
      }
    }

    return handler(req, res);
  };
}

// ── CORS helper ───────────────────────────────────────────────────────────────
// Optionally wrap any handler with CORS headers.
// Usage: export default withCors(withAuth(handler))

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

export function withCors(handler: Handler) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    const origin = req.headers.origin ?? "";

    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Preflight
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return handler(req, res);
  };
}

// ── Compose helpers ───────────────────────────────────────────────────────────
// Combine multiple wrappers cleanly.
// Usage: export default compose(withCors, withAuth)(handler)

export function compose(...middlewares: Array<(h: Handler) => Handler>) {
  return (handler: Handler): Handler =>
    middlewares.reduceRight((acc, mw) => mw(acc), handler);
}