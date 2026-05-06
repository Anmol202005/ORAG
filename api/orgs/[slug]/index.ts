// api/orgs/[slug]/index.ts
import type { VercelResponse } from "@vercel/node";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from "dotenv";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";

dotenv.config({ path: "./.env" });

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);
const TABLE = process.env.TABLE_NAME!;

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // req.orgMember is guaranteed by withOrgMember — orgId already resolved from slug
  const { orgId } = req.orgMember!;

  const orgRecord = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `ORG#${orgId}`, sk: "PROFILE" },
    })
  );

  if (!orgRecord.Item) {
    return res.status(404).json({ error: "Org profile not found" });
  }

  return res.status(200).json({
    success: true,
    org: orgRecord.Item,
  });
};

export default compose(
  withCors,
  withAuth,
  withOrgMember() // any member role (owner/admin/member) can access
)(handler);