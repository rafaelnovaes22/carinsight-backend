# CarInsight backend

- Use Node 20+ and `npm run setup` for an idempotent dependency install and verification. No credentials or database are needed by this gate.
- Run `npm run verify` before committing: read-only lint, formatting check, unit/HTTP contract tests and production build.
- Run checks inside ai-jail. Never load production secrets for tests.
- Database E2E is separate: provision `docker-compose.test.yml`, set a localhost database ending in `_test`, apply migrations, then `npm run test:e2e`. It deletes fixtures. Never run it against a deployed database.
- NestJS domains live in `src/<domain>`; Prisma schema and migrations live in `prisma/`. `src/ai` contains the existing LLM router and conversational graph.
- Public vehicle facts must come from Vehicle records. Reference catalog models are not stock or offers; include provider and reference month with valuations.
- Preserve administrative guards on vehicle/dealer writes. Never accept ADMIN in public registration.
- Use dependency injection, explicit return types, short functions, descriptive names and structured logs. Never log prompts, tokens or connection URLs.
- Keep new files under 500 lines. Add behavior tests for ranking, input validation and fallback behavior.
- Follow the existing formatter. `npm run format` writes; `npm run format:check` does not.
