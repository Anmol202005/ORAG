<div align="center">

```
  ██████╗ ██████╗  █████╗  ██████╗
 ██╔═══██╗██╔══██╗██╔══██╗██╔════╝
 ██║   ██║██████╔╝███████║██║  ███╗
 ██║   ██║██╔══██╗██╔══██║██║   ██║
 ╚██████╔╝██║  ██║██║  ██║╚██████╔╝
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝
```

**Your org's knowledge, ready for any model.**

*Organizational RAG & MCP Platform — now in early access.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-orag.theanmolsharma.com-white?style=flat-square)](https://orag.theanmolsharma.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-99.4%25-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com/)
[![AWS DynamoDB](https://img.shields.io/badge/Database-DynamoDB-FF9900?style=flat-square&logo=amazondynamodb&logoColor=white)](https://aws.amazon.com/dynamodb/)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)

</div>

---

## What is ORAG?

ORAG is an **organizational RAG and MCP platform** that connects your internal data to AI pipelines — with enterprise access controls built in from day one.

Stop duct-taping retrieval pipelines together. ORAG gives your team a single place to index knowledge, expose it via the **Model Context Protocol**, and manage exactly who can access what — all with sub-50ms retrieval and zero infrastructure to babysit.

> One config file is all it takes to expose your entire knowledge base as a fully typed MCP server — complete with streaming, auth, and observability out of the box.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Median retrieval latency | **< 50 ms** |
| Documents indexed per minute | **10,000+** |
| Uptime SLA | **99.9%** |
| Compliance | **SOC 2 Type II** |

---

## Features

### 🗂 RAG Pipelines — *Retrieve what matters*
Connect your org's documents, wikis, and databases into a unified retrieval layer. ORAG indexes, chunks, and embeds everything so your models always have the right context.

### 🌐 MCP Servers — *One protocol, every tool*
Spin up Model Context Protocol servers that give your agents structured, permissioned access to internal APIs, code repos, CRMs, and more — without bespoke glue code.

### 🔐 Access Control — *Org-grade permissions*
Role-based access across every knowledge base and MCP server. Audit logs, team workspaces, and SSO keep enterprise compliance teams happy.

### 📊 Observability — *Every call, traced*
Full request tracing across retrievals, tool calls, and completions. Latency breakdowns, token usage, and retrieval quality scores — all in one view.

---

## How It Works

```
01 → Connect sources      Link Notion, Confluence, S3, GitHub, or any custom data source.
02 → Configure pipelines  Choose chunking strategy, embedding model, and retrieval parameters.
03 → Expose via MCP       Your retrieval layer becomes a typed MCP server your agents can call.
04 → Ship to production   Deploy with one click. Monitor latency and quality from the dashboard.
```

---

## MCP in Minutes, Not Months

One config block connects Claude, Cursor, or any MCP-compatible agent to your entire organization's knowledge base:

```json
// ~/.claude/claude_code_config.json
{
  "mcpServers": {
    "orag": {
      "type": "http",
      "url": "https://orag.theanmolsharma.com/api/orgs/acme-corp/mcp",
      "headers": {
        "Authorization": "Bearer orag_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

That's it. Your agents now have permissioned, streaming, observable access to everything your org knows.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 · TypeScript · Vite · Framer Motion |
| **Backend** | Vercel Serverless Functions (TypeScript) |
| **Database** | AWS DynamoDB — single-table design |
| **Auth** | Google OAuth 2.0 + JWT |
| **Protocol** | Model Context Protocol (MCP) |
| **Hosting** | Vercel (zero-config deploys) |

---

## Architecture

### Single-Table DynamoDB Design

All entities live in one DynamoDB table, keyed by `pk + sk`:

| `pk` | `sk` | Entity |
|------|------|--------|
| `USER#<userId>` | `PROFILE` | User record |
| `USER#<userId>` | `MEMBER#<orgId>` | Org membership + role |
| `ORG#<orgId>` | `PROFILE` | Organization record |
| `SLUG#<slug>` | `ORG` | Slug → OrgId uniqueness guard |

**GSI1** — `EMAIL#<email>` → instant email lookup at sign-in  
**GSI2** — `PUBLIC_ORGS` → sparse index for public org discovery + search

### Authentication Flow

```
Client                             Server
  │                                  │
  │── Google ID Token ─────────────▶ POST /api/auth/google
  │                                  ├─ Verify with Google
  │                                  ├─ Lookup via GSI1 (email)
  │                                  ├─ Create user if new
  │◀── JWT { userId, email, name } ──┤
  │                                  │
  │── Authorization: Bearer <JWT> ──▶ All subsequent API calls
```

### Composable Middleware

```typescript
// lib/middleware.ts
compose(withCors, withAuth)(handler)

// withAuth         → requires valid JWT, injects req.user or returns 401
// withOptionalAuth → injects req.user if present, never blocks
// withCors         → CORS headers + OPTIONS preflight
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/google` | Verify Google token → return JWT |
| `GET` | `/api/auth/me` | Current user profile |
| `POST` | `/api/auth/signout` | Stateless — client drops JWT |

### Organizations
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orgs/mine` | User's orgs (BatchGet) |
| `GET` | `/api/orgs/public` | Public org discovery, `?search=` filter |
| `POST` | `/api/orgs` | Create org (atomic TransactWrite) |
| `POST` | `/api/orgs/:id/join` | Join org (`memberCount++`, race-safe) |
| `GET` | `/api/orgs/:slug` | Resolve slug → org profile |

---

## Getting Started

### Prerequisites
- Node.js 18+
- AWS account (DynamoDB)
- Google Cloud project (OAuth 2.0 credentials)

### Install

```bash
git clone https://github.com/Anmol202005/ORAG.git
cd ORAG
npm install
```

### Environment Variables

```env
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_jwt_secret

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
DYNAMO_TABLE_NAME=your_table

ZAI_API_KEY=your_zai_api_key
ZAI_MODEL=glm-4.5-flash
```

The backend chat agent uses Z.ai's OpenAI-compatible API at
`https://api.z.ai/api/paas/v4/`. It defaults to `glm-4.5-flash`, which is
[listed as free](https://docs.z.ai/guides/overview/pricing). Keep `ZAI_API_KEY`
in the local `.env` file and add it to your Vercel environment variables when
deploying. `ZAI_MODEL` is optional. The previous `AI_API_KEY`, `AI_ENDPOINT`,
and `AI_MODEL` settings are no longer used.

### Run Locally

```bash
# Frontend only (Vite dev server → localhost:5173)
npm run dev

# Full stack with API
npx vercel dev
```

### Deploy

Push to GitHub → import in the [Vercel dashboard](https://vercel.com/new) → add env vars → done.  
The `api/` directory is auto-detected as serverless functions. Zero config required.

---

## Project Structure

```
ORAG/
├── api/                  # Vercel serverless functions
│   ├── auth/             #   google.ts · me.ts · signout.ts
│   └── orgs/             #   mine.ts · public.ts · [id]/join.ts · [slug].ts
├── lib/
│   └── middleware.ts     # withAuth · withOptionalAuth · withCors · compose
├── src/                  # React 18 frontend
│   ├── components/
│   └── pages/
├── vercel.json           # Deployment config
├── vite.config.ts
└── DynamoDoc.txt         # Full DB schema reference
```

---

## Contributing

1. Fork the repo
2. `git checkout -b feat/your-feature`
3. `git commit -m 'feat: your change'`
4. Open a Pull Request

Please run `npm run lint` before submitting.

---

<div align="center">

**[→ Try ORAG free](https://orag.theanmolsharma.com)**  &nbsp;·&nbsp;  **[Read the docs](https://orag.theanmolsharma.com/docs)**

*Get your organization's knowledge base production-ready in under an hour. No infrastructure to manage.*

<br/>

Made by [Anmol Sharma](https://github.com/Anmol202005)

</div>

## Workspace features

The workspace supports:

- **Cited answers:** inline citations open the exact retrieved passage. PDF passages retain page numbers. Deleted documents and superseded versions are excluded from new retrievals.
- **Private saved conversations:** chats are stored per user and organization in DynamoDB. Rename conversations, search their messages, bookmark answers, and resume them from the Chats tab. Concurrent edits are checked by revision; conversations are limited to 500 messages and 300 KB.
- **Document management:** preview extracted content, rename files, organize collections, replace files, and delete originals, passages, and index entries. Existing documents indexed before this update need to be replaced to enable full previews.
- **Upload status:** select multiple files, track byte progress and extraction/indexing stages, detect duplicates by content hash, and retry failures. A failed replacement keeps the previous committed evidence available.
- **Connected sources:** owners/admins can connect a Google Drive folder (including subfolders and supported Google Docs/files), or Notion pages shared with an internal connection. Manual and scheduled sync update changed content and remove deleted content. Disconnecting keeps imported documents until you delete them.

Original uploads and extracted passage snapshots stay in **private Vercel Blob storage**. Budget for their retained storage. The workspace and API responses are private and are not cached.

### Source connection setup

Configure these server-side environment variables:

```env
# Existing application services
DYNAMO_TABLE_NAME=your_table
PINECONE_API_KEY=your_key
PINECONE_INDEX_NAME=your_integrated_embedding_index
BLOB_READ_WRITE_TOKEN=your_private_blob_store_token
JWT_SECRET=your_session_signing_secret

# Source connections
INTEGRATION_ENCRYPTION_KEY=a_random_secret_with_at_least_32_characters
APP_URL=https://your-deployment.example
GOOGLE_CLIENT_ID=your_oauth_web_client_id
GOOGLE_CLIENT_SECRET=your_oauth_web_client_secret

# Scheduled source sync
CRON_SECRET=a_random_secret
```

`TABLE_NAME` remains supported as a fallback for the workspace APIs. All services must point to the same DynamoDB table. Keep the integration encryption key stable: changing it requires reconnecting sources.

For **Google Drive**, enable the Drive API for your Google Cloud project. Add `${APP_URL}/api/integrations/google-callback` as an authorized redirect URI for its OAuth web client. Configure the consent screen for `https://www.googleapis.com/auth/drive.readonly` and add test users when the app is in testing. The workspace asks for a folder URL or ID before authorization. Google may require verification before you make this scope available broadly. See [Google's server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

For **Notion**, create an internal connection with permission to read content, then share the intended pages with it. An organization owner/admin enters the connection token in Connected sources. The token is validated, encrypted on the server, and never returned to the browser. Only content shared with that connection is indexed. See [Notion's connection setup](https://developers.notion.com/docs/create-a-notion-integration).

Imported content is readable by all members of the ORAG organization. A connection supports up to 1,000 documents; choose a focused Drive folder or share a focused set of Notion pages. Drive spreadsheets/slides and Notion attachments are not imported by this text connector.

### Scheduled refreshes

`vercel.json` registers `/api/cron/sync-sources` at 02:00 UTC daily. Configure `CRON_SECRET` in Vercel so scheduled requests are authenticated. Connections use refresh credentials and server-side leases; sync runs are bounded by the serverless execution budget. The scheduler prioritizes the oldest attempt. Large imports can span several runs; the source panel reports pending items and **Sync now** continues immediately. For larger deployments, move sync work to a durable queue with a worker per connection.

No DynamoDB index migration is required. New records use these keys:

| Partition key | Sort key | Purpose |
|---|---|---|
| `ORG#<orgId>` | `DOC#<docId>` | Document metadata, status and committed snapshot |
| `ORG#<orgId>` | `HASH#<sha256>` | Duplicate guard for uploaded files |
| `USER#<userId>` | `CHAT#<orgId>#<chatId>` | Private conversation with revision |
| `ORG#<orgId>` | `INTEGRATION#<provider>` | Encrypted source credentials and sync state |
| `SYNC#ACTIVE` | `<orgId>#<provider>` | Scheduled-sync registry |
| `OAUTH#<nonce>` | `STATE` | Single-use Google OAuth state; expiry is checked in code |

Optionally configure DynamoDB TTL for `expiresAt` to clean up unused OAuth state records.

### Verification

```bash
npm run build
npm run check:api
npm test
npx playwright install chromium
npm run test:ui
npm run lint
```

The backend tests mock DynamoDB, private Blob storage, the vector index, and source APIs. Browser checks cover cited chat, saved history, bookmarks, document operations, connector controls, failed-upload retry, and mobile layout with mocked API responses. Run a deployment smoke test against configured services before release; these tests do not authorize or contact real connected accounts.
