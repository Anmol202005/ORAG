import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import {
  chunkPages,
  parseCitations,
  citationId,
  validateFileName,
  scopeToolInput,
} from "../lib/knowledge-utils.js";
import { encryptSecret, decryptSecret } from "../lib/integration-secrets.js";
process.env.JWT_SECRET = "test-only-secret-never-used-in-production";
process.env.INTEGRATION_ENCRYPTION_KEY =
  "test-only-encryption-key-with-32-characters";
process.env.DYNAMO_TABLE_NAME = "test-table";
const records = new Map<string, Record<string, unknown>>();
const blobs = new Map<string, string>();
const vectors: Record<string, unknown>[] = [];
const key = (value: Record<string, unknown>) => `${value.pk}|${value.sk}`;
const conditional = () =>
  Object.assign(new Error("Conditional check failed"), {
    name: "ConditionalCheckFailedException",
  });
const originalSend = DynamoDBDocumentClient.prototype.send;
DynamoDBDocumentClient.prototype.send = async function (command: {
  input: Record<string, unknown>;
  constructor: { name: string };
}) {
  const data = command.input;
  const k = key((data.Key ?? data.Item ?? {}) as Record<string, unknown>);
  const row = records.get(k);
  const values = (data.ExpressionAttributeValues ?? {}) as Record<
    string,
    unknown
  >;
  const condition = String(data.ConditionExpression ?? "");
  if (command.constructor.name === "GetCommand")
    return { Item: row ? structuredClone(row) : undefined };
  if (command.constructor.name === "QueryCommand")
    return {
      Items: [...records.values()].filter(
        (r) =>
          r.pk === values[":pk"] &&
          (!values[":prefix"] ||
            String(r.sk).startsWith(String(values[":prefix"]))),
      ),
    };
  if (condition.includes("attribute_exists(pk)") && !row) throw conditional();
  if (
    condition.includes("lockUntil < :now") &&
    Number(row?.lockUntil ?? 0) >= Number(values[":now"])
  )
    throw conditional();
  if (
    condition.includes("operation = :operation") &&
    row?.operation !== values[":operation"]
  )
    throw conditional();
  if (
    condition.includes("uploadId = :upload") &&
    row?.uploadId !== values[":upload"]
  )
    throw conditional();
  if (
    condition.includes("revision = :revision") &&
    row?.revision !== values[":revision"]
  )
    throw conditional();
  if (command.constructor.name === "PutCommand") {
    if (condition === "attribute_not_exists(pk)" && row) throw conditional();
    if (
      condition.includes("docId = :doc") &&
      row &&
      row.docId !== values[":doc"]
    )
      throw conditional();
    records.set(k, structuredClone(data.Item as Record<string, unknown>));
    return {};
  }
  if (command.constructor.name === "DeleteCommand") {
    if (condition.includes("docId = :doc") && row?.docId !== values[":doc"])
      throw conditional();
    records.delete(k);
    return {};
  }
  if (command.constructor.name === "UpdateCommand") {
    const next = { ...row, ...(data.Key as Record<string, unknown>) };
    const names = (data.ExpressionAttributeNames ?? {}) as Record<
      string,
      string
    >;
    for (const part of String(data.UpdateExpression)
      .replace(/^SET /, "")
      .split(", ")) {
      const [name, value] = part.split(" = ");
      next[names[name] ?? name] = values[value];
    }
    records.set(k, next);
    return {};
  }
  throw new Error(`Unexpected command ${command.constructor.name}`);
} as typeof originalSend;
const knowledge = await import("../lib/knowledge.js");
const docsHandler = (await import("../api/orgs/[slug]/documents.js")).default;
const chatsHandler = (await import("../api/orgs/[slug]/chats.js")).default;
const integrationsHandler = (await import("../api/orgs/[slug]/integrations.js"))
  .default;
const integrations = await import("../lib/integrations.js");
let failIndex = false;
knowledge.knowledgeServices.put = (async (_path: string, content: string) => {
  const url = `https://test.private.blob.vercel-storage.com/${randomUUID()}`;
  blobs.set(url, content);
  return { url };
}) as typeof knowledge.knowledgeServices.put;
knowledge.knowledgeServices.get = (async (url: string) => ({
  statusCode: 200,
  stream: new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from(blobs.get(url) ?? ""));
      controller.close();
    },
  }),
})) as typeof knowledge.knowledgeServices.get;
knowledge.knowledgeServices.del = (async (urls: string | string[]) => {
  for (const url of Array.isArray(urls) ? urls : [urls]) blobs.delete(url);
}) as typeof knowledge.knowledgeServices.del;
knowledge.knowledgeServices.vectorIndex = (() => ({
  upsertRecords: async ({
    records,
  }: {
    records: Record<string, unknown>[];
  }) => {
    if (failIndex) throw new Error("Vector store unavailable");
    vectors.push(...records);
  },
  deleteMany: async ({
    filter,
  }: {
    filter: { $and: Record<string, { $eq: string }>[] };
  }) => {
    for (let i = vectors.length - 1; i >= 0; i--)
      if (
        filter.$and.every((condition) =>
          Object.entries(condition).every(
            ([field, value]) => vectors[i][field] === value.$eq,
          ),
        )
      )
        vectors.splice(i, 1);
  },
})) as typeof knowledge.knowledgeServices.vectorIndex;
const originalFetch = globalThis.fetch;
after(() => {
  DynamoDBDocumentClient.prototype.send = originalSend;
  globalThis.fetch = originalFetch;
});
beforeEach(() => {
  records.clear();
  blobs.clear();
  vectors.length = 0;
  failIndex = false;
  globalThis.fetch = originalFetch;
  for (const row of [
    { pk: "SLUG#acme", sk: "ORG", orgId: "org1" },
    { pk: "USER#alice", sk: "MEMBER#org1", role: "owner" },
    { pk: "USER#bob", sk: "MEMBER#org1", role: "member" },
  ])
    records.set(key(row), row);
});
async function request(
  handler: typeof docsHandler,
  method: string,
  body: unknown = {},
  user = "alice",
  query = {},
) {
  const token = jwt.sign(
    { userId: user, email: `${user}@test.example`, name: user },
    process.env.JWT_SECRET!,
  );
  const req = {
    method,
    body,
    headers: { authorization: `Bearer ${token}` },
    query: { slug: "acme", ...query },
  };
  const result = { status: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(data: unknown) {
      result.body = data;
      return this;
    },
    setHeader() {},
    end() {
      return this;
    },
  };
  await handler(
    req as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1],
  );
  return result;
}
async function prepare(fileName = "guide.txt") {
  const response = await request(docsHandler, "POST", {
    action: "prepare",
    fileName,
  });
  assert.equal(response.status, 200);
  return (await knowledge.getDocument(
    "org1",
    (response.body as { docId: string }).docId,
  )) as knowledge.DocumentRecord;
}
test("page-aware chunking keeps overlap within the page and handles empty documents", () => {
  const chunks = chunkPages(
    [
      { text: "a b c d e f g", page: 1 },
      { text: "next page", page: 2 },
    ],
    5,
    2,
  );
  assert.deepEqual(
    chunks.map((c) => [c.text, c.page, c.chunkIndex]),
    [
      ["a b c d e", 1, 0],
      ["d e f g", 1, 1],
      ["next page", 2, 2],
    ],
  );
  assert.deepEqual(chunkPages([{ text: "  " }]), []);
  assert.throws(() => chunkPages([], 5, 5));
});
test("citation parsing preserves provenance and ignores unrelated or malformed tool results", () => {
  const source = {
    id: citationId("doc", "v1", 0),
    docId: "doc",
    docName: "Guide",
    text: "Evidence",
    chunkIndex: 0,
    page: 3,
  };
  assert.deepEqual(parseCitations(JSON.stringify({ results: [source, {}] })), [
    source,
  ]);
  assert.deepEqual(
    parseCitations([
      { type: "text", text: JSON.stringify({ results: [source] }) },
    ]),
    [source],
  );
  assert.deepEqual(parseCitations("not-json"), []);
});
test("document scope overrides model-provided scope, including ToolCall envelopes", () => {
  assert.deepEqual(
    scopeToolInput({ query: "test", doc_ids: [] }, ["allowed"]),
    { query: "test", doc_ids: ["allowed"] },
  );
  assert.deepEqual(
    scopeToolInput(
      {
        type: "tool_call",
        id: "call",
        args: { query: "test", doc_ids: ["other"] },
      },
      ["allowed"],
    ),
    {
      type: "tool_call",
      id: "call",
      args: { query: "test", doc_ids: ["allowed"] },
    },
  );
});
test("connection credentials are encrypted and reject tampering", () => {
  const encrypted = encryptSecret("private-refresh-token");
  assert.ok(!encrypted.includes("private-refresh-token"));
  assert.equal(decryptSecret(encrypted), "private-refresh-token");
  const parts = encrypted.split(".");
  parts[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSecret(parts.join(".")));
});
test("document preparation rejects invalid names and cross-organization replacement", async () => {
  assert.throws(() => validateFileName("../secret.txt"));
  assert.throws(() => validateFileName("x\u0000.txt"));
  assert.equal(
    (
      await request(docsHandler, "POST", {
        action: "prepare",
        fileName: "guide.txt",
        replaceId: "foreign",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        docsHandler,
        "POST",
        { action: "prepare", fileName: "guide.txt" },
        "outsider",
      )
    ).status,
    404,
  );
});
test("indexing retains evidence, reports ready status and prevents duplicate uploads", async () => {
  const doc = await prepare();
  const result = await knowledge.indexDocument(
    doc,
    Buffer.from("A useful policy."),
  );
  assert.equal(result?.status, "ready");
  assert.equal(result?.progress, 100);
  assert.equal(
    (await knowledge.getPassages(result!))[0].text,
    "A useful policy.",
  );
  const duplicate = await prepare("copy.txt");
  await assert.rejects(
    () => knowledge.indexDocument(duplicate, Buffer.from("A useful policy.")),
    /already in your workspace/,
  );
  assert.equal(
    (await knowledge.getDocument("org1", duplicate.docId))?.status,
    "error",
  );
});
test("failed replacement retains the committed evidence; successful retry removes old vectors", async () => {
  const doc = await prepare();
  const first = (await knowledge.indexDocument(
    doc,
    Buffer.from("Original policy."),
  ))!;
  failIndex = true;
  await assert.rejects(
    () => knowledge.indexDocument(first, Buffer.from("Updated policy.")),
    /Vector store unavailable/,
  );
  const failed = (await knowledge.getDocument("org1", doc.docId))!;
  assert.equal(failed.version, first.version);
  assert.ok(blobs.has(first.snapshotUrl!));
  assert.equal(failed.status, "error");
  failIndex = false;
  const updated = (await knowledge.indexDocument(
    failed,
    Buffer.from("Updated policy."),
  ))!;
  assert.notEqual(updated.version, first.version);
  assert.equal(vectors.length, 1);
  assert.equal(vectors[0].version, updated.version);
  assert.ok(!blobs.has(first.snapshotUrl!));
});
test("deletion purges passages, retained evidence, metadata and duplicate guard", async () => {
  const doc = await prepare();
  const originalUrl =
    "https://test.private.blob.vercel-storage.com/original.txt";
  blobs.set(originalUrl, "Delete me.");
  const indexed = (await knowledge.indexDocument(
    doc,
    Buffer.from("Delete me."),
    originalUrl,
  ))!;
  assert.ok(
    blobs.has(originalUrl),
    "the private original must be retained until deletion",
  );
  await knowledge.deleteDocument(indexed);
  assert.equal(await knowledge.getDocument("org1", doc.docId), undefined);
  assert.equal(vectors.length, 0);
  assert.equal(blobs.size, 0);
  await knowledge.indexDocument(await prepare(), Buffer.from("Delete me."));
});
test("private saved chats enforce user isolation, optimistic revisions and message search", async () => {
  const id = randomUUID();
  const chat = {
    id,
    title: "Onboarding",
    messages: [
      {
        id: "m",
        role: "user",
        content: "Where is the handbook?",
        timestamp: "10:00",
      },
    ],
    docIds: [],
    expectedRevision: 0,
  };
  assert.equal((await request(chatsHandler, "PUT", chat)).status, 200);
  assert.equal((await request(chatsHandler, "PUT", chat)).status, 409);
  assert.equal(
    (await request(chatsHandler, "GET", {}, "bob", { id })).status,
    404,
  );
  assert.equal(
    (
      (await request(chatsHandler, "GET", {}, "alice", { search: "handbook" }))
        .body as { chats: unknown[] }
    ).chats.length,
    1,
  );
  assert.equal(
    (
      await request(chatsHandler, "PUT", {
        ...chat,
        expectedRevision: 1,
        title: "Team handbook",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(chatsHandler, "DELETE", {}, "bob", { id })).status,
    200,
  );
  assert.equal(
    (await request(chatsHandler, "GET", {}, "alice", { id })).status,
    200,
  );
});
test("only administrators can connect sources and secrets are omitted from responses", async () => {
  assert.equal(
    (
      await request(
        integrationsHandler,
        "POST",
        { provider: "notion", action: "connect", token: "token" },
        "bob",
      )
    ).status,
    403,
  );
  await integrations.connect("org1", "notion", "private-token");
  const result = await request(integrationsHandler, "GET");
  assert.ok(!JSON.stringify(result.body).includes("private-token"));
  assert.ok(!JSON.stringify(result.body).includes("secret"));
});
test("Notion sync imports, updates and confirms removed pages before purging", async () => {
  await integrations.connect("org1", "notion", "private-token");
  let version = "2026-01-01",
    content = "Initial handbook",
    exists = true;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/search"))
      return Response.json({
        results: exists
          ? [
              {
                id: "page-1",
                last_edited_time: version,
                properties: {
                  title: { type: "title", title: [{ plain_text: "Handbook" }] },
                },
              },
            ]
          : [],
        has_more: false,
      });
    if (url.includes("/blocks/"))
      return Response.json({
        results: [
          {
            id: "b",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: content }] },
          },
        ],
        has_more: false,
      });
    if (url.includes("/pages/")) return new Response("", { status: 404 });
    throw new Error(`Unexpected provider URL ${url}`);
  };
  const initial = await integrations.syncConnection("org1", "notion");
  assert.equal(initial.imported, 1);
  const doc = (await knowledge.listDocuments("org1"))[0];
  assert.equal(doc.sourceProvider, "notion");
  version = "2026-01-02";
  content = "Updated handbook";
  await integrations.syncConnection("org1", "notion");
  assert.equal(
    (
      await knowledge.getPassages(
        (await knowledge.getDocument("org1", doc.docId))!,
      )
    )[0].text,
    content,
  );
  exists = false;
  const removed = await integrations.syncConnection("org1", "notion");
  assert.equal(removed.removed, 1);
  assert.equal((await knowledge.listDocuments("org1")).length, 0);
});
test("provider failures preserve previously indexed documents", async () => {
  await integrations.connect("org1", "notion", "private-token");
  const doc = await prepare();
  await knowledge.indexDocument(doc, Buffer.from("Keep this evidence"));
  globalThis.fetch = async () => new Response("", { status: 503 });
  await assert.rejects(
    () => integrations.syncConnection("org1", "notion"),
    /503/,
  );
  assert.equal(
    (await knowledge.getDocument("org1", doc.docId))?.status,
    "ready",
  );
  assert.equal((await integrations.connection("org1", "notion"))?.lockUntil, 0);
});

test("Drive sync refreshes OAuth credentials and imports nested folders and exported Google Docs", async () => {
  await integrations.connect(
    "org1",
    "drive",
    "private-drive-refresh",
    "folder-root",
  );
  let removed = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") {
      assert.equal(
        new URLSearchParams(String(init?.body)).get("refresh_token"),
        "private-drive-refresh",
      );
      return Response.json({ access_token: "test-drive-access" });
    }
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer test-drive-access",
    );
    if (url.pathname === "/drive/v3/files/folder-root")
      return Response.json({
        id: "folder-root",
        mimeType: "application/vnd.google-apps.folder",
      });
    if (
      url.pathname === "/drive/v3/files" &&
      url.searchParams.get("q")?.includes("folder-root")
    )
      return Response.json({
        files: [
          { id: "nested", mimeType: "application/vnd.google-apps.folder" },
          ...(!removed
            ? [
                {
                  id: "google-doc",
                  name: "Policy",
                  mimeType: "application/vnd.google-apps.document",
                  modifiedTime: "2026-10-11",
                },
              ]
            : []),
        ],
      });
    if (url.pathname === "/drive/v3/files")
      return Response.json({
        files: [
          {
            id: "markdown",
            name: "Guide.md",
            mimeType: "text/markdown",
            modifiedTime: "2026-10-11",
          },
        ],
      });
    if (url.pathname.endsWith("/export")) {
      assert.equal(url.searchParams.get("mimeType"), "text/plain");
      return new Response("Exported policy");
    }
    if (url.searchParams.get("alt") === "media")
      return new Response("Nested folder guide");
    throw new Error(`Unexpected Google request ${url}`);
  };
  const first = await integrations.syncConnection("org1", "drive");
  assert.equal(first.imported, 2);
  assert.deepEqual(
    (await knowledge.listDocuments("org1")).map((doc) => doc.docName).sort(),
    ["Guide.md", "Policy.txt"],
  );
  removed = true;
  assert.equal((await integrations.syncConnection("org1", "drive")).removed, 1);
  assert.equal((await knowledge.listDocuments("org1")).length, 1);
});

test("incomplete Drive enumeration never deletes indexed source documents", async () => {
  await integrations.connect("org1", "drive", "refresh", "folder-root");
  const doc = await prepare();
  const indexed = (await knowledge.indexDocument(
    { ...doc, sourceProvider: "drive", sourceId: "keep" },
    Buffer.from("Keep this source"),
  ))!;
  await knowledge.updateDocument("org1", doc.docId, {
    sourceProvider: "drive",
    sourceId: "keep",
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com"))
      return Response.json({ access_token: "access" });
    if (url.includes("files/folder-root"))
      return Response.json({ mimeType: "application/vnd.google-apps.folder" });
    return Response.json({ files: [], incompleteSearch: true });
  };
  await assert.rejects(
    () => integrations.syncConnection("org1", "drive"),
    /incomplete listing/,
  );
  assert.equal(
    (await knowledge.getDocument("org1", indexed.docId))?.version,
    indexed.version,
  );
});

test("interrupted processing becomes retryable instead of appearing stuck indefinitely", () => {
  const doc = {
    docId: "doc",
    orgId: "org1",
    docName: "file.txt",
    status: "indexing" as const,
    uploadedAt: "2026-01-01",
    processingStartedAt: Date.now() - 700_000,
  };
  assert.equal(knowledge.documentStatus(doc).status, "error");
  assert.match(knowledge.documentStatus(doc).error!, /interrupted/);
});
