import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);
const TABLE = process.env.DYNAMO_TABLE_NAME ?? process.env.TABLE_NAME!;

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgMemberRole = "owner" | "admin" | "member";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends VercelRequest {
  user?: AuthenticatedUser;
  // Populated by withOrgMember — the verified role of req.user in the org
  orgMember?: {
    orgId: string;
    slug: string | undefined;
    role: OrgMemberRole;
    joinedAt: string;
  };
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

// ── withOrgMember HOC ─────────────────────────────────────────────────────────
// Verifies the authenticated user is a member of the org identified by the
// request. Must be composed AFTER withAuth so req.user is already set.
//
// orgId resolution order:
//   1. req.query.orgId
//   2. req.query.id         (for routes like /api/orgs/[id]/...)
//   3. req.query.slug       → DynamoDB SLUG# lookup to resolve orgId
//   4. req.body.orgId
//
// On success  → injects req.orgMember = { orgId, role, joinedAt }
// On failure  → 404 "Org not found" (never 403, to avoid leaking existence)
//
// Optional: pass allowedRoles to restrict access by role.
//   withOrgMember()                     → any member (owner/admin/member)
//   withOrgMember(["owner", "admin"])   → only owner or admin
//
// Usage:
//   export default compose(withCors, withAuth, withOrgMember())(handler);
//   export default compose(withCors, withAuth, withOrgMember(["owner"]))(handler);

// ── withOrgMember HOC ─────────────────────────────────────────────────────────
// Verifies the authenticated user is a member of the org. Must be composed
// AFTER withAuth so req.user is already set.
//
// Resolution order (slug is the primary identifier):
//   1. req.query.slug  → SLUG#<slug> DynamoDB lookup → orgId   ✅ primary
//   2. req.query.orgId → used directly as orgId                 fallback
//   3. req.query.id    → used directly as orgId                 fallback
//   4. req.body.orgId  → used directly as orgId                 fallback
//
// On success  → injects req.orgMember = { orgId, slug, role, joinedAt }
// On failure  → 404 "Org not found" (never 403, to avoid leaking existence)
//
// Optional: pass allowedRoles to restrict access by role.
//   withOrgMember()                     → any member (owner/admin/member)
//   withOrgMember(["owner", "admin"])   → only owner or admin
//
// Usage:
//   export default compose(withCors, withAuth, withOrgMember())(handler);
//   export default compose(withCors, withAuth, withOrgMember(["owner"]))(handler);

export function withOrgMember(allowedRoles?: OrgMemberRole[]) {
  return (handler: Handler) =>
    async (req: AuthenticatedRequest, res: VercelResponse) => {
      // withAuth must run first
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { userId } = req.user;

      // ── Step 1: Resolve slug → orgId (slug is the primary identifier) ───────
      let orgId: string | undefined;
      let resolvedSlug: string | undefined;

      const slug = req.query.slug as string | undefined;

      if (slug) {
        // Primary path — resolve slug to orgId via DynamoDB
        resolvedSlug = slug;
        try {
          const slugRecord = await ddb.send(
            new GetCommand({
              TableName: TABLE,
              Key: { pk: `SLUG#${slug}`, sk: "ORG" },
            })
          );

          if (!slugRecord.Item) {
            return res.status(404).json({ error: "Org not found" });
          }

          orgId = slugRecord.Item.orgId as string;
        } catch {
          return res.status(500).json({ error: "Internal server error" });
        }
      } else {
        // Fallback — orgId provided directly (e.g. internal service calls)
        orgId =
          (req.query.orgId as string) ??
          (req.query.id as string) ??
          (req.body?.orgId as string);
      }

      if (!orgId) {
        return res.status(400).json({ error: "Could not determine org from request" });
      }

      // ── Step 2: Check membership ─────────────────────────────────────────────
      let memberRecord;
      try {
        memberRecord = await ddb.send(
          new GetCommand({
            TableName: TABLE,
            Key: {
              pk: `USER#${userId}`,
              sk: `MEMBER#${orgId}`,
            },
          })
        );
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }

      if (!memberRecord.Item) {
        // 404 instead of 403 — don't leak that the org exists
        return res.status(404).json({ error: "Org not found" });
      }

      const role = memberRecord.Item.role as OrgMemberRole;

      // ── Step 3: Role guard (optional) ────────────────────────────────────────
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      // ── Step 4: Inject into request ──────────────────────────────────────────
      req.orgMember = {
        orgId,
        slug: resolvedSlug,
        role,
        joinedAt: memberRecord.Item.joinedAt as string,
      };

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