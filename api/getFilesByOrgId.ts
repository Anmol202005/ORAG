// api/orgs/[slug]/docs.ts
import type { VercelResponse } from "@vercel/node";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../lib/dynamo";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../lib/middleware";

const TABLE = process.env.DYNAMO_TABLE_NAME!;

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { orgId } = req.orgMember!;

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}`,
        ":skPrefix": "DOC#",
      },
      ProjectionExpression: "docId, docName, orgId, totalChunks, uploadedAt",
    })
  );

  const documents = result.Items ?? [];

  return res.status(200).json({
    success: true,
    org_id: orgId,
    count: documents.length,
    documents,
  });
};

export default compose(
  withCors,
  withAuth,
  withOrgMember()
)(handler);