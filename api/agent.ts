import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AgentRequestBody {
  messages: ChatMessage[];
  systemPrompt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMcpUrl(request: Request): string {
  if (process.env.MCP_SERVER_URL) return process.env.MCP_SERVER_URL;
  const { protocol, host } = new URL(request.url);
  return `${protocol}//${host}/api/mcp`;
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

  // Build prior chat history (everything except the final user message)
  const chatHistory: BaseMessage[] = nonSystem
    .slice(0, -1)
    .map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content),
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

    const { messages, systemPrompt: systemOverride } = body;

    if (!messages?.length) {
      return Response.json(
        { error: "'messages' array required" },
        { status: 400 },
      );
    }

    const mcpUrl = getMcpUrl(request);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) =>
          controller.enqueue(sse(payload));

        // Declare outside try so finally can close it
        let mcpClient: MultiServerMCPClient | null = null;

        try {
          // 1. Connect to the MCP server using MultiServerMCPClient
          //    (Streamable HTTP transport — same pattern as 06-mcp chapter)
          mcpClient = new MultiServerMCPClient({
            "pinecone-rag": {
              transport: "http",
              url: mcpUrl,
            },
          });

          // 2. Load MCP tools as LangChain StructuredTools
          //    getTools() returns StructuredTool[] — pass the whole array to createAgent
          const tools = await mcpClient.getTools();

          // 3. Parse the incoming conversation
          const allMessages: ChatMessage[] = systemOverride
            ? [{ role: "system", content: systemOverride }, ...messages]
            : messages;

          const { systemContent, chatHistory, input } =
            parseMessages(allMessages);

          if (!input) {
            send({
              type: "error",
              message: "Last message must be from the user.",
            });
            controller.close();
            return;
          }

          // 4. Build the LLM
          const model = new ChatOpenAI({
            model: process.env.AI_MODEL,
            configuration: { baseURL: process.env.AI_ENDPOINT },
            apiKey: process.env.AI_API_KEY,
          });

          // 5. Create the agent using the v1 createAgent() API
          //    (ReAct loop is managed automatically — see 05-agents chapter)
          //    Pass the system prompt as an extra system message prepended to the
          //    messages array so createAgent() picks it up correctly.
          const agent = createAgent({
            model,
            tools, // StructuredTool[] from MCP
          });

          // 6. Build the full messages array for this invocation.
          //    createAgent() uses { messages } — it does NOT accept input/chat_history
          //    as top-level keys the way the old executor did.
          const agentMessages: BaseMessage[] = [
            // System instruction as the very first message
            new AIMessage({ content: systemContent, role: "system" } as any),
            // Prior turns from the conversation
            ...chatHistory,
            // The current user query
            new HumanMessage(input),
          ];

          // 7. Stream the agent run.
          //    Each chunk is one of:
          //      { messages: [...] }  — partial message updates / tool events
          //    The agent may call tools multiple times before producing a final answer.
          const agentStream = await agent.stream(
            { messages: agentMessages },
            { streamMode: "messages" },
          );

          for await (const [chunk, metadata] of agentStream) {
            // Tool call started (AIMessage carrying tool_calls)
            if (
              "tool_calls" in chunk &&
              Array.isArray(chunk.tool_calls) &&
              chunk.tool_calls.length > 0
            ) {
              for (const tc of chunk.tool_calls) {
                send({
                  type: "tool_start",
                  name: tc.name,
                  input: tc.args,
                });
              }
            }

            // Tool result returned (ToolMessage)
            if (chunk.getType?.() === "tool") {
              send({
                type: "tool_end",
                name: (chunk as any).name ?? metadata?.langgraph_node,
                output: chunk.content,
              });
            }

            // Streaming text token from the final answer
            if (
              chunk.getType?.() === "ai" &&
              typeof chunk.content === "string" &&
              chunk.content.length > 0 &&
              !("tool_calls" in chunk && (chunk as any).tool_calls?.length)
            ) {
              send({ type: "token", content: chunk.content });
            }
          }

          // 8. Emit done — the client assembles tokens into the final answer
          send({ type: "done" });
        } catch (err: any) {
          console.error("[agent] error:", err);
          send({
            type: "error",
            message: err?.message ?? "Internal server error",
          });
        } finally {
          // Always close the MCP client — no scope bug
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