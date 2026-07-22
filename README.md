<div align="center">

# <img src="public/favicon.svg" height="44" align="center" alt="" /> &nbsp;NestIQ

### AI-Powered Decision Intelligence Platform

**Find the right neighborhood. For your life.**

NestIQ helps people compare where to live across affordability, air quality, safety, commute and daily-life evidence. A Google ADK agent team gathers and validates the evidence, deterministic code computes the FitScore, and every result carries its source, freshness and limitation instead of hiding uncertainty behind a single number.

![React](https://img.shields.io/badge/React_18-7C5CF6?style=flat-square&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7C5CF6?style=flat-square&logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-7C5CF6?style=flat-square&logo=fastapi&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_on_Vertex_AI-7C5CF6?style=flat-square&logo=googlegemini&logoColor=white)
![BigQuery](https://img.shields.io/badge/BigQuery_+_BQML-7C5CF6?style=flat-square&logo=googlebigquery&logoColor=white)
![Maps](https://img.shields.io/badge/Google_Maps_Platform-7C5CF6?style=flat-square&logo=googlemaps&logoColor=white)
![ADK](https://img.shields.io/badge/Google_ADK_agents-7C5CF6?style=flat-square&logo=google&logoColor=white)
![Tests](https://img.shields.io/badge/tests-518_passing-3FB984?style=flat-square)
![Evaluation](https://img.shields.io/badge/evaluation-18%2F18-3FB984?style=flat-square)

Built for the **Google Cloud Gen AI Academy APAC — Cohort 2 Hackathon**
Problem Statement: *AI for Better Living and Smarter Communities*

**[Live Demo → nestiq-india.web.app](https://nestiq-india.web.app)**

<br />

<img src="assets/preview.png" alt="NestIQ — describe your ideal neighborhood and get ranked, explainable matches" width="100%" />

</div>

| Production | Verified catalog | Automated verification | Responsible-agent evaluation |
|---|---:|---:|---:|
| [Live Firebase experience](https://nestiq-india.web.app) | **13 cities · 73 localities** | **518 tests passing** | **18 / 18 · zero billable calls** |

**Submission documents:** [Product and system design](NestIQ-Design-Spec.md) · [Security architecture](SECURITY.md)

**90-second judge path:** launch the Family Health & Resilience preset, inspect the evidence labels on the top match, open Community Insights for Locality Pulse and controlled civic RAG, then ask NestIQ Copilot a general question, a current city question and a comparison to see selective tool routing.

---

## <img src="assets/readme/overview.svg" height="22" align="center" alt="" /> &nbsp;What NestIQ is

NestIQ helps someone relocating within India decide **where to live**, by turning one plain-language sentence into a ranked, explainable shortlist of neighborhoods. It is built for a person with three days and no local knowledge, who has to weigh rent against commute, safety and — in Indian metros — air quality, using data that today sits scattered across rent portals, maps apps and AQI trackers.

The core promise is narrow and deliberate: **NestIQ will not show a number it cannot source.** Every metric carries its origin, freshness and limitation. When a signal is missing, the pillar is excluded and the score is labelled provisional with its coverage percentage, rather than filled with a plausible-looking default. That constraint is enforced in code and covered by tests, not left to convention.

Coverage today is **13 cities and 73 localities** (`backend/app/india.py`), from Delhi NCR and Mumbai down to Patna, Ranchi and Kochi.

---

## <img src="assets/readme/problem.svg" height="22" align="center" alt="" /> &nbsp;Problem statement fit

**PS1 — AI for Better Living and Smarter Communities.**

The statement asks for a decision-intelligence platform that improves everyday living and identifies patterns, trends and anomalies in community data. NestIQ addresses it directly:

| Requirement | How NestIQ meets it |
|---|---|
| **Better living decisions** | A five-pillar FitScore weighted by the user's own stated priorities, not fixed defaults (`backend/app/maps.py`, `backend/app/fitscore.py`) |
| **Smarter communities** | Live civic evidence per locality: grounded current events, official civic documents with page-level citations, and resident sentiment (`backend/app/gemini.py`, `backend/app/civic_rag.py`) |
| **Patterns, trends, anomalies** | Cross-sectional outlier detection at 1.5σ from the city mean, plus temporal AQI spike detection against a locality's own 24-hour history (`backend/app/maps.py`) |
| **Predictive insight** | A BigQuery ML `ARIMA_PLUS` model trained on AQI history the platform accumulates itself (`backend/app/bq_india.py`) |
| **Applied Gen AI** | Gemini on Vertex AI for intent parsing, NL→SQL, grounded retrieval and explanation, orchestrated through Google ADK (`backend/app/adk_orchestration.py`) |

Air quality is treated as a first-class pillar rather than a nice-to-have, because in Indian cities it is the most health-critical signal and the one that varies most between localities.

---

## <img src="assets/readme/features.svg" height="22" align="center" alt="" /> &nbsp;Feature overview

**Search and ranking.** Describe what you need in one sentence. Gemini extracts a budget and a weight per pillar, live signals are fetched per locality, and results return ranked with anomaly flags — streamed over SSE so the work is visible rather than hidden behind a spinner. An optional **Family Health & Resilience** preset applies a fixed, published weight profile for health-sensitive households (`src/lib/presets.js`, `backend/app/main.py`).

**Locality detail.** Seven tabs covering Overview, Affordability, Safety, Commute, Essentials & Lifestyle, Air Quality and Community Insights. Each pillar shows its sub-score alongside the evidence behind it: source, freshness, geographic scope and limitation (`src/pages/neighborhood/detailTabs.jsx`).

**Compare.** Side-by-side comparison of saved localities across every pillar, with shared values collapsed so genuine differences stand out (`src/pages/Compare.jsx`).

**Saved and Alerts.** A watchlist of localities with live air-quality signals, plus grounded civic alerts filtered to moderate-or-higher severity, and a separate city-wide pulse view. A locality click starts its locality-scoped grounded Pulse early. City evidence is never substituted into Locality Pulse: a failed locality check is reported as unavailable rather than broadened, and an unreachable source is never reported as "nothing happening" (`src/pages/Alerts.jsx`, `src/lib/watchlistPulse.js`).

**NestIQ Copilot.** One conversational surface routes general questions, greetings and calculations to a model-only guidance path; current city questions to structured evidence; locality questions to locality evidence; and comparative or aggregate neighborhood questions to guarded BigQuery analytics. Unknown input never silently triggers locality tools, and unrelated superlatives cannot launch an analytics job. The response shows only the tools that actually contributed, supports bounded conversation context, returns verified navigation actions, and keeps recent questions newest-first in browser-local storage (`backend/app/copilot.py`, `backend/app/main.py`, `src/pages/AskNestIQ.jsx`). Voice questions use Google Cloud Speech-to-Text and are submitted after recording stops; JPG, PNG and WebP uploads use Gemini image understanding. Audio and images are processed in memory, and prompts are not persisted server-side or emitted in telemetry (`backend/app/transcription.py`, `backend/app/image_analysis.py`).

**Rent verification.** Opening a locality starts one shared, grounded market search in the background; hover and keyboard focus do not launch billable work. Its green verification panel stays hidden until the user explicitly selects **Verify current rent**, at which point the Affordability tab joins the prepared job instead of starting again. Firestore deduplicates work across Cloud Run instances; deterministic code validates the returned ledger and calculates cited ranges by home size without a second model call (`backend/app/gemini.py`, `backend/app/main.py`, `backend/app/pulse_store.py`).

---

## <img src="assets/readme/different.svg" height="22" align="center" alt="" /> &nbsp;What makes it different

| Capability | What is behind it |
|---|---|
| **Every number is sourced or marked absent** | A ten-field provenance envelope per pillar, distinguishing live, grounded, curated and unavailable data. Enforced in `backend/app/evidence.py`, rendered beside every figure |
| **Air quality cannot flatter itself** | Absolute CPCB health bands, not relative ranking. AQI 500 cannot score 96 by being the least-polluted option (`backend/app/air_quality.py`) |
| **Real ADK agents, not narration** | A planner coordinating three specialists, a validator checking for contradictions, and an automatic fallback if ADK fails — every message generated from actual tool output (`backend/app/adk_orchestration.py`) |
| **The model never does arithmetic** | Gemini parses intent and explains; scoring is deterministic Python, so identical weights and the same evidence snapshot produce the same score (`backend/app/fitscore.py`, `backend/app/maps.py`) |
| **Conversational analytics with a real guard** | NL to BigQuery SQL, constrained by a table allowlist and a dry-run byte cap, with the generated query shown to the user (`backend/app/sql_guard.py`, `backend/app/bq_india.py`) |
| **Self-building dataset and its own forecast** | A genuine city-data rebuild snapshots features into BigQuery; an ARIMA_PLUS model trained on that accumulating history forecasts AQI alongside Google's (`backend/app/bq_india.py`) |
| **Anomaly detection at no extra cost** | Cross-sectional outliers at 1.5σ and temporal AQI spikes, computed from metrics already fetched (`backend/app/maps.py`) |
| **One Copilot, selective tools** | Deterministic routing keeps general chat model-only, resolves named places against the selected city's verified catalog, uses structured evidence for locality questions, and invokes guarded BigQuery for genuine comparisons and rankings; voice and image inputs are privacy-bounded (`backend/app/copilot.py`, `backend/app/transcription.py`, `backend/app/image_analysis.py`) |
| **13 cities, Tier-1 to Tier-3** | Delhi NCR through Patna, Ranchi, Lucknow and Kochi — decision intelligence beyond the metros (`backend/app/india.py`) |

---

## <img src="assets/readme/trust.svg" height="22" align="center" alt="" /> &nbsp;Trust and evidence architecture

NestIQ's trust architecture follows one rule: a score is displayed only with a defensible evidence state. The hard problem in a scoring product is not computing a score — it is refusing to display one that the available evidence cannot support.

### The provenance envelope

Every pillar emits a structured evidence record alongside its value (`backend/app/evidence.py`). The envelope carries ten fields: `metric`, `value`, `unit`, `source`, `sourceType`, `status`, `fetchedAt`, `geographicScope`, `confidence` and `limitation`. The UI renders it directly beside the number (`src/pages/neighborhood/detailTabs.jsx`), so a user can always see what a figure is and is not.

`sourceType` distinguishes four kinds of data, and the distinction is enforced rather than decorative:

| Source type | Meaning | Example |
|---|---|---|
| `live_google` | Fetched now from a Google API | CPCB AQI, Places counts, drive time |
| `grounded_market_evidence` | Published marketplace evidence with citations | Rent for cities onboarded under the validation workflow (`backend/app/market_data.py`) |
| `curated_market_estimate` / `curated_proxy` | An indicative baseline where no open dataset exists | Rent and safety for the original catalog |
| `unavailable` | Nothing was sourced, and nothing is claimed | Safety in newly onboarded cities |

A locality with no safety data does not silently inherit the curated label. `backend/app/evidence.py` switches `source`, `sourceType`, `status`, `confidence` and `limitation` together on presence, so an absent value reports *"No locality-level safety source available"* rather than naming a source that was never consulted.

### Air quality is absolute, never graded on a curve

Rent, commute and amenity sub-scores are min-max normalized within a city, which is appropriate for preference ranking. Air quality is different: it is scored against absolute CPCB health bands (`backend/app/air_quality.py`), while relative rank is reported separately. A locality therefore cannot receive a healthy air score merely because nearby localities are even more polluted.

| CPCB band | AQI | Air sub-score |
|---|---|---|
| Good | 0–50 | 90–100 |
| Satisfactory | 51–100 | 75–89 |
| Moderate | 101–200 | 55–74 |
| Poor | 201–300 | 35–54 |
| Very Poor | 301–400 | 15–34 |
| Severe | 401+ | 0–14 |

A locality can rank better than its neighbours *within* a band but can never escape it. If every locality reads Severe, every locality shows Severe, and "least polluted" is only claimed when the raw values genuinely differ.

### Absence is never rendered as fact

City-level summaries return `null` when no sourced values are present, so the interface renders "Not available" rather than turning an empty set into a price of zero (`src/lib/citySnapshot.js`, covered by `src/lib/citySnapshot.test.js`). Safety and other evidence descriptions also branch on actual availability; an absent proxy is never described as a measured locality profile.

### Missing data is stated, not inferred

When a live call fails, the last good reading is served with its **original** timestamp and an explicit `stale` marker, or an honest `temporarily_unavailable` state — never a fresh-looking default (`backend/app/maps.py`). Any affected pillar is excluded from the FitScore, which is then labelled **provisional** with its coverage percentage.

---

## <img src="assets/readme/agents.svg" height="22" align="center" alt="" /> &nbsp;Agent architecture

Orchestration is built on the **Google Agent Development Kit** (`backend/app/adk_orchestration.py`), coordinated by a planner and streamed to the browser over Server-Sent Events.

```text
                        ┌────────────────────────────────────┐
                        │          NESTIQ PLANNER            │
                        │ ADK coordinator · fixed trajectory │
                        └─────────────────┬──────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
       ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
       │ LIVE SIGNALS AGENT  │ │  ANALYTICS AGENT    │ │ CIVIC INTELLIGENCE  │
       │ AQI · Places        │ │ snapshots · BQML    │ │ scoped retrieval    │
       │ commute · imagery   │ │ anomalies · coverage│ │ citations retained  │
       └──────────┬──────────┘ └──────────┬──────────┘ └──────────┬──────────┘
                  └───────────────────────┼───────────────────────┘
                                          ▼
                        ┌────────────────────────────────────┐
                        │     DETERMINISTIC FITSCORE         │
                        │  arithmetic never goes to an LLM   │
                        └─────────────────┬──────────────────┘
                                          ▼
                        ┌────────────────────────────────────┐
                        │             VALIDATOR              │
                        │ contradictions · missing coverage  │
                        └─────────────────┬──────────────────┘
                                          ▼
                        ┌────────────────────────────────────┐
                        │             EXPLAINER              │
                        │ summary from validated evidence    │
                        └─────────────────┬──────────────────┘
                                          ▼
                           Ranked results streamed by SSE
```

**What each agent actually does.** `live_signals_agent` invokes the ranking path, which fetches live AQI, Places and commute data and computes the deterministic FitScore. `analytics_agent` reports what the scoring engine found — locality count, statistical anomalies, and how many results are provisional due to incomplete signals. `civic_intelligence_agent` performs citation-locked retrieval scoped to the top locality and reports the true number of documents matched, including zero. The Validator then checks the scored output for contradictions — specifically that no locality in the Severe band carries a high air sub-score — and reports how many results are provisional. The Explainer produces a summary from validated structured evidence only.

Two rules keep this honest rather than theatrical:

- **The model never does arithmetic.** Gemini extracts intent and explains results; scoring is deterministic Python, so identical weights applied to the same evidence snapshot produce the same score.
- **Agents report real work.** Messages are generated from actual tool output — for example *"No scoped official civic document matched; none invented"* — never a scripted completion notice.

**Fallback behavior.** ADK runs behind the `USE_ADK_ORCHESTRATION` flag. If the coordinator raises for any reason, `backend/app/main.py` emits structured `agent_fallback` telemetry and falls through to the legacy narrated stream, which preserves the same SSE contract. Search does not break; it degrades.

---

## <img src="assets/readme/architecture.svg" height="22" align="center" alt="" /> &nbsp;How it works

End-to-end request flow. The agent hierarchy is in the section above; this is where the
data comes from, what is cached, and what is written back.

```text
                         "clean air, safe, under ₹25,000"
                                         │
                                         ▼
              ┌──────────────────────────────────────────────────────┐
              │  1 · INTENT PARSING                 gemini.py        │
              │  Gemini → Pydantic criteria: budget + five weights   │
              │  Allowlisted presets are resolved on the server      │
              └──────────────────────────┬───────────────────────────┘
                                         ▼
              ┌──────────────────────────────────────────────────────┐
              │  2 · ADK ORCHESTRATION       adk_orchestration.py    │
              │  planner → live signals · analytics · civic intel    │
              │  coordinator failure → compatible fallback stream    │
              └──────────────────────────┬───────────────────────────┘
                                         ▼
              ┌──────────────────────────────────────────────────────┐
              │  3 · PARALLEL SIGNAL FAN-OUT          maps.py        │
              │  30-minute stale-while-revalidate · single flight    │
              └──────────────────────────┬───────────────────────────┘
                                         │
         ┌──────────────────┬────────────┴─────────┬──────────────────┐
         ▼                  ▼                      ▼                  ▼
 ┌────────────────┐ ┌────────────────┐     ┌────────────────┐ ┌────────────────┐
 │  AIR QUALITY   │ │  PLACES (NEW)  │     │ DISTANCE MATRIX│ │  PLACE PHOTOS  │
 │ CPCB + history │ │ amenities +    │     │ drive time +   │ │ locality       │
 │                │ │ essentials     │     │ live traffic   │ │ imagery        │
 └───────┬────────┘ └───────┬────────┘     └───────┬────────┘ └───────┬────────┘
         └──────────────────┴────────────┬─────────┴──────────────────┘
                                         ▼
              ┌──────────────────────────────────────────────────────┐
              │  4 · DETERMINISTIC SCORING       fitscore.py         │
              │  absolute CPCB bands · relative preference pillars   │
              │  missing pillars excluded, then weights renormalized │
              └──────────────────────────┬───────────────────────────┘
                                         │
                      ┌──────────────────┴─────────────┐
                      ▼                                ▼
        ┌────────────────────────────┐   ┌────────────────────────────┐
        │  EVIDENCE ENVELOPES        │   │  ANOMALY DETECTION         │
        │  source · status · scope   │   │  1.5σ city outliers        │
        │  confidence · limitation   │   │  temporal AQI spikes       │
        │  evidence.py              │   │  maps.py                    │
        └─────────────┬──────────────┘   └─────────────┬──────────────┘
                      └──────────────────┬──────────────┘
                                         ▼
              ┌──────────────────────────────────────────────────────┐
              │  5 · VALIDATE → EXPLAIN                              │
              │  contradiction + coverage checks before explanation  │
              └──────────────────────────┬───────────────────────────┘
                                         │
                      ┌──────────────────┴─────────────┐
                      ▼                                ▼
        ┌────────────────────────────┐   ┌────────────────────────────┐
        │  BROWSER                   │   │  BIGQUERY                  │
        │  SSE agent events +        │   │  non-blocking snapshot +   │
        │  ranked final results      │   │  ARIMA_PLUS history        │
        └────────────────────────────┘   └────────────────────────────┘
```

**On the detail page**, three further evidence sources load independently when their
relevant feature is opened and never block the score: grounded resident sentiment, civic
Locality Pulse, and citation-locked civic documents. Each fails to an explicit unavailable
state rather than an empty one, and none of them can alter a FitScore.

---

## <img src="assets/readme/security.svg" height="22" align="center" alt="" /> &nbsp;Security and reliability

Each choice below is stated with its reasoning, because the reasoning is the part that generalizes.

**CORS fails closed** (`backend/app/main.py`). Allowed origins come from configuration; when unset, only loopback development origins are permitted, and a literal `*` is filtered out even if configured. A deploy that forgets the variable breaks the frontend loudly instead of silently serving every origin on the internet. The blast radius of failing closed here is one origin being blocked — small, and immediately visible.

**Secret Manager support fails safe** (`backend/app/secrets.py`, flag-gated) — deliberately the opposite choice. A missing secret or a fetch error keeps the existing environment value, because blanking a working credential takes the entire service down. The failure mode being guarded against is total outage, so the safe direction is inverted relative to CORS. The module logs only a secret's name and an exception type, never a value and never an exception message, since a message can echo the payload back into logs.

**Maps key separation** (`backend/app/main.py`). `/api/config` returns only the browser key. The server key used for Air Quality, Places and Distance Matrix is never returned by any endpoint, and if the browser key is unset the response is an empty string rather than a fallback to the server key — which would reopen the exact leak the separation exists to close.

**NL→SQL runs against an allowlist, not a blocklist** (`backend/app/sql_guard.py`). The prepended, city-scoped CTE supplies the only legitimate table reference, so every actual `FROM` or `JOIN` target must be that CTE. Subquery aliases are consumed syntactically but cannot authorize another table, including alias-shadow attempts. The guard also enforces one `SELECT` statement, rejects comments, backticks and DDL/DML on word boundaries, and uses a parenthesis-aware scanner for implicit comma joins. The source CTE is independently bound to the selected `@city`, so generated SQL cannot widen the query to another city.

**Query cost is capped by bytes, not rows** (`backend/app/bq_india.py`). Every generated query is dry-run for a byte estimate, rejected above `MAX_QUERY_BYTES` (100 MB), then executed with `maximum_bytes_billed`. A row limit caps what is returned, never what is scanned, so it was never cost control.

**Request limiting** (`backend/app/rate_limit.py`, `backend/app/main.py`). Per-client, per-instance fixed windows protect expensive Copilot operations: 20 `/api/ask` requests per 60 seconds and six voice or image requests per 60 seconds, returning 429 with `Retry-After`. This is not presented as a global quota; Cloud Run can run multiple instances.

**Bounded model calls.** The Vertex client is constructed with an explicit timeout so a hung generation cannot hold a Cloud Run request open indefinitely (`backend/app/gemini.py`, `backend/app/config.py`).

**Graceful degradation.** Locality data is cached with stale-while-revalidate semantics, concurrent requests for the same city share a single build, and evidence status routes resolve catalog identity without rebuilding live city signals. The Overview AQI chart has a dedicated Google-only route that skips city ranking and Gemini; successful forecasts are cached and concurrent requests share one call. A provider timeout reaches an explicit retry state instead of an endless spinner or an estimated value (`backend/app/maps.py`, `backend/app/main.py`, `src/lib/api.js`).

---

## <img src="assets/readme/evaluation.svg" height="22" align="center" alt="" /> &nbsp;Responsible AI practices

`backend/app/evaluation.py` runs a deterministic, offline scorecard with **zero billable calls**. The checked-in scorecard passes **18 of 18 cases across nine dimensions**; the machine-readable evidence is retained in `artifacts/phase13/latest.json`.

| Dimension | Result | What the cases establish |
|---|---:|---|
| Health scoring | **3 / 3** | All six CPCB boundaries, tied ranks and AQI 500 as Severe with an absolute score of 0 |
| Missing-data honesty | **2 / 2** | Missing AQI and commute remain absent and make the score provisional |
| Groundedness | **3 / 3** | Unsupported pulse items, uncited rent and uncontrolled civic answers are rejected |
| Security | **2 / 2** | Write-capable SQL is rejected before BigQuery and the controlled RAG catalog validates its sources |
| API contract | **1 / 1** | Civic RAG returns the bounded response and citation schema the UI expects |
| Graceful degradation | **2 / 2** | Unsupported localities and empty rankings complete with explicit no-evidence states |
| Tool trajectory | **1 / 1** | Planner, three specialists, validator and explainer execute in the required order |
| Contradiction control | **1 / 1** | The validator preserves a provisional result without inventing a missing air score |
| Tool routing | **3 / 3** | General guidance stays model-only, locality questions use structured evidence and genuine rankings use guarded analytics |

On this bounded suite, groundedness, citation precision, tool-trajectory accuracy and task completion were **100%**; unsupported-claim and contradiction rates were **0%**. These figures describe this checked-in deterministic suite, not an open-ended claim about every possible prompt or provider response. Exact model prose is deliberately not scored because it would be brittle and would not measure evidence discipline.

---

## <img src="assets/readme/scale.svg" height="22" align="center" alt="" /> &nbsp;Scalability: city onboarding

New cities are added through a validation workflow rather than by hand-editing a catalog (`backend/tools/validate_city.py`). The tool is a standalone CLI that imports application modules but is never imported by them, so it cannot leak into a request path.

```bash
cd backend
python -m tools.validate_city                          # structural pass, free, no model calls
python -m tools.validate_city --rent-check --limit 10  # grounded rent cross-check, resumable
```

**What it checks.** Required keys per locality, globally unique ids, centroids inside India's bounding box, complete city anchors, plausible rent ranges, live-signal resolution against Google APIs, and scoring validity. It writes a coverage report to `backend/data/city_coverage_report.md`.

**What it blocks, and why.** Structural errors block publication; warnings do not, because a value outside an expected range is a judgment call rather than a defect. On the grounded rent cross-check the tool is **flag-only** — it never rewrites the catalog. A disagreement is reported only when it clears **both** a delta threshold and a minimum sample size; a real delta backed by too few observations is downgraded to `insufficient_sample` and shown with its citations rather than dropped. Auto-correcting curated values from a quota-limited search would be exactly the kind of silent change the rest of the system is built to prevent.

**Current state.** The fresh `python -m tools.validate_city` run across all 13 cities reports **0 structural errors**. The optional grounded rent cross-check is a separate quota-using command and is not claimed by that structural result. The four most recently onboarded cities (Ahmedabad, Jaipur, Lucknow and Kochi) carry source-backed rent baselines with citation URLs (`backend/app/market_data.py`). Where a curated safety proxy is absent, runtime uses a separately labelled live emergency-access resilience signal based on police, hospital and fire-station access; if that lookup is unavailable, safety is excluded and the FitScore becomes provisional (`backend/app/maps.py`, `backend/app/evidence.py`).

---
## <img src="assets/readme/fitscore.svg" height="22" align="center" alt="" /> &nbsp;The FitScore

```text
FitScore = Σ (pillar_subscore × your_weight) / Σ weights   (over available pillars only)
```

| Pillar | Signal | Source | Default weight |
|---|---|---|---|
| **Air Quality** | Live CPCB AQI, scored on absolute health bands | Google Air Quality API | 25 |
| **Affordability** | Median monthly rent against your budget | Grounded market evidence or a labelled curated estimate | 20 |
| **Safety** | Curated locality proxy, or live emergency-access resilience where no curated proxy exists | Curated baseline or Google Places emergency-service access, explicitly labelled | 20 |
| **Commute** | Live drive time with traffic to the city work hub | Google Distance Matrix | 20 |
| **Essentials & Lifestyle** | Amenities within 1.5 km | Google Places (New) | 15 |

Weights come from the user's own words via Gemini and are adjustable live with sliders. Defaults live in one place (`backend/app/india.py`) and are imported by both the query parser and the scoring engine, so the two cannot disagree.

**Missing pillars are renormalized, never zeroed.** A pillar with no data is dropped from both numerator and denominator, and the result is labelled provisional with its coverage percentage (`backend/app/maps.py`). A locality missing safety scores across the remaining four pillars at 80% coverage — it is not penalised for a gap in our data.

**Essential services are collected but not scored.** Hospitals, doctors, pharmacies, schools and universities are fetched separately from the lifestyle amenity list and surfaced for context, gated behind `ESSENTIALS_IN_LIFESTYLE_SCORE` (default off) so the separation is enforced in code rather than in copy (`backend/app/maps.py`, `src/lib/essentials.js`).

---

## <img src="assets/readme/anomaly.svg" height="22" align="center" alt="" /> &nbsp;Anomaly detection

Two detectors run over metrics already fetched, adding no API calls (`backend/app/maps.py`):

- **Cross-sectional outliers.** A locality is flagged when a metric sits ≥ 1.5σ from the city mean — for example *"Unusually affordable — ₹17,000/mo, 1.5σ below the city average"*.
- **Temporal AQI spikes.** The current reading is compared against the locality's own 24-hour history, so a pollution event is caught as it happens rather than averaged away.

Guardrails keep it honest: a minimum-sample floor, a two-flags-per-locality cap, and a skip when any value in the series is missing — so an absent metric never produces a spurious flag.

---

## <img src="assets/readme/rag.svg" height="22" align="center" alt="" /> &nbsp;Civic evidence retrieval

Retrieval is scoped to where it closes a genuine evidence gap: **official civic documents** — development plans, water quality and pollution control reports, transport plans and environmental notices (`backend/app/civic_rag.py`).

It is deliberately **not** used for anything live. AQI, commute, amenities and current listings come from APIs, because a stale document must never answer a question about current conditions.

Passages retain document title, issuing authority, publication date, geographic scope and **page number**, and link to the original source. Retrieval is pre-filtered by city and locality. When nothing relevant exists, the response says so rather than generating evidence to avoid an empty state — asserted by the `civic-rag-citations-controlled` scorecard case.

---

## <img src="assets/readme/pulse.svg" height="22" align="center" alt="" /> &nbsp;Locality Pulse and Alerts

One grounded pipeline powers three surfaces — locality pulse, city-wide pulse, and watchlist alerts for saved localities (`backend/app/gemini.py`, `backend/app/main.py`). There is no second event pipeline.

Pulse coordination is durable across Cloud Run instances (`backend/app/pulse_store.py`). A Firestore transaction gives each city or locality one active generation id, deduplicates simultaneous requests, rejects late workers from expired generations, and preserves the last verified evidence while a bounded refresh runs. Firestore stores coordination state and validated results only; Gemini grounding and the citation validator remain the source of evidence.

Affordability verification uses the same generation-safe protocol in a separate `rent_verification_jobs` collection. Pulse and rent use deterministic grounded-ledger extraction with bounded output and no unnecessary reasoning pass, then validate every response locally. Pulse retries only transient or incomplete provider responses within its existing deadline; permanent provider failures and invalid cited ledgers terminate explicitly. A no-update result requires the exact `NO_VERIFIED_UPDATES` completion signal, while insufficient rent observations produce a labelled no-evidence result (`backend/app/gemini.py`).

Successful Pulse evidence is reusable for six hours and grounded rent evidence for 24 hours. Once stale, the last citation-backed result remains visible with an explicit refresh label while one bounded generation runs. Regression coverage lives in `backend/tests/test_community_insights.py`, `backend/tests/test_safety_rent.py`, `backend/tests/test_pulse_store.py`, `src/lib/watchlistPulse.test.js`, and `src/pages/neighborhood/detailTabs.test.jsx`.

Locality click prefetch, two-second status polling and four bounded watchlist workers reduce avoidable client wait. These only start or observe the same durable jobs; they do not relax citation validation. Locality Pulse accepts only that locality's terminal result, while City Pulse remains visibly city-scoped.

Each event carries a headline, grounded summary, category, severity, geographic scope, publication time, publisher and a link to the source. Items are validated against the actual citation ledger: an event whose source is not among the returned citations is discarded rather than shown.

**Grounding-support validation.** With `PULSE_USE_GROUNDING_SUPPORTS=true` (default), each Pulse ledger line is bound to the exact Google grounding chunk linked to its text span. Unsupported lines are rejected; responses without support spans use the legacy exact-title validator. The public response contract is unchanged, and setting the flag to `false` restores the legacy validator without a code rollback.

**Temporary events never move a FitScore.** They are evidence displayed beside the score, never folded into it.

**Empty states are kept distinct.** *"No verified updates"* and *"the source could not be reached"* are different claims, and the UI never substitutes one for the other. Watchlist aggregation only reports "no alerts" when a source positively confirmed it; anything unknown degrades to unavailable (`src/lib/watchlistPulse.js`).

---

## <img src="assets/readme/family.svg" height="22" align="center" alt="" /> &nbsp;Family Health and Resilience

An optional preset for households where air quality is not negotiable — someone with an asthmatic child or an elderly parent.

Selecting it applies a fixed, published weight profile — **Air 35, Safety 28, Commute 20, Affordability 12, Essentials 5** — resolved server-side from an allowlist (`backend/app/main.py`). The browser sends only a preset id and can never inject weights; an unrecognised id is rejected with HTTP 422 rather than silently ignored. The "Prioritized for family health" indicator renders only when the server confirms the profile was applied.

Alongside it, essential-services proximity is surfaced per locality and captioned as context that is not part of the FitScore.

---

## <img src="assets/readme/techstack.svg" height="22" align="center" alt="" /> &nbsp;Tech stack

| Layer | Technology |
|---|---|
| **AI / LLM** | **Gemini 2.5 Flash on Vertex AI** — structured output via Pydantic schemas, NL→weights, NL→SQL, grounded Q&A, explanations, Google Search grounding and image understanding |
| **Agent orchestration** | **Google Agent Development Kit (ADK)** — coordinator with three specialist agents, deterministic tools, SSE event streaming |
| **Data warehouse & ML** | **BigQuery** (locality snapshots, hourly AQI history) · **BigQuery ML ARIMA_PLUS** (AQI forecasting with confidence intervals) |
| **Live data and input** | **Google Maps Platform** — Air Quality API (CPCB), Places API (New), Distance Matrix, Maps JavaScript SDK, Place Photos · **Google Cloud Speech-to-Text v2** |
| **Backend** | **FastAPI** (Python) · **Cloud Firestore** shared Pulse and rent job state · Server-Sent Events · SQL allowlist guard · per-instance rate limiting · optional Secret Manager |
| **Frontend** | **React 18 + Vite** · Tailwind CSS · Recharts · lucide-react · Google Identity Services with guest mode |
| **Deployment** | **Cloud Run** (backend, built by **Cloud Build**, stored in **Artifact Registry**) · **Firebase Hosting** (frontend) |

---

## <img src="assets/readme/testing.svg" height="22" align="center" alt="" /> &nbsp;Verification

These figures come from the reproducible verification commands below.

| Gate | Result |
|---|---|
| Backend tests | **396 passed** across 37 test modules |
| Frontend tests | **122 passed** across 19 test files |
| Combined automated tests | **518 passed** |
| Production build | **Passing** with Vite 8.1.5; initial JavaScript bundle **62.86 kB gzip** |
| Evaluation scorecard | **18 / 18** across nine dimensions, 0 billable calls |
| City validator | **0 structural errors** across 13 cities |

Reproduce:

```bash
cd backend && python -m pytest -q          # 396 passed
python -m app.evaluation                    # 18 / 18, zero billable calls
python -m tools.validate_city              # 0 structural errors

cd .. && npm test                          # 122 passed
npm run build                              # production build
```

The backend suite runs fully offline — Vertex, BigQuery and Maps are stubbed — so it is deterministic and safe to run in CI.

Coverage is weighted toward the properties that are easy to get wrong: absolute CPCB bands at category boundaries, equal and all-Severe AQI, provenance envelopes for live/curated/grounded/absent data, SQL guard escapes including comma joins, UNION and alias-shadow attempts, independent city binding, dry-run cost enforcement, CORS failing closed, secrets failing safe without logging material, and honest failure states in place of indefinite loading.

## <img src="assets/readme/setup.svg" height="22" align="center" alt="" /> &nbsp;Setup and local development

**Prerequisites:** Node 20.19+ (or 22.12+), Python 3.12+, and a GCP project with BigQuery, Vertex AI, Cloud Firestore (Native mode), Air Quality, Places (New) and Distance Matrix enabled, plus `gcloud auth application-default login`.

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # fill in the values below
python -m uvicorn app.main:app --port 8080
```

`backend/.env`:

```env
GCP_PROJECT=your-project-id
GCP_LOCATION=us-central1
BQ_DATASET=nestiq
GEMINI_MODEL=gemini-2.5-flash
FIRESTORE_DATABASE=(default)

# Server-only key: Air Quality, Places, Distance Matrix. Never sent to a browser.
MAPS_API_KEY=your-server-maps-key
# Public key served to the browser for the Maps JS SDK.
# Restrict this one by HTTP referrer in the Google Cloud console.
MAPS_BROWSER_KEY=your-browser-maps-key
# CORS allowlist. UNSET means localhost only, so a misconfigured deploy fails loudly.
ALLOWED_ORIGINS=http://localhost:5173
```

There is no `--reload`; restart the server after editing any `backend/app/*.py`.

**Frontend**

```bash
npm install
npm run dev                                             # http://localhost:5173
```

Optional: set `VITE_GOOGLE_CLIENT_ID` in a root `.env` to enable Google sign-in. Guest mode works without it.

> `.env` files are gitignored. Restrict the browser Maps key by HTTP referrer, and the server key by API, before any public deployment.

---

## <img src="assets/readme/resilience.svg" height="22" align="center" alt="" /> &nbsp;Resilience and performance

Production behaviour under load and partial failure, each item verifiable in code or covered by a test.

- **Stale-while-revalidate caching** (`backend/app/maps.py`). Locality metrics carry a 30-minute TTL; an expired entry is served immediately while a background thread refreshes it, so a user never waits on Google. Covered by `test_expired_cache_served_instantly_and_refreshed_in_background`.
- **Parallel fan-out.** Air quality, amenities, essentials, commute and imagery are fetched concurrently per locality via `ThreadPoolExecutor`, rather than serially.
- **Concurrent-build de-duplication.** Simultaneous cold requests for the same city share one build instead of each calling Google, asserted by `test_concurrent_cold_requests_share_one_build`.
- **Durable Pulse and rent single-flight coordination** (`backend/app/pulse_store.py`, `backend/app/main.py`). Firestore transactions let every Cloud Run instance observe the same pending or completed generation. Simultaneous requests launch one grounded job; expired leases can be reclaimed, and an older worker cannot overwrite a newer result.
- **Stale verified evidence survives refresh failures.** Pulse and grounded rent return the last successful cited result immediately while one bounded refresh runs. A failed refresh is labelled honestly and never erases previously verified evidence.
- **Bounded retry policy** (`src/lib/api.js`, `backend/app/maps.py`, `backend/app/gemini.py`, `backend/app/main.py`). Frontend and provider calls retry transient transport or HTTP failures once. Pulse may additionally repeat an empty or uncited grounding response within its 70-second job deadline. Permanent errors, cancellation and cited-but-invalid evidence are not retried.
- **Failures, not endless spinners** (`backend/app/main.py`). AQI forecast, community-review, Pulse and rent paths all have bounded waits and explicit retryable terminal states. No missing graph or evidence source can leave the UI loading forever.
- **Click-prefetch and progressive detail** (`src/lib/api.js`, `src/components/results/NeighborhoodCard.jsx`, `src/pages/neighborhood/NeighborhoodDetail.jsx`). Card hover and focus stay free of grounded work. A locality click starts its fast AQI route, rich detail, locality Pulse and hidden rent preparation together; every duplicate joins the same in-flight request. A cached city snapshot renders immediately while the independent Google forecast and Gemini explanation finish in parallel.
- **Bounded evidence polling** (`src/lib/api.js`, `src/lib/watchlistPulse.js`, `src/pages/neighborhood/detailTabs.jsx`). Community reviews, Locality Pulse and rent verification have request timeouts, finite polling budgets, explicit background states and retry actions instead of indefinite spinners.
- **Route-level recovery** (`src/App.jsx`). Every page is code-split behind `React.lazy`, with a branded loading state, a chunk-load error boundary and a real not-found route. The initial production JavaScript bundle is 62.86 kB gzip in the verified build.
- **Non-blocking snapshot writes.** BigQuery snapshots are written off the request path and only when a city's data was genuinely rebuilt (`maybe_log_snapshot`).
- **Warm start.** The default city's signals and the Vertex client are pre-warmed at startup so the first user request does not pay cold-start cost.
- **Privacy-safe structured telemetry** (`backend/app/telemetry.py`, `backend/app/main.py`). Request IDs, route status, tool latency, fallback use and agent outcomes are logged as bounded JSON fields; prompts, answers, SQL, document contents, credentials and provider error messages are blocked.

---

## <img src="assets/readme/structure.svg" height="22" align="center" alt="" /> &nbsp;Project structure

```text
NestIQ/
├── src/                              React frontend (Vite)
│   ├── pages/
│   │   ├── Home.jsx                  landing, search entry, Family Health preset
│   │   ├── Results.jsx               ranked matches, filters, SSE agent progress
│   │   ├── Compare.jsx               side-by-side pillar comparison
│   │   ├── Saved.jsx                 watchlist of saved localities
│   │   ├── Alerts.jsx                watchlist alerts + city-wide pulse
│   │   ├── AskNestIQ.jsx             multimodal Copilot, tool receipts, follow-ups
│   │   ├── SignIn.jsx                Google Identity Services, guest mode
│   │   └── neighborhood/
│   │       ├── NeighborhoodDetail.jsx  locality shell, 7 tabs, lazy evidence loads
│   │       └── detailTabs.jsx          per-pillar tabs and evidence rendering
│   ├── components/
│   │   ├── layout/                   sidebar, topbar, mobile nav, city picker
│   │   ├── results/                  cards, agent progress, filters, map
│   │   ├── ui/                       score gauge, logo, cursor halo
│   │   ├── LocalityMap.jsx           Maps JS SDK wrapper
│   │   └── PulseEvents.jsx           shared civic-event renderer, honest empty states
│   └── lib/
│       ├── api.js                    API client, bounded requests, soft failures
│       ├── adapt.js                  API model to UI model, currency formatting
│       ├── fitscore.js               client-side reweighting with the backend policy
│       ├── presets.js                allowlisted search presets
│       ├── essentials.js             essential-services cards, never scored
│       ├── citySnapshot.js           averages that return null rather than zero
│       ├── watchlistPulse.js         alert aggregation, no-alerts requires evidence
│       ├── cityStore.jsx             city selection and detection
│       └── saved.js · recent.js      localStorage watchlist and question history
├── backend/
│   ├── app/
│   │   ├── main.py                   FastAPI endpoints, CORS allowlist, presets,
│   │   │                             rate limiting, pulse and review caches
│   │   ├── adk_orchestration.py      ADK coordinator, 3 specialists, validator, explainer
│   │   ├── gemini.py                 NL to weights, NL to SQL, explanations,
│   │   │                             grounded reviews, pulse and rent verification
│   │   ├── maps.py                   Air Quality, Places, Distance Matrix, India
│   │   │                             scoring, anomalies, essentials, safety profile
│   │   ├── air_quality.py            absolute CPCB bands, health scoring, risk flags
│   │   ├── evidence.py               provenance envelopes for every pillar
│   │   ├── civic_rag.py              citation-locked civic document retrieval
│   │   ├── evaluation.py             offline responsible-AI scorecard, no billable calls
│   │   ├── copilot.py                deterministic evidence/analytics routing
│   │   ├── transcription.py          memory-only Google Speech-to-Text v2
│   │   ├── image_analysis.py         memory-only Gemini image understanding
│   │   ├── telemetry.py              privacy-safe request and agent observability
│   │   ├── sql_guard.py              NL to SQL table allowlist, paren-aware scanner
│   │   ├── rate_limit.py             per-instance fixed-window limiting
│   │   ├── secrets.py                optional Secret Manager backing, fail-safe
│   │   ├── bq_india.py               snapshots, AQI history, ARIMA_PLUS, byte caps
│   │   ├── bq.py                     BigQuery client and the NYC reference pipeline
│   │   ├── india.py                  13 cities, 73 localities, default pillar weights
│   │   ├── market_data.py            source-backed rent baselines with citation URLs
│   │   ├── fitscore.py               normalization and weighted scoring engine
│   │   ├── config.py                 settings, feature flags, timeouts
│   │   └── schemas.py                request models
│   ├── tools/
│   │   └── validate_city.py          city onboarding validator and coverage report
│   ├── data/
│   │   ├── civic_knowledge.json      civic document corpus
│   │   └── city_coverage_report.md   generated validation artifact
│   └── tests/                        396 tests across 37 modules, fully offline
├── assets/readme/                    themed section icons
├── NestIQ-Design-Spec.md             product and system contract
├── SECURITY.md                       public security architecture
└── README.md                         submission overview and verification
```

---

## <img src="assets/readme/api.svg" height="22" align="center" alt="" /> &nbsp;API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/search` | NL query to weighted FitScore ranking. Optional allowlisted `preset` |
| `GET` | `/api/search/stream` | The same search, streamed as SSE ADK agent events |
| `GET` | `/api/neighborhoods` | All localities for a city on default weights |
| `GET` | `/api/neighborhood/{id}` | Detail: sub-scores, evidence envelopes, anomalies, AQI history, Google and BQML forecasts |
| `GET` | `/api/neighborhood/{id}/air-quality-forecast` | Fast Google CPCB forecast for the Overview chart; no Gemini or city rebuild |
| `GET` | `/api/neighborhood/{id}/essentials` | Essential-services proximity. Context only, never scored |
| `GET` | `/api/neighborhood/{id}/reviews` | Cited resident sentiment |
| `GET` | `/api/neighborhood/{id}/pulse` | Grounded civic events for a locality |
| `GET` | `/api/neighborhood/{id}/rent-verification` | On-demand grounded rent evidence with citations |
| `GET` | `/api/neighborhood/{id}/civic-knowledge` | Citation-locked civic document retrieval |
| `GET` | `/api/city/{city}/pulse` | City-wide civic pulse, same pipeline |
| `POST` | `/api/ask` | Deterministically routed Copilot question: model-only guidance, city evidence, locality evidence or guarded BigQuery analytics |
| `POST` | `/api/copilot/transcribe` | Memory-only Google Speech-to-Text for a bounded voice clip |
| `POST` | `/api/copilot/analyze-image` | Memory-only Gemini analysis of one JPG, PNG or WebP image |
| `GET` | `/api/cities` · `/api/config` · `/api/health` | Supported cities · browser-safe config · liveness |

An unrecognised `preset` returns `422` rather than being silently ignored, so a client can never receive a different ranking than the one it requested.

---

## <img src="assets/readme/demo.svg" height="22" align="center" alt="" /> &nbsp;Demo flow

1. **Search.** Use the **Family Health & Resilience** preset on the home page. The published weight profile is applied server-side and the results header confirms it was genuinely applied.
2. **Agents.** Watch the ADK planner, Live Signals, Analytics, Civic Intelligence, Validator and Explainer stream real findings over SSE.
3. **Provenance.** Open the top match. Every pillar publishes its weight and source; any missing signal is marked unavailable and the score is labelled provisional with coverage.
4. **Absolute air.** On the Air Quality tab the CPCB band is absolute, so a polluted locality cannot appear healthy by being the best of a bad set. The BQML ARIMA_PLUS forecast runs alongside Google's.
5. **Safety semantics.** Switch to Lucknow or Kochi and open Safety. The page labels live police, hospital and fire-station access as emergency resilience—not as a crime rate—and excludes the pillar if that live evidence is unavailable.
6. **Copilot routing.** Begin with a greeting or calculation to show the model-only general path, ask a current city question to invoke structured evidence, then request a cross-locality comparison to use guarded BigQuery analytics. Each answer exposes a truthful tool receipt. Record a short voice question or attach a neighborhood image to demonstrate the same privacy-bounded surface.

---

## <img src="assets/readme/roadmap.svg" height="22" align="center" alt="" /> &nbsp;Roadmap

- Expand verified locality and safety-source coverage across more Indian cities.
- Add Cloud Armor or API Gateway for global edge-rate policies.
- Extend durable multi-instance coordination to resident-review jobs.
- Add scheduled watchlist notifications and multilingual product evaluation.

---

<div align="center">

Built for better living and smarter communities · Powered by Google Cloud and Gemini

</div>
