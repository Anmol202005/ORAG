import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Pinecone } from "@pinecone-database/pinecone";
import { z } from "zod";
import { toReqRes, toFetchResponse } from "fetch-to-node";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

// ── Pinecone (reused across warm invocations) ─────────────────────────────────
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index({
  name: process.env.PINECONE_INDEX_NAME!,
});

// When running on Vercel the upload API is on the same origin.
// Override with UPLOAD_API_URL for local dev (e.g. http://localhost:3000).
function getUploadUrl(request: Request): string {
  if (process.env.UPLOAD_API_URL) return process.env.UPLOAD_API_URL;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

// ── MCP server factory (fresh instance per request) ───────────────────────────
function createServer(uploadBaseUrl: string) {
  const server = new McpServer({ name: "pinecone-rag", version: "1.0.0" });
  
  // ── searchDocument ──────────────────────────────────────────────────────────
  server.registerTool(
    "searchDocument",
    {
      title: "Search Documents",
      description:
        "Semantically search the Pinecone vector database with a natural language query.",
      inputSchema: {
        query: z.string().describe("Natural language search query"),
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
    async ({ query, topK, namespace }) => {
      const target = namespace ? index.namespace(namespace) : index;

      const response = await target.searchRecords({
        query: { topK: topK ?? 5, inputs: { text: query } },
        fields: ["text", "source_file", "chunk_index", "total_chunks"],
      });

      const hits = response.result?.hits ?? [];

      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: "No results found for your query." }],
        };
      }

      const formatted = hits
        .map((hit: any, i: number) => {
          const f = hit.fields ?? {};
          const score = hit.score != null ? hit.score.toFixed(4) : "N/A";
          return [
            `### Result ${i + 1} (score: ${score})`,
            `**Source:** ${f.source_file ?? "unknown"}`,
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

// ── Vercel Web Standard handler ───────────────────────────────────────────────
export default {
  async fetch(request: Request): Promise<Response> {
    const method = request.method;

    // Only POST is supported in stateless mode.
    // GET/DELETE are not needed without session management.
    if (method !== "POST") {
      return Response.json(
        { error: "Method not allowed. Only POST is supported in stateless mode." },
        { status: 405, headers: { Allow: "POST" } }
      );
    }

    let body: unknown;
    try {
      body = await request;
    } catch {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32700, message: "Parse error: invalid JSON" }, id: null },
        { status: 400 }
      );
    }

    const uploadBaseUrl = getUploadUrl(request);

    // Use fetch-to-node to produce proper Node IncomingMessage + ServerResponse
    // shims — the MCP SDK's handleRequest requires real Node-style objects.
    const { req, res } = toReqRes(request);

    // Fresh server + stateless transport per request
    const server = createServer(uploadBaseUrl);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session tracking
      enableJsonResponse: true,      // plain JSON responses (no SSE streaming)
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);

      // Cleanup once the response stream closes
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      // Convert Node-style ServerResponse back to a Web API Response
      return toFetchResponse(res);
    } catch (err: any) {
      // Ensure cleanup even on error
      transport.close().catch(() => {});
      server.close().catch(() => {});

      console.error("[MCP] Unhandled error:", err);

      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        },
        { status: 500 }
      );
    }
  },
};