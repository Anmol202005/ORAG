import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { docClient } from "./dynamo.js";
import {
  tableName,
  listDocuments,
  docKey,
  indexDocument,
  deleteDocument,
  type DocumentRecord,
} from "./knowledge.js";
import { ALLOWED_EXTENSIONS } from "./knowledge-utils.js";
import { encryptSecret, decryptSecret } from "./integration-secrets.js";
export type Provider = "drive" | "notion";
export interface Connection {
  orgId: string;
  provider: Provider;
  secret: string;
  folderId?: string;
  connectedAt: string;
  lastSyncedAt?: string;
  lastAttemptedAt?: string;
  error?: string;
  lockUntil?: number;
  pending?: number;
}
export const connectionKey = (orgId: string, provider: Provider) => ({
  pk: `ORG#${orgId}`,
  sk: `INTEGRATION#${provider}`,
});
export async function connection(orgId: string, provider: Provider) {
  return (
    await docClient.send(
      new GetCommand({
        TableName: tableName(),
        Key: connectionKey(orgId, provider),
        ConsistentRead: true,
      }),
    )
  ).Item as Connection | undefined;
}
export async function connect(
  orgId: string,
  provider: Provider,
  secret: string,
  folderId?: string,
) {
  const previous = await connection(orgId, provider);
  if (previous)
    throw new Error(
      "Disconnect the existing source before connecting another one",
    );
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        ...connectionKey(orgId, provider),
        orgId,
        provider,
        secret: encryptSecret(secret),
        ...(folderId ? { folderId } : {}),
        connectedAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: "SYNC#ACTIVE", sk: `${orgId}#${provider}`, orgId, provider },
    }),
  );
}
async function providerJson(
  url: string,
  token: string,
  init: RequestInit = {},
  notion = false,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(notion
        ? { "Notion-Version": "2025-09-03", "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(
      `${notion ? "Notion" : "Google Drive"} returned ${response.status}. Check source access or reconnect.`,
    );
  return await response.json();
}
export async function validateNotion(token: string) {
  await providerJson("https://api.notion.com/v1/users/me", token, {}, true);
}
export interface RemoteDocument {
  id: string;
  name: string;
  updatedAt: string;
  mime?: string;
}
async function driveToken(secret: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: secret,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok)
    throw new Error(
      "Google Drive authorization expired. Reconnect the source.",
    );
  return (await response.json()).access_token as string;
}
async function driveDocuments(
  token: string,
  folderId: string,
): Promise<RemoteDocument[]> {
  const documents: RemoteDocument[] = [];
  const folders = [folderId];
  for (let f = 0; f < folders.length; f++) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folders[f]}' in parents and trashed = false`,
        pageSize: "100",
        fields:
          "nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        ...(pageToken ? { pageToken } : {}),
      });
      const data = await providerJson(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        token,
      );
      if (data.incompleteSearch)
        throw new Error(
          "Drive returned an incomplete listing. No documents were removed; try again.",
        );
      for (const file of data.files as {
        id: string;
        name: string;
        mimeType: string;
        modifiedTime: string;
      }[]) {
        if (file.mimeType === "application/vnd.google-apps.folder") {
          folders.push(file.id);
          continue;
        }
        const googleDoc =
          file.mimeType === "application/vnd.google-apps.document";
        if (
          !googleDoc &&
          !ALLOWED_EXTENSIONS.includes(
            file.name.split(".").pop()?.toLowerCase() ?? "",
          )
        )
          continue;
        documents.push({
          id: file.id,
          name: googleDoc ? `${file.name}.txt` : file.name,
          updatedAt: file.modifiedTime,
          mime: file.mimeType,
        });
      }
      if (documents.length > 1000 || folders.length > 1000)
        throw new Error(
          "Choose a smaller Drive folder (up to 1,000 documents and folders)",
        );
      pageToken = data.nextPageToken as string | undefined;
    } while (pageToken);
  }
  return documents;
}
interface RichText {
  plain_text?: string;
  text?: { content?: string };
}
const text = (parts: RichText[] = []) =>
  parts.map((part) => part.plain_text ?? part.text?.content ?? "").join("");
async function notionDocuments(token: string): Promise<RemoteDocument[]> {
  const documents: RemoteDocument[] = [];
  let cursor: string | undefined;
  do {
    const data = await providerJson(
      "https://api.notion.com/v1/search",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          filter: { value: "page", property: "object" },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
      true,
    );
    if (
      (data.request_status as { type?: string } | undefined)?.type ===
      "incomplete"
    )
      throw new Error("Notion returned an incomplete listing. Try again.");
    for (const page of data.results as {
      id: string;
      archived?: boolean;
      in_trash?: boolean;
      last_edited_time: string;
      properties: Record<string, { type: string; title?: RichText[] }>;
    }[]) {
      if (page.archived || page.in_trash) continue;
      const title = Object.values(page.properties).find(
        (property) => property.type === "title",
      );
      documents.push({
        id: page.id,
        name: `${text(title?.title) || "Untitled page"}.md`,
        updatedAt: page.last_edited_time,
      });
    }
    if (documents.length > 1000)
      throw new Error(
        "Share fewer than 1,000 pages with this Notion connection",
      );
    cursor = data.has_more ? (data.next_cursor as string) : undefined;
  } while (cursor);
  return documents;
}
async function notionContent(
  token: string,
  pageId: string,
  depth = 0,
  budget = { blocks: 0 },
): Promise<string> {
  if (depth > 20) throw new Error("Notion page nesting exceeds 20 levels");
  let cursor: string | undefined;
  const lines: string[] = [];
  do {
    const data = await providerJson(
      `https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
      token,
      {},
      true,
    );
    for (const block of data.results as {
      id: string;
      type: string;
      has_children?: boolean;
      [key: string]: unknown;
    }[]) {
      if (++budget.blocks > 5000)
        throw new Error("Notion page exceeds 5,000 blocks");
      const value = block[block.type] as {
        rich_text?: RichText[];
        cells?: RichText[][];
        title?: string;
        caption?: RichText[];
        language?: string;
        type?: string;
        block_id?: string;
      };
      if (value.rich_text) lines.push(text(value.rich_text));
      if (value.cells) lines.push(value.cells.map(text).join(" | "));
      if (value.title) lines.push(value.title);
      if (value.caption) lines.push(text(value.caption));
      if (block.type === "child_page" || block.type === "child_database")
        continue;
      if (block.has_children)
        lines.push(await notionContent(token, block.id, depth + 1, budget));
      // Linked synced blocks expose their original children through the source block.
      const synced = value as typeof value & {
        synced_from?: { block_id: string };
      };
      if (
        block.type === "synced_block" &&
        synced.synced_from &&
        !block.has_children
      )
        lines.push(
          await notionContent(
            token,
            synced.synced_from.block_id,
            depth + 1,
            budget,
          ),
        );
    }
    cursor = data.has_more ? (data.next_cursor as string) : undefined;
  } while (cursor);
  return lines.join("\n\n");
}
async function remoteContent(
  provider: Provider,
  token: string,
  doc: RemoteDocument,
) {
  if (provider === "notion")
    return Buffer.from(await notionContent(token, doc.id), "utf8");
  const path =
    doc.mime === "application/vnd.google-apps.document"
      ? `files/${encodeURIComponent(doc.id)}/export?mimeType=text%2Fplain`
      : `files/${encodeURIComponent(doc.id)}?alt=media&supportsAllDrives=true`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Unable to download ${doc.name} (${response.status})`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!response.body) throw new Error("Empty source response");
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) throw new Error("Source file exceeds 100 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function syncConnection(orgId: string, provider: Provider) {
  const started = Date.now();
  const record = await connection(orgId, provider);
  if (!record) throw new Error("Source is not connected");
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: connectionKey(orgId, provider),
      UpdateExpression:
        "SET lockUntil = :until, #error = :empty, lastAttemptedAt = :attempt",
      ExpressionAttributeNames: { "#error": "error" },
      ExpressionAttributeValues: {
        ":until": started + 360_000,
        ":now": started,
        ":empty": "",
        ":attempt": new Date().toISOString(),
      },
      ConditionExpression:
        "attribute_exists(pk) AND (attribute_not_exists(lockUntil) OR lockUntil < :now)",
    }),
  );
  try {
    const secret = decryptSecret(record.secret);
    const token = provider === "drive" ? await driveToken(secret) : secret;
    // Validate folder access before enumerating, so an inaccessible folder cannot erase indexed data.
    if (provider === "drive") {
      const folder = await providerJson(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(record.folderId!)}?fields=id,mimeType,trashed&supportsAllDrives=true`,
        token,
      );
      if (
        folder.trashed ||
        folder.mimeType !== "application/vnd.google-apps.folder"
      )
        throw new Error("The selected Drive folder is unavailable");
    }
    const remote =
      provider === "drive"
        ? await driveDocuments(token, record.folderId!)
        : await notionDocuments(token);
    const existing = (await listDocuments(orgId)).filter(
      (doc) => doc.sourceProvider === provider,
    );
    const existingBySource = new Map(
      existing.map((doc) => [doc.sourceId, doc]),
    );
    let imported = 0,
      removed = 0,
      pending = 0;
    for (const source of remote) {
      const prior = existingBySource.get(source.id);
      if (
        prior?.sourceUpdatedAt === source.updatedAt &&
        prior.status === "ready"
      )
        continue;
      if (Date.now() - started > 210_000) {
        pending++;
        continue;
      }
      const docId =
        prior?.docId ??
        createHash("sha256").update(`${provider}:${source.id}`).digest("hex");
      const doc: DocumentRecord = {
        ...prior,
        docId,
        orgId,
        docName: source.name.slice(0, 240),
        status: prior?.status ?? "uploading",
        uploadedAt: prior?.uploadedAt ?? new Date().toISOString(),
        collection:
          prior?.collection ??
          (provider === "drive" ? "Google Drive" : "Notion"),
        sourceProvider: provider,
        sourceId: source.id,
        sourceUpdatedAt: source.updatedAt,
      };
      if (!prior)
        await docClient.send(
          new PutCommand({
            TableName: tableName(),
            Item: { ...doc, sourceUpdatedAt: "", ...docKey(orgId, docId) },
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
      await indexDocument(doc, await remoteContent(provider, token, source));
      imported++;
    }
    const remoteIds = new Set(remote.map((doc) => doc.id));
    for (const doc of existing) {
      if (remoteIds.has(doc.sourceId!)) continue;
      if (provider === "notion") {
        const check = await fetch(
          `https://api.notion.com/v1/pages/${encodeURIComponent(doc.sourceId!)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Notion-Version": "2025-09-03",
            },
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (check.ok) {
          const page = await check.json();
          if (!page.archived && !page.in_trash) continue;
        } else if (check.status !== 404 && check.status !== 403)
          throw new Error(
            "Could not verify removed Notion pages. No unverified pages were deleted.",
          );
      }
      if (Date.now() - started > 240_000) {
        pending++;
        continue;
      }
      await deleteDocument(doc);
      removed++;
    }
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: connectionKey(orgId, provider),
        UpdateExpression:
          "SET lastSyncedAt = :now, lockUntil = :zero, pending = :pending",
        ExpressionAttributeValues: {
          ":now": new Date().toISOString(),
          ":zero": 0,
          ":pending": pending,
        },
        ConditionExpression: "attribute_exists(pk)",
      }),
    );
    return { imported, removed, pending };
  } catch (error) {
    await docClient
      .send(
        new UpdateCommand({
          TableName: tableName(),
          Key: connectionKey(orgId, provider),
          UpdateExpression: "SET #error = :error, lockUntil = :zero",
          ExpressionAttributeNames: { "#error": "error" },
          ExpressionAttributeValues: {
            ":error": error instanceof Error ? error.message : "Sync failed",
            ":zero": 0,
          },
          ConditionExpression: "attribute_exists(pk)",
        }),
      )
      .catch(() => {});
    throw error;
  }
}
export async function disconnect(orgId: string, provider: Provider) {
  const current = await connection(orgId, provider);
  if (current?.lockUntil && current.lockUntil > Date.now())
    throw new Error("Wait for the current sync to finish before disconnecting");
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: connectionKey(orgId, provider),
      ConditionExpression:
        "attribute_not_exists(lockUntil) OR lockUntil < :now",
      ExpressionAttributeValues: { ":now": Date.now() },
    }),
  );
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: "SYNC#ACTIVE", sk: `${orgId}#${provider}` },
    }),
  );
}
