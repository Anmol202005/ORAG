import type { VercelResponse } from "@vercel/node";
import { docClient } from "../../lib/dynamo.ts";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth, withCors, compose, type AuthenticatedRequest } from "../../lib/middleware.ts";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const TABLE_NAME = process.env.TABLE_NAME!;

// ── DynamoDB writes ───────────────────────────────────────────────────────────
//
// 1. Guard: org must exist + be public
// 2. Guard: user must not already be a member
// 3. Write membership record:
//    pk: USER#<userId>,  sk: MEMBER#<orgId>,  role: "member"
// 4. Increment org's memberCount atomically

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.user!;
  const orgId = req.query.id as string;

  if (!orgId) {
    return res.status(400).json({ error: "Missing org id" });
  }

  // ── Fetch org ───────────────────────────────────────────────────────────────
  const orgResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `ORG#${orgId}`, sk: "PROFILE" },
    })
  );

  if (!orgResult.Item) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const org = orgResult.Item;

  if (!org.isPublic) {
    return res.status(403).json({ error: "This organization is private" });
  }

  // ── Check existing membership ───────────────────────────────────────────────
  const membershipResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `MEMBER#${orgId}`,
      },
    })
  );

  if (membershipResult.Item) {
    return res.status(409).json({ error: "Already a member of this organization" });
  }

  const now = new Date().toISOString();

  // ── Write membership + increment memberCount atomically ─────────────────────
  const { TransactWriteCommand } = await import("@aws-sdk/lib-dynamodb");

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              pk: `USER#${userId}`,
              sk: `MEMBER#${orgId}`,
              orgId,
              role: "member",
              joinedAt: now,
            },
            // Prevent race condition: only insert if not already a member
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { pk: `ORG#${orgId}`, sk: "PROFILE" },
            UpdateExpression: "SET memberCount = memberCount + :inc, updatedAt = :now",
            ExpressionAttributeValues: { ":inc": 1, ":now": now },
          },
        },
      ],
    })
  );

  return res.status(200).json({
    message: "Successfully joined organization",
    orgId,
    role: "member",
    joinedAt: now,
  });
};

export default compose(withCors, withAuth)(handler);