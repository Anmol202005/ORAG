import type { VercelResponse } from "@vercel/node";
import { docClient } from "../../lib/dynamo.js";
import { withAuth, withCors, compose, type AuthenticatedRequest } from "../../lib/middleware.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const TABLE_NAME = process.env.TABLE_NAME!;

// ── DynamoDB writes ───────────────────────────────────────────────────────────
//
// 1. Org PROFILE record:
//    pk: ORG#<orgId>,  sk: PROFILE
//    + GSI2PK / GSI2SK if public (so it appears in /api/orgs/public)
//
// 2. Slug → orgId lookup (for uniqueness + /org/:slug route):
//    pk: SLUG#<slug>,  sk: ORG
//
// 3. Membership record for the creator (owner):
//    pk: USER#<userId>,  sk: MEMBER#<orgId>

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, name: creatorName } = req.user!;

  const { name, slug, description, isPublic } = req.body as {
    name?: string;
    slug?: string;
    description?: string;
    isPublic?: boolean;
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "name must be at least 2 characters" });
  }

  if (!slug || typeof slug !== "string" || !SLUG_REGEX.test(slug)) {
    return res.status(400).json({
      error: "slug must be lowercase alphanumeric with hyphens (e.g. acme-eng)",
    });
  }

  if (slug.length > 48) {
    return res.status(400).json({ error: "slug must be 48 characters or fewer" });
  }

  // ── Check slug uniqueness ───────────────────────────────────────────────────
  // pk: SLUG#<slug>, sk: ORG
  const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
  const existing = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `SLUG#${slug}`, sk: "ORG" },
    })
  );

  if (existing.Item) {
    return res.status(409).json({ error: "slug is already taken" });
  }

  // ── Build records ───────────────────────────────────────────────────────────
  const orgId = uuidv4();
  const now = new Date().toISOString();

  const orgProfile: Record<string, unknown> = {
    pk: `ORG#${orgId}`,
    sk: "PROFILE",
    orgId,
    name: name.trim(),
    slug,
    description: description?.trim() ?? "",
    isPublic: isPublic ?? false,
    memberCount: 1,
    sources: 0,
    mcpServers: 0,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };

  // GSI2 projection so public orgs are queryable
  if (isPublic) {
    orgProfile.GSI2PK = "PUBLIC_ORGS";
    orgProfile.GSI2SK = `ORG#${orgId}`;
  }

  const slugRecord = {
    pk: `SLUG#${slug}`,
    sk: "ORG",
    orgId,
    createdAt: now,
  };

  const membershipRecord = {
    pk: `USER#${userId}`,
    sk: `MEMBER#${orgId}`,
    orgId,
    role: "owner",
    joinedAt: now,
  };

  // ── Write all three records ─────────────────────────────────────────────────
  // Using individual PutCommands; swap to TransactWriteCommand for atomicity
  const { TransactWriteCommand } = await import("@aws-sdk/lib-dynamodb");

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLE_NAME, Item: orgProfile } },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: slugRecord,
            // Belt-and-suspenders uniqueness guard inside the transaction
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        { Put: { TableName: TABLE_NAME, Item: membershipRecord } },
      ],
    })
  );

  return res.status(201).json({
    org: {
      id: orgId,
      name: orgProfile.name,
      slug,
      description: orgProfile.description,
      isPublic: orgProfile.isPublic,
      memberCount: 1,
      sources: 0,
      mcpServers: 0,
      role: "owner",
      createdAt: now,
    },
  });
};

export default compose(withCors, withAuth)(handler);