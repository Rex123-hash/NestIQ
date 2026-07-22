# NestIQ Security Architecture

NestIQ is a public decision-intelligence application deployed on Google Cloud. This
document defines its security model, trust boundaries, implemented controls, and
verification approach. It is intentionally separate from the product overview in the
README and the functional contract in the design specification.

## Security objectives

NestIQ is designed to:

- prevent model output from gaining write access to data or scoring logic;
- keep server credentials out of browser responses and source control;
- constrain generated analytics by table, city, row count, and bytes scanned;
- reject unsupported civic, market, and Pulse evidence;
- avoid collecting user content in application telemetry;
- bound generated queries, conversation history, media uploads, and selected expensive endpoints;
- degrade to explicit unavailable states rather than synthetic data.

## Trust boundaries

| Boundary | Security treatment |
|---|---|
| Browser → FastAPI | HTTPS in production, exact-origin CORS, request validation, bounded histories and uploads |
| FastAPI → Gemini | Task-specific prompts, structured schemas where applicable, timeouts, bounded output, deterministic post-validation |
| FastAPI → BigQuery | Read-only SQL guard, single-table allowlist, city-scoped CTE, dry run, byte cap, row cap |
| FastAPI → Google Maps | Server/browser key separation, bounded provider calls, response validation and caching |
| Grounded text → UI | Citation matching, grounding-support validation, controlled schemas, explicit evidence status |
| Model explanation → FitScore | No write path; scoring remains deterministic application code |

## Implemented controls

### Configuration and secrets

- Environment files and local credentials are excluded from Git tracking.
- The server Maps key and browser Maps key use separate configuration fields.
- `/api/config` can return only browser-safe configuration; it never returns the server key.
- Production CORS accepts configured exact origins, removes wildcard entries, and defaults
  to loopback development origins when no production allowlist is present.
- Google Secret Manager integration is available behind `USE_SECRET_MANAGER`. It is opt-in;
  when disabled, deployment environment variables remain the active source.
- Secret-resolution logs contain secret identifiers and error types only, never values or
  provider exception messages.

Cloud-side browser referrer restrictions, server API restrictions, IAM roles, and billing
budgets are deployment controls that must be configured and verified in the cloud environment;
source code alone cannot prove their active policy.

### Generated SQL and BigQuery cost control

Copilot analytics uses a deliberately conservative SQL boundary:

1. Only one `SELECT` statement is accepted.
2. Comments, stacked statements, write/DDL keywords, backticked external tables, unions or
   subqueries that reach an unauthorized table, implicit foreign joins, and alias-shadowing
   attempts are rejected before a BigQuery client is called.
3. The only permitted table target is the runtime `india_localities_latest` CTE.
4. The CTE itself is filtered by a bound `@city` parameter. City isolation therefore does
   not depend on Gemini including the requested filter correctly.
5. Missing or excessive row limits are bounded to at most 50 returned rows.
6. Every accepted query is dry-run first and rejected above 100 MB estimated scan size.
7. Execution also sets `maximum_bytes_billed` as a provider-side backstop.

The generated SQL is visible in the Copilot response when BigQuery contributes, making the
analytics path reviewable rather than opaque.

### Model and agent authority

- Copilot tool selection is deterministic and inspectable; Gemini does not choose its own
  data authority.
- Recognized locality names are resolved against the selected city's catalog.
- Search preference extraction is schema-bound. The client cannot submit arbitrary preset
  weights; the server resolves allowlisted preset identifiers.
- FitScore arithmetic, CPCB bands, missing-pillar handling, ties, anomaly thresholds, and
  source validation are deterministic code.
- Gemini may convert search preferences into schema-bounded weights, but it cannot alter the
  scoring arithmetic, raw evidence, or CPCB rules; execute write-capable analytics SQL;
  directly invoke a BigQuery write; or convert unavailable evidence into a value.
- Conversation context is limited to six visible turns, with each historical turn limited
  to 1,500 characters.

### Grounded and retrieved evidence

- Locality Pulse and City Pulse accept only schema-valid items backed by returned citations.
- Grounding-support mode binds each ledger line to the provider grounding chunk associated
  with that response span.
- Rent observations without usable citations are rejected before ranges or medians are
  calculated.
- Official Civic Knowledge retrieves only from the controlled catalog and returns the source
  identifier, title, issuing authority, publication date, and official URL stored there.
- No-evidence, temporarily-unavailable, pending, refreshing, and available are separate
  terminal or progress states.
- Runtime rent verification, Pulse, community sentiment, and Civic Knowledge panels cannot
  modify FitScore. The separately labelled baseline rent remains the affordability input.

### Input, abuse, and cost boundaries

- `/api/ask` permits 20 requests per 60-second window per best-effort client identifier and
  Cloud Run instance.
- Voice and image analysis each permit six requests per 60-second window per best-effort
  client identifier and instance.
- Exceeded limits return HTTP 429 with `Retry-After`.
- Audio is limited to 5 MB and a client-declared duration of at most 30 seconds.
- Images are limited to 8 MB and must be declared as JPG, PNG, or WebP content.
- Vertex, Google Maps, evidence polling, detail, AQI, and browser Copilot operations use
  finite timeouts and bounded retry policies.
- BigQuery, Maps, grounded evidence, and Copilot results use scoped caches or single-flight
  coordination to reduce repeated provider work.

The in-process rate limiter is an instance-level control, not a global edge quota. The more
reliable cost boundaries are the BigQuery scan cap, provider timeouts, caches, and controlled
generation frequency.

## Privacy and data handling

### Application telemetry

Structured telemetry records operational fields such as request ID, route, status, latency,
cache state, tool name, validation result, citation count, and sanitized error type. The
telemetry layer blocks prompts, questions, answers, SQL, document content, authorization
values, credentials, tokens, secrets, and provider error messages.

### Browser-local state

The browser may retain:

- the decoded Google display profile or guest profile;
- saved locality snapshots;
- up to 12 recent Copilot questions.

These values stay in browser `localStorage` and the product exposes sign-out, remove, and
clear actions. They are not server-side accounts.

### Google sign-in boundary

Google sign-in is optional presentation state for this public application. The browser
decodes display fields, but that identity grants no backend authorization and is never used
to return privileged or user-specific API data. Guest mode exposes the same public decision
capabilities.

### Media and provider processing

Audio and images are read into bounded memory and are not written to NestIQ application
storage. They are sent to the configured Google Cloud provider to perform transcription or
analysis. Text questions and requested evidence are likewise sent to the relevant provider
when that tool is selected.

The Ask endpoint permits an in-memory response to be reused for ten minutes to reduce
duplicate work. The cache is not a durable conversation store and is lost when an instance
is replaced.

## Reliability as a security property

- Firestore transactions coordinate Pulse and rent generations across Cloud Run instances,
  preventing duplicate active work and rejecting late results from expired generations.
- Previously validated evidence survives a failed refresh and remains labelled with its
  refresh state.
- Provider failures are categorized without exposing provider response bodies.
- Invalid or unsupported model output fails to a bounded state rather than being rendered.
- Request correlation IDs are validated before being accepted into logs.

## Verification

Security behavior is exercised by offline tests that do not require billable provider calls:

```bash
cd backend
python -m pytest -q tests/test_security_config.py tests/test_sql_guard.py \
  tests/test_analytics_query_guard.py tests/test_rate_limit.py \
  tests/test_secrets.py tests/test_telemetry.py
python -m app.evaluation
```

The responsible-agent scorecard additionally checks write-SQL rejection, controlled-source
validation, missing-data honesty, Copilot tool routing, contradiction control, and graceful
degradation.

## Responsible disclosure

Please report a suspected security issue privately through the repository owner's GitHub
contact or GitHub Security Advisories. Include the affected route or component, reproduction
steps, expected impact, and any relevant request ID. Do not include credentials, access
tokens, private user content, or active exploit payloads in a public issue.
