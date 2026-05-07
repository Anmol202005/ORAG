import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { docClient } from "../../lib/dynamo.js"; 
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });
const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);
console.log("Google OAuth Client initialized with ID:", process.env.VITE_GOOGLE_CLIENT_ID);

const TABLE_NAME = process.env.TABLE_NAME!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token missing" });
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    if (payload.email_verified !== true) {
      return res.status(401).json({ error: "Email not verified" });
    }

    const email = payload.email;
    const name = payload.name;

    // 🔹 STEP 1: Check if user exists using GSI (email index)
    const existingUser = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1", // 🔥 you must create this
        KeyConditionExpression: "GSI1PK = :email",
        ExpressionAttributeValues: {
          ":email": `EMAIL#${email}`,
        },
      })
    );

    let userId: string;

    // 🔹 STEP 2: If user does NOT exist → create
    if (!existingUser.Items || existingUser.Items.length === 0) {
      userId = uuidv4();

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            pk: `USER#${userId}`,
            sk: "PROFILE",
            name,
            email,
            GSI1PK: `EMAIL#${email}`,
            GSI1SK: `USER#${userId}`,
            createdAt: new Date().toISOString(),
          },
        })
      );
    } else {
      // ✅ User exists
      const user = existingUser.Items[0];
      userId = user.pk.split("#")[1];
    }

    // 🔹 STEP 3: Generate JWT
    const appToken = jwt.sign(
      {
        userId,
        email,
        name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1y" }
    );

    return res.status(200).json({ token: appToken });

  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: "Invalid token" });
  }
}
