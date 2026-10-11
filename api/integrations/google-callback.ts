import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../../lib/dynamo.js";
import { tableName } from "../../lib/knowledge.js";
import { connect } from "../../lib/integrations.js";
interface State {
  orgId: string;
  userId: string;
  slug: string;
  folderId: string;
  nonce: string;
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).end();
  let destination = "/organizations";
  try {
    if (typeof req.query.state !== "string")
      throw new Error("Missing authorization state");
    const state = jwt.verify(req.query.state, process.env.JWT_SECRET!, {
      audience: "orag-drive-connect",
    }) as State;
    if (
      !state.nonce ||
      !state.orgId ||
      !state.userId ||
      !state.slug ||
      !state.folderId
    )
      throw new Error("Invalid authorization state");
    const nonceCookie = req.headers.cookie
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("orag_drive_state="))
      ?.slice("orag_drive_state=".length);
    if (nonceCookie !== state.nonce)
      throw new Error("Authorization session does not match this browser");
    await docClient.send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { pk: `OAUTH#${state.nonce}`, sk: "STATE" },
        ConditionExpression: "attribute_exists(pk) AND expiresAt > :now",
        ExpressionAttributeValues: { ":now": Math.floor(Date.now() / 1000) },
      }),
    );
    destination = `/org/${encodeURIComponent(state.slug)}`;
    if (req.query.error || typeof req.query.code !== "string")
      throw new Error("Google Drive authorization was cancelled");
    const membership = await docClient.send(
      new GetCommand({
        TableName: tableName(),
        Key: { pk: `USER#${state.userId}`, sk: `MEMBER#${state.orgId}` },
        ConsistentRead: true,
      }),
    );
    if (!["owner", "admin"].includes(membership.Item?.role))
      throw new Error("Administrator access required");
    const base = new URL(process.env.APP_URL!).origin;
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: req.query.code,
        redirect_uri: `${base}/api/integrations/google-callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok)
      throw new Error("Unable to connect Google Drive. Try connecting again.");
    const tokens = await response.json();
    if (!tokens.refresh_token)
      throw new Error(
        "Google did not grant offline access. Reconnect with consent.",
      );
    await connect(state.orgId, "drive", tokens.refresh_token, state.folderId);
    res.setHeader(
      "Set-Cookie",
      "orag_drive_state=; HttpOnly; SameSite=Lax; Path=/api/integrations/google-callback; Max-Age=0",
    );
    return res.redirect(302, `${destination}?connected=drive`);
  } catch {
    return res.redirect(
      302,
      `${destination}?connectionError=Google%20Drive%20connection%20failed.%20Please%20try%20again.`,
    );
  }
}
