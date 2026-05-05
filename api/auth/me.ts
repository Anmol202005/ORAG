import type { VercelResponse } from "@vercel/node";
import { docClient } from "../../lib/dynamo.js";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { withAuth, withCors, compose, type AuthenticatedRequest } from "../../lib/middleware.ts";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const TABLE_NAME = process.env.TABLE_NAME!;

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.user!;

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: "PROFILE",
      },
    })
  );

  if (!result.Item) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = result.Item;

  return res.status(200).json({
    userId,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    createdAt: user.createdAt,
  });
};

export default compose(withCors, withAuth)(handler);