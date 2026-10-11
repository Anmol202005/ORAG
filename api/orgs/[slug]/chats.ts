import type { VercelResponse } from "@vercel/node";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import {
  compose,
  withCors,
  withAuth,
  withOrgMember,
  type AuthenticatedRequest,
} from "../../../lib/middleware.js";
import { docClient } from "../../../lib/dynamo.js";
import { queryAll, tableName } from "../../../lib/knowledge.js";
const messageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "ai"]),
  content: z.string().max(150_000),
  timestamp: z.string().max(80),
  bookmarked: z.boolean().optional(),
  citations: z
    .array(
      z.object({
        id: z.string(),
        docId: z.string(),
        docName: z.string(),
        text: z.string(),
        chunkIndex: z.number().int().nonnegative(),
        page: z.number().int().positive().optional(),
        version: z.string().optional(),
        score: z.number().optional(),
      }),
    )
    .max(100)
    .optional(),
});
const chatSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  messages: z.array(messageSchema).max(500),
  docIds: z.array(z.string()).max(1000),
  expectedRevision: z.number().int().nonnegative(),
});
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  const pk = `USER#${req.user!.userId}`;
  const prefix = `CHAT#${req.orgMember!.orgId}#`;
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (id && !z.string().uuid().safeParse(id).success)
    return res.status(400).json({ error: "Invalid chat ID" });
  try {
    if (req.method === "GET") {
      if (id) {
        const result = await docClient.send(
          new GetCommand({
            TableName: tableName(),
            Key: { pk, sk: prefix + id },
            ConsistentRead: true,
          }),
        );
        if (!result.Item)
          return res.status(404).json({ error: "Chat not found" });
        return res.json({ chat: result.Item });
      }
      const query =
        typeof req.query.search === "string"
          ? req.query.search.toLowerCase().slice(0, 200)
          : "";
      const chats = (await queryAll(pk, prefix))
        .filter(
          (chat) =>
            !query ||
            String(chat.title).toLowerCase().includes(query) ||
            (chat.messages as z.infer<typeof messageSchema>[]).some((m) =>
              m.content.toLowerCase().includes(query),
            ),
        )
        .map((chat) => ({
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updatedAt,
          revision: chat.revision,
          messageCount: (chat.messages as unknown[]).length,
          bookmarkedCount: (
            chat.messages as z.infer<typeof messageSchema>[]
          ).filter((m) => m.bookmarked).length,
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return res.json({ chats });
    }
    if (req.method === "DELETE" && id) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName(),
          Key: { pk, sk: prefix + id },
        }),
      );
      return res.json({ success: true });
    }
    if (req.method !== "PUT")
      return res.status(405).json({ error: "Method not allowed" });
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid chat data" });
    const { expectedRevision, ...chat } = parsed.data;
    const item = {
      ...chat,
      pk,
      sk: prefix + chat.id,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (Buffer.byteLength(JSON.stringify(item)) > 300_000)
      return res.status(413).json({
        error:
          "This conversation is too large to save. Start a new chat to continue.",
      });
    await docClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: item,
        ConditionExpression:
          expectedRevision === 0
            ? "attribute_not_exists(pk)"
            : "revision = :revision",
        ...(expectedRevision
          ? { ExpressionAttributeValues: { ":revision": expectedRevision } }
          : {}),
      }),
    );
    return res.json({ revision: item.revision, updatedAt: item.updatedAt });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    )
      return res.status(409).json({
        error:
          "This chat changed in another tab. Save your local version as a new conversation.",
      });
    return res
      .status(500)
      .json({ error: "Unable to save or load conversation" });
  }
};
export default compose(withCors, withAuth, withOrgMember())(handler);
