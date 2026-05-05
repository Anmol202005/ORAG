import type { VercelResponse } from "@vercel/node";
import { docClient } from "../../lib/dynamo.js";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { withCors, withOptionalAuth, compose, type AuthenticatedRequest } from "../../lib/middleware.ts";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const TABLE_NAME = process.env.TABLE_NAME!;

// ── DynamoDB access patterns ──────────────────────────────────────────────────
//
// Public orgs index (GSI2):
//   GSI2PK: "PUBLIC_ORGS"
//   GSI2SK: ORG#<orgId>
//
// This lets us do a targeted query for all public orgs without a full scan.
// Org PROFILE record shape:
//   pk: ORG#<orgId>, sk: PROFILE
//   name, slug, description, isPublic, memberCount, tags[], createdAt

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const search = (req.query.search as string | undefined)?.toLowerCase().trim();

  // Query GSI2 for all public orgs
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "PUBLIC_ORGS",
      },
    })
  );

  let orgs = (result.Items ?? []).map((org) => ({
    id: (org.pk as string).split("#")[1],
    name: org.name as string,
    slug: org.slug as string,
    description: (org.description as string) ?? null,
    memberCount: (org.memberCount as number) ?? 0,
    tags: (org.tags as string[]) ?? [],
    createdAt: org.createdAt as string,
  }));

  // Client-side search filter (for small datasets).
  // For large datasets, consider OpenSearch or a separate search index.
  if (search) {
    orgs = orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(search) ||
        o.description?.toLowerCase().includes(search) ||
        o.tags.some((t) => t.toLowerCase().includes(search))
    );
  }

  return res.status(200).json({ orgs });
};

// Uses withOptionalAuth so logged-in users can see join status in the future
export default compose(withCors, withOptionalAuth)(handler);