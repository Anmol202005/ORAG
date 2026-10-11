import type { VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";
import { docClient } from "../../../lib/dynamo.js";
import { queryAll, tableName } from "../../../lib/knowledge.js";
import {
  connect,
  disconnect,
  syncConnection,
  validateNotion,
  type Connection,
  type Provider,
} from "../../../lib/integrations.js";
export const config = { maxDuration: 300 };
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { orgId, role, slug } = req.orgMember!;
  if (req.method === "GET") {
    const records = (await queryAll(
      `ORG#${orgId}`,
      "INTEGRATION#",
    )) as unknown as Connection[];
    return res.json({
      canManage: role === "owner" || role === "admin",
      driveConfigured: !!(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.APP_URL &&
        process.env.INTEGRATION_ENCRYPTION_KEY
      ),
      connections: records.map(
        ({
          provider,
          connectedAt,
          lastSyncedAt,
          error,
          pending,
          lockUntil,
          folderId,
        }) => ({
          provider,
          connectedAt,
          lastSyncedAt,
          error,
          pending,
          syncing: (lockUntil ?? 0) > Date.now(),
          folderId,
        }),
      ),
    });
  }
  if (role !== "owner" && role !== "admin")
    return res
      .status(403)
      .json({ error: "Only owners and admins can manage source connections" });
  const provider =
    req.method === "DELETE" ? req.query.provider : req.body?.provider;
  if (provider !== "drive" && provider !== "notion")
    return res.status(400).json({ error: "Unknown source provider" });
  try {
    if (req.method === "DELETE") {
      await disconnect(orgId, provider);
      return res.json({ success: true });
    }
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });
    if (req.body.action === "sync")
      return res.json(await syncConnection(orgId, provider as Provider));
    if (req.body.action !== "connect")
      return res.status(400).json({ error: "Unknown action" });
    if (
      !process.env.INTEGRATION_ENCRYPTION_KEY ||
      process.env.INTEGRATION_ENCRYPTION_KEY.length < 32
    )
      return res
        .status(503)
        .json({
          error:
            "The server needs INTEGRATION_ENCRYPTION_KEY configured before connecting sources",
        });
    if (provider === "notion") {
      const token = req.body.token;
      if (typeof token !== "string" || token.length < 20 || token.length > 300)
        return res
          .status(400)
          .json({ error: "Enter a valid Notion connection token" });
      await validateNotion(token);
      await connect(orgId, provider, token);
      return res.json({ success: true });
    }
    const folderId = req.body.folderId;
    if (
      typeof folderId !== "string" ||
      !/^[a-zA-Z0-9_-]{10,200}$/.test(folderId)
    )
      return res
        .status(400)
        .json({ error: "Enter the ID of a Google Drive folder" });
    if (
      !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.APP_URL
    )
      return res
        .status(503)
        .json({
          error:
            "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL on the server",
        });
    const nonce = randomUUID();
    const state = jwt.sign(
      { orgId, slug, userId: req.user!.userId, folderId, nonce },
      process.env.JWT_SECRET!,
      { expiresIn: "10m", audience: "orag-drive-connect" },
    );
    await docClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          pk: `OAUTH#${nonce}`,
          sk: "STATE",
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    const base = new URL(process.env.APP_URL).origin;
    res.setHeader(
      "Set-Cookie",
      `orag_drive_state=${nonce}; HttpOnly; SameSite=Lax; Path=/api/integrations/google-callback; Max-Age=600${base.startsWith("https:") ? "; Secure" : ""}`,
    );
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${base}/api/integrations/google-callback`,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return res.json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    });
  } catch (error) {
    return res
      .status(
        error instanceof Error &&
          error.name === "ConditionalCheckFailedException"
          ? 409
          : 400,
      )
      .json({
        error:
          error instanceof Error ? error.message : "Source operation failed",
      });
  }
};
export default compose(withCors, withAuth, withOrgMember())(handler);
