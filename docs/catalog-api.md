# Reference catalog

The catalog is independent from Vehicle stock. A model and its reference valuation
never imply availability, condition, an advertised unit, or an individual appraisal.

Routes: `GET /catalog/brands`, `/catalog/models?brandId=...`,
`/catalog/years?brandId=...&modelId=...`,
`/catalog/valuation?brandId=...&modelId=...&yearId=...`. An optional `reference`
selects a monthly reference. Lists return `items`, `source`, `retrievedAt`, `cached`.
Valuations additionally return the exact model, year, fuel, FIPE code, BRL price
and provider's `referenceMonth`. Year 32000 means a zero-kilometer reference.

Parallelum v2 is an independent provider, not a public API operated by FIPE.
The documented free tier permits 500 unauthenticated requests per day. No token or
paid plan is required. `FIPE_API_TOKEN` is optional. `CATALOG_API_URL` defaults to
the documented v2 endpoint. Replace the `CatalogProvider` Nest token to use a
different provider. No browser-provided URL is fetched.

Each process caches up to 500 responses for 24 hours, coalesces concurrent misses,
and limits upstream calls to 450 per rolling day. This quota/cache is process-local;
multiple replicas or restarts do not share it. Timeouts are 8 seconds. A 429 pauses
misses for 60 seconds; cached responses remain available. No broad catalog crawl
is performed. Deploy a shared cache/quota before scaling beyond one replica.

Sources checked on 2026-09-18:

- Provider routes, types, limits and monthly references: https://deividfortuna.github.io/fipe/v2/
- NestJS injectable replacement: https://docs.nestjs.com/fundamentals/custom-providers
- NestJS query validation: https://docs.nestjs.com/techniques/validation
- Runtime timeout signature: Node 20 `AbortSignal.timeout`, verified against installed Node types.

Tests use fixtures and an injected HTTP transport, never a paid API or production database.
