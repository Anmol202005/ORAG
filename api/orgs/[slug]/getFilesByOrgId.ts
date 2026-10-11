import type { VercelResponse } from "@vercel/node";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";
import { listDocuments } from "../../../lib/knowledge.js";
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const documents = await listDocuments(req.orgMember!.orgId);
  return res.json({ documents, count: documents.length });
};
export default compose(withCors, withAuth, withOrgMember())(handler);
