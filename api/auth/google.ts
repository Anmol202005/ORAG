import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token missing" });
    }

    // ✅ Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // ✅ Optional checks (recommended)
    if (payload.email_verified !== true) {
      return res.status(401).json({ error: "Email not verified" });
    }

    // ✅ Create your JWT (minimal payload)
    const appToken = jwt.sign(
      {
        email: payload.email,
        name: payload.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );

    return res.status(200).json({ token: appToken });

  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}