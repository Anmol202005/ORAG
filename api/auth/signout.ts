import type { VercelResponse } from "@vercel/node";
import { withAuth, withCors, compose, type AuthenticatedRequest } from "../../lib/middleware.js";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

// JWT is stateless — signout is handled client-side by deleting the token.
// This endpoint exists as a clean server hook (e.g. future token blocklist,
// audit logging, clearing httpOnly cookies, etc.)

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // If you ever move to httpOnly cookies, clear them here:
  // res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict");

  return res.status(200).json({ message: "Signed out successfully" });
};

export default compose(withCors, withAuth)(handler);