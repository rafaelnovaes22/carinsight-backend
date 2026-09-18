# Decision briefing

`POST /decision/brief` accepts `{ naturalLanguage, constraints? }`. Text is limited
to 1500 characters. Constraints: budgetMax, bodyType, transmission, minYear,
maxMileage, make, model, fuelType, priorities. Income and unknown fields are rejected.

Response: profile, summary, followUpQuestions, suggestedBrands (real provider
identifiers), modelSearchTerms (literal user phrases), interpretation (`rules` or
`llm`), interpretationReason, catalogAvailable and limitations. This endpoint does
not create users, leads, chat sessions, vehicle records or financing offers.

`DECISION_LLM_ENABLED` defaults to false. If enabled and a provider is configured,
the existing router tries OpenAI `gpt-4o-mini`, then Groq `openai/gpt-oss-20b`.
Models can be configured by `OPENAI_MODEL` and `GROQ_MODEL`. GPT-OSS uses low
reasoning effort, hides reasoning, and uses JSON object mode for the briefing.
Each briefing attempt has 2500ms timeout, zero retries and a 1024-completion-token limit (including reasoning). Truncated responses are rejected. The
input has the bounded customer message and at most 150 public brand entries.
`DECISION_LLM_DAILY_LIMIT` defaults to 100 briefings per rolling day (0..1000).
This counter is process-local and resets on restart; configure an upstream quota
or a shared counter before multiple replicas. Each briefing can try two providers.
`LLM_DAILY_CALL_LIMIT` defaults to 50 and counts every provider attempt across all
routes using the router, including the legacy chat. It accepts 0..1000 and uses
the same process-local/restart caveat. A fallback consumes another call. SDK
automatic retries are disabled globally so they cannot bypass this cap. Legacy
calls also have a finite 5000ms provider timeout.
The existing AI throttle is configured at 2/second, 10/minute and 100/hour using
`req.ip`. Railway proxy peer forwarding has not been validated; clients may share
one bucket. These are not verified per-client production limits. Do not enable
unrestricted `trust proxy`. The global cap limits provider volume per instance.

Failures, disabled providers, invalid JSON and exhausted quota retain rule-based
interpretation with an honest reason. Explicit edited constraints override model
output. Numeric and normalized profile filters come only from deterministic
rules or explicit form edits. Model-provided make/model/priorities must occur
affirmatively in the message; rejected brands and fabricated terms are dropped.
Numeric/model claims about vehicles are never accepted from the model.
Version/year reference values come exclusively from the separate catalog API.

SDK request options were verified in installed `openai` and `groq-sdk` README and
type declarations. Primary references:

- https://github.com/openai/openai-node#timeouts
- https://github.com/groq/groq-typescript#timeouts
- https://docs.nestjs.com/security/rate-limiting
- https://console.groq.com/docs/deprecations
- https://console.groq.com/docs/model/openai/gpt-oss-20b
- https://console.groq.com/docs/reasoning
- https://console.groq.com/docs/structured-outputs

Automated checks inject fake providers; no paid inference is used in verification.
