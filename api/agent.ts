import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { verifyToken } from "../lib/middleware";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

export const dynamic = "force-dynamic";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);
const TABLE = process.env.DYNAMO_TABLE_NAME!;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AgentRequestBody {
  messages: ChatMessage[];
  org_id: string;          // required — scopes the agent to the user's org
  systemPrompt?: string;
}

// ── Auth + membership guard ───────────────────────────────────────────────────

async function authenticate(
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMcpUrl(request: Request, orgId: string): string {
  // Pass org_id as query param so MCP server can scope searches to this org
  const base = process.env.MCP_SERVER_URL
    ? process.env.MCP_SERVER_URL
    : `${new URL(request.url).protocol}//${new URL(request.url).host}/api/mcp`;

  return `${base}?org_id=${encodeURIComponent(orgId)}`;
}

function sse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseMessages(messages: ChatMessage[]): {
  systemContent: string;
  chatHistory: BaseMessage[];
  input: string;
} {
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const systemContent =
    systemMsgs.map((m) => m.content).join("\n") ||
    `You are a helpful AI assistant with access to a Pinecone knowledge base.
Always call searchDocument first when the user asks a factual question.
If no relevant results are found, say so clearly.
Today is ${new Date().toISOString().slice(0, 10)}.`;

  const last = nonSystem.at(-1);
  const input = last?.role === "user" ? last.content : "";

  const chatHistory: BaseMessage[] = nonSystem
    .slice(0, -1)
    .map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

  return { systemContent, chatHistory, input };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let body: AgentRequestBody;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { messages, org_id, systemPrompt: systemOverride } = body;

    if (!messages?.length) {
      return Response.json({ error: "'messages' array required" }, { status: 400 });
    }

    if (!org_id?.trim()) {
      return Response.json({ error: "'org_id' is required" }, { status: 400 });
    }

    const orgId = org_id.trim();

    // ── Auth + membership check before streaming ──────────────────────────────
    const authError = await authenticate(request, orgId);
    if (authError) {
      return Response.json({ error: authError.error }, { status: authError.status });
    }

    // ── Verified — start streaming ────────────────────────────────────────────
    const mcpUrl = getMcpUrl(request, orgId);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) =>
          controller.enqueue(sse(payload));

        let mcpClient: MultiServerMCPClient | null = null;

        try {
          // 1. Connect to MCP — org_id is baked into the URL so the MCP server
          //    scopes all Pinecone searches to this org automatically
          mcpClient = new MultiServerMCPClient({
            "pinecone-rag": {
              transport: "http",
              url: mcpUrl,
              // Forward the Authorization header so MCP server can re-verify
              headers: {
                Authorization: request.headers.get("authorization") ?? "",
              },
            },
          });

          const tools = await mcpClient.getTools();

          const allMessages: ChatMessage[] = systemOverride
            ? [{ role: "system", content: systemOverride }, ...messages]
            : messages;

          const { systemContent, chatHistory, input } = parseMessages(allMessages);

          if (!input) {
            send({ type: "error", message: "Last message must be from the user." });
            controller.close();
            return;
          }

          const model = new ChatOpenAI({
            model: process.env.AI_MODEL,
            configuration: { baseURL: process.env.AI_ENDPOINT },
            apiKey: process.env.AI_API_KEY,
          });

          const agent = createAgent({ model, tools });

          const agentMessages: BaseMessage[] = [
            new AIMessage({ content: systemContent, role: "system" } as any),
            ...chatHistory,
            new HumanMessage(input),
          ];

          const agentStream = await agent.stream(
            { messages: agentMessages },
            { streamMode: "messages" }
          );

          for await (const [chunk, metadata] of agentStream) {
            if (
              "tool_calls" in chunk &&
              Array.isArray(chunk.tool_calls) &&
              chunk.tool_calls.length > 0
            ) {
              for (const tc of chunk.tool_calls) {
                send({ type: "tool_start", name: tc.name, input: tc.args });
              }
            }

            if (chunk.getType?.() === "tool") {
              send({
                type: "tool_end",
                name: (chunk as any).name ?? metadata?.langgraph_node,
                output: chunk.content,
              });
            }

            if (
              chunk.getType?.() === "ai" &&
              typeof chunk.content === "string" &&
              chunk.content.length > 0 &&
              !("tool_calls" in chunk && (chunk as any).tool_calls?.length)
            ) {
              send({ type: "token", content: chunk.content });
            }
          }

          send({ type: "done" });
        } catch (err: any) {
          console.error("[agent] error:", err);
          send({ type: "error", message: err?.message ?? "Internal server error" });
        } finally {
          if (mcpClient) await mcpClient.close().catch(() => {});
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
};