# CarInsight Backend

Backend API for CarInsight - an AI-powered automotive marketplace platform, built with NestJS, Prisma, PostgreSQL, and integrated AI capabilities.

> **Portfolio Sample** — This repository is public for technical evaluation purposes. See [NOTICE.md](NOTICE.md) for terms.

## 🚀 Tech Stack

| Technology | Purpose |
|------------|---------|
| **NestJS** | Backend framework |
| **Prisma** | ORM and database migrations |
| **PostgreSQL** | Primary database |
| **OpenAI / Groq** | LLM providers with fallback |
| **Swagger** | API documentation |
| **Jest** | Testing framework |

## 📋 Prerequisites

- Node.js (v18+)
- Docker & Docker Compose (for database)
- OpenAI API Key and/or Groq API Key (for AI features)

## ⚙️ Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file with:
   ```env
   DATABASE_URL="postgresql://carinsight:carinsight@localhost:5432/carinsight?schema=public"
   OPENAI_API_KEY="your-openai-key"
   GROQ_API_KEY="your-groq-key"
   ```

3. **Start Database:**
   ```bash
   docker-compose up -d
   ```

4. **Database Migration:**
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Seed Database (optional):**
   ```bash
   npx prisma db seed
   ```

6. **Run Application:**
   ```bash
   npm run start:dev
   ```

## 📦 API Modules

### Core Modules

| Endpoint | Description |
|----------|-------------|
| `/vehicles` | Vehicle inventory CRUD and search |
| `/users` | User management |
| `/interactions` | Track user actions (favorites, views, contacted) |
| `/dealers` | Partner/dealer management |

### AI Module (`/api/chat`)

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat/start` | Start a contextual chat session with a vehicle |
| `POST /api/chat/:sessionId/message` | Send a message in existing session |

## 🤖 AI Architecture

### LLM Router Service

Multi-provider LLM service with automatic failover and circuit breaker pattern:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Request   │────▶│   OpenAI    │────▶│   Response  │
└─────────────┘     │  (primary)  │     └─────────────┘
                    └──────┬──────┘
                           │ (on failure)
                    ┌──────▼──────┐
                    │    Groq     │
                    │ (fallback)  │
                    └──────┬──────┘
                           │ (on failure)
                    ┌──────▼──────┐
                    │    Mock     │
                    │  (dev only) │
                    └─────────────┘
```

**Features:**
- **Circuit Breaker**: Opens after 3 consecutive failures, auto-resets after 60s
- **Provider Priority**: OpenAI → Groq → Mock fallback
- **Models**: `gpt-4o-mini` (OpenAI), `llama-3.1-8b-instant` (Groq)

### Chat Service

Contextual chat with vehicle information:

- **Start Chat**: Fetches vehicle details, creates session, generates AI greeting
- **Send Message**: Processes message with vehicle context, detects intents
- **Intent Detection**: Handoff to human, financing, test drive scheduling

### Conversation Graph Service (Placeholder)

LangGraph-based conversation flow (in development):
- Discovery node for customer profiling
- Negotiation node for deal assistance
- Recommendation node for vehicle suggestions

## 🗂️ Project Structure

```
src/
├── ai/                    # AI Module
│   ├── ai.module.ts       # Module definition
│   ├── chat/              # Chat controller & service
│   ├── llm/               # LLM Router with multi-provider support
│   ├── graph/             # Conversation graph (LangGraph)
│   ├── embeddings/        # Text embeddings service
│   └── vector/            # Vector search service
├── vehicles/              # Vehicle CRUD module
├── users/                 # User management module
├── interactions/          # User interactions module
├── dealers/               # Dealer management module
├── prisma/                # Database connection
└── common/                # Shared utilities
prisma/
├── schema.prisma          # Database schema
├── migrations/            # Migration files
└── seed.ts                # Database seeding
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

## 🚢 Deployment

The application is configured for deployment on **Railway**:

- Automatic builds via Git push
- Environment variables configured in Railway dashboard
- Database managed by Railway PostgreSQL

## 📄 License

Copyright © 2026 Rafael Novais. All rights reserved.  
See [LICENSE](../LICENSE) and [NOTICE.md](../NOTICE.md) for details.
