import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Pinecone } from "@pinecone-database/pinecone";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { toReqRes, toFetchResponse } from "fetch-to-node";
import { verifyToken } from "../../../lib/middleware";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index({ name: process.env.PINECONE_INDEX_NAME! });

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);
const TABLE = process.env.DYNAMO_TABLE_NAME!;

// ── Auth + membership guard ───────────────────────────────────────────────────

async function resolveOrgMember(
  request: Request,
  orgId: string
): Promise<{ error: string; status: number } | null> {
  // 1. Extract Bearer token
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { error: "Authentication required", status: 401 };
  }

  // 2. Verify JWT — reuse verifyToken from middleware
  let userId: string;
  try {
    const user = verifyToken(token);
    userId = user.userId;
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TokenExpiredError") return { error: "Token expired", status: 401 };
    return { error: "Invalid token", status: 401 };
  }

  // 3. Check org membership in DynamoDB
  const memberRecord = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `USER#${userId}`, sk: `MEMBER#${orgId}` },
    })
  );

  if (!memberRecord.Item) {
    // 404 instead of 403 — don't leak org existence
    return { error: "Org not found", status: 404 };
  }

  return null; // all good
}

// ── MCP Server factory ────────────────────────────────────────────────────────

function createServer(orgId: string) {
  const server = new McpServer({ name: "pinecone-rag", version: "1.0.0" });

  server.registerTool(
    "searchDocument",
    {
      title: "Search Documents",
      description:
        "Semantically search the Pinecone vector database filtered by organization ID and optional document IDs.",
      inputSchema: {
        query: z.string().describe("Natural language search query"),
        doc_ids: z
          .array(z.string())
          .optional()
          .describe("Optional list of document IDs to restrict search to specific documents within the org"),
        topK: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe("Number of results to return (default 5, max 20)"),
        namespace: z
          .string()
          .optional()
          .describe("Optional Pinecone namespace to search within"),
      },
    },
    // org_id removed from inputSchema — it's injected from the verified token
    async ({ query, doc_ids, topK, namespace }) => {
      const target = namespace ? index.namespace(namespace) : index;

      const filter: Record<string, unknown> =
        doc_ids && doc_ids.length > 0
          ? { $and: [{ org_id: { $eq: orgId } }, { doc_id: { $in: doc_ids } }] }
          : { org_id: { $eq: orgId } };

      const response = await target.searchRecords({
        query: {
          topK: topK ?? 5,
          inputs: { text: query },
          filter,
        },
        fields: ["text", "source_file", "doc_id", "chunk_index", "total_chunks", "org_id"],
      });

      const hits = response.result?.hits ?? [];

      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for query "${query}" in org "${orgId}"${
                doc_ids?.length ? ` within docs [${doc_ids.join(", ")}]` : ""
              }.`,
            },
          ],
        };
      }

      const formatted = hits
        .map((hit: any, i: number) => {
          const f = hit.fields ?? {};
          const score = hit.score != null ? hit.score.toFixed(4) : "N/A";
          return [
            `### Result ${i + 1} (score: ${score})`,
            `**Source:** ${f.source_file ?? "unknown"}`,
            `**Doc ID:** ${f.doc_id ?? "unknown"}`,
            `**Chunk:** ${f.chunk_index ?? "?"} / ${(f.total_chunks ?? 1) - 1}`,
            ``,
            f.text ?? "(no text)",
          ].join("\n");
        })
        .join("\n\n---\n\n");

      return { content: [{ type: "text", text: formatted }] };
    }
  );

  return server;
}

// ── Fetch handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed. Only POST is supported in stateless mode." },
        { status: 405, headers: { Allow: "POST" } }
      );
    }

    // Extract org_id from query param: POST /mcp?org_id=xxx
    const url = new URL(request.url);
    const orgId = url.searchParams.get("org_id")?.trim();

    if (!orgId) {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32600, message: "org_id query param is required" }, id: null },
        { status: 400 }
      );
    }

    // ── Auth + membership check before touching MCP ───────────────────────────
    const authError = await resolveOrgMember(request, orgId);
    if (authError) {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32600, message: authError.error }, id: null },
        { status: authError.status }
      );
    }

    // ── MCP handling ──────────────────────────────────────────────────────────
    const { req, res } = toReqRes(request);
    const server = createServer(orgId); // orgId locked in for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      return toFetchResponse(res);
    } catch (err: any) {
      transport.close().catch(() => {});
      server.close().catch(() => {});
      console.error("[MCP] Unhandled error:", err);

      return Response.json(
        { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null },
        { status: 500 }
      );
    }
  },
};