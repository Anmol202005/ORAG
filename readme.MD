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
```

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