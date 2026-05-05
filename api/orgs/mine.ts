import type { VercelResponse } from "@vercel/node";
import { docClient } from "../../lib/dynamo.js";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth, withCors, compose, type AuthenticatedRequest } from "../../lib/middleware.ts";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const TABLE_NAME = process.env.TABLE_NAME!;

// ── DynamoDB access patterns ──────────────────────────────────────────────────
//
// Membership record (written when user joins/creates an org):
//   pk:   USER#<userId>
//   sk:   MEMBER#<orgId>
//   role: "owner" | "admin" | "member"
//
// Org record:
//   pk:   ORG#<orgId>
//   sk:   PROFILE
//   name, slug, description, isPublic, memberCount, sources, mcpServers, createdAt

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.user!;

  // Step 1: Get all MEMBER#* records for this user
  const membershipResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":prefix": "MEMBER#",
      },
    })
  );

  const memberships = membershipResult.Items ?? [];

  if (memberships.length === 0) {
    return res.status(200).json({ orgs: [] });
  }

  // Step 2: Batch-fetch each org's PROFILE record
  // DynamoDB BatchGetItem supports up to 100 keys per call
  const { BatchGetCommand } = await import("@aws-sdk/lib-dynamodb");

  const keys = memberships.map((m) => ({
    pk: `ORG#${m.sk.split("#")[1]}`,
    sk: "PROFILE",
  }));

  const batchResult = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys },
      },
    })
  );

  const orgProfiles = (batchResult.Responses?.[TABLE_NAME] ?? []) as Record<string, unknown>[];

  // Step 3: Merge membership role into each org profile
  const roleMap = Object.fromEntries(
    memberships.map((m) => [m.sk.split("#")[1], m.role])
  );

  const orgs = orgProfiles.map((org) => {
    const orgId = (org.pk as string).split("#")[1];
    return {
      id: orgId,
      name: org.name,
      slug: org.slug,
      description: org.description ?? null,
      isPublic: org.isPublic ?? false,
      memberCount: org.memberCount ?? 0,
      sources: org.sources ?? 0,
      mcpServers: org.mcpServers ?? 0,
      role: roleMap[orgId] ?? "member",
      createdAt: org.createdAt,
    };
  });

  return res.status(200).json({ orgs });
};

export default compose(withCors, withAuth)(handler);