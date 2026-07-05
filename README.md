<div align="center">

# <img src="public/favicon.svg" height="44" align="center" alt="" /> &nbsp;NestIQ

### AI-Powered Decision Intelligence Platform

**Find the right neighborhood. For your life.**

Ask in plain language. Specialist AI agents score every locality on live data. Get a ranked, explainable answer in seconds.

![React](https://img.shields.io/badge/React_18-7C5CF6?style=flat-square&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7C5CF6?style=flat-square&logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-7C5CF6?style=flat-square&logo=fastapi&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_on_Vertex_AI-7C5CF6?style=flat-square&logo=googlegemini&logoColor=white)
![BigQuery](https://img.shields.io/badge/BigQuery_+_BQML-7C5CF6?style=flat-square&logo=googlebigquery&logoColor=white)
![Maps](https://img.shields.io/badge/Google_Maps_Platform-7C5CF6?style=flat-square&logo=googlemaps&logoColor=white)
![Tests](https://img.shields.io/badge/tests-87_passing-3FB984?style=flat-square)

Built for the **Google Cloud Gen AI Academy APAC — Cohort 2 Hackathon**
Problem Statement: *AI for Better Living and Smarter Communities*

**[Live Demo → nestiq-india.web.app](https://nestiq-india.web.app)**

<br />

<img src="assets/preview.png" alt="NestIQ — describe your ideal neighborhood and get ranked, explainable matches" width="100%" />

</div>

---

## <img src="assets/readme/overview.svg" height="22" align="center" alt="" /> &nbsp;Overview

**The persona.** A young professional or student relocating to a new city for a job. They have three days to pick a neighborhood they have never seen. They need to balance rent, commute time to a new office, and safety — and in Indian metros, they *must* also weigh air quality. Today that means juggling a dozen browser tabs: rent portals, a maps app for commute, word-of-mouth for safety, and a separate app for AQI. The data exists, but it is scattered, unpersonalized, and never predictive.

**NestIQ turns all of that into a single decision.** You describe what you need in one sentence — *"clean air, safe area under ₹25,000, short commute"* — and NestIQ returns a ranked shortlist of localities, each with a transparent **FitScore**, a live air-quality forecast, cited resident sentiment, and a plain-language explanation of *why* it fits **you**.

It is not a search filter with sliders. It is a **parallel multi-agent system** that converts natural language into weighted priorities, pulls live data from Google Maps Platform, forecasts air quality with a model it trains itself in BigQuery ML, and streams the specialist scoring process to the browser over Server-Sent Events so you can watch the system think.

> **Design principle: zero hallucination.** Every number NestIQ shows is traceable to a live source. FitScores come strictly from Google Maps and Air Quality APIs. Natural-language questions are turned into real BigQuery SQL and the exact query is shown to you alongside the answer. Gemini explains the numbers; it never invents them.

---

## <img src="assets/readme/different.svg" height="22" align="center" alt="" /> &nbsp;What makes it different

| Capability | What is behind it |
|---|---|
| **Zero hallucination, everything sourced** | FitScores are derived strictly from live Google Maps and Air Quality APIs. NL questions become real BigQuery SQL, and the generated query is shown to the user next to the cited answer. |
| **Conversational analytics (NL → SQL)** | Ask a cross-locality question ("Where is rent under ₹25k and AQI under 150?") and Gemini writes a real **BigQuery SQL** query, runs it against the locality warehouse, and answers grounded in the returned rows — with the SQL shown to you. |
| **Self-building dataset + our own ML forecast** | Every search snapshots live features into BigQuery (`india_localities`) and appends hourly AQI (`india_aqi_history`). A **BigQuery ML ARIMA_PLUS** model trained on that accumulating history produces our own AQI forecast, with confidence intervals, alongside Google's. |
| **Anomaly detection** | NestIQ automatically flags localities that break the city pattern — a cross-sectional outlier (a metric ≥ 1.5σ from the city mean, e.g. *"unusually polluted"*, *"unusually affordable"*) and a temporal AQI spike versus a locality's own 24-hour history. Directly answers the PS requirement to "identify patterns, trends, and anomalies." |
| **Explainable FitScore, never a black box** | A 0–100 match across five pillars, weighted by *your own words*. A published methodology panel shows every pillar's weight, why it carries that weight, and its live data source. Weights re-tune live with sliders. |
| **Agent fan-out you can watch** | A Planner parses the request, a Data Collector pulls live Google signals, and five specialist pillar agents score localities in parallel — streamed to the UI over **SSE** so the reasoning is visible, not a spinner. |
| **Air quality as a first-class pillar** | Live **CPCB AQI** per locality via the Google Air Quality API — current reading, 24-hour history, and 24-hour forecast — weighted into every recommendation. Built for the reality of Indian cities. |
| **Cited resident sentiment** | Grounded retrieval: Gemini + Google Search surfaces what residents say online, summarized with clickable source citations, cached for 24 hours. |
| **9 cities, Tier-1 to Tier-3** | Delhi NCR, Mumbai, Bengaluru, Kolkata, Hyderabad, Chennai, Pune, **Patna**, and **Ranchi** — decision intelligence is not just for the metros. |

---

## <img src="assets/readme/architecture.svg" height="22" align="center" alt="" /> &nbsp;How it works

```text
                        "clean air, safe, under ₹25,000"
                                        │
                                        ▼
                           ┌─────────────────────────┐
                           │      Planner Agent      │   Gemini extracts a budget and a
                           │    natural language →   │   weight per pillar from your words
                           │     weights + budget    │
                           └────────────┬────────────┘
                                        │
                                        ▼
                           ┌─────────────────────────┐
                           │   Data Collector Agent  │   Live fan-out to Google Maps
                           │   live Google signals   │   Platform · 30-min SWR cache
                           └────────────┬────────────┘
                                        │
                                        ▼
   ┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
   │ Air Quality  │ Commute      │ Safety       │ Lifestyle    │ Affordability│
   │ Agent        │ Agent        │ Agent        │ Agent        │ Agent        │
   │ • CPCB AQI   │ • Traffic    │ • Locality   │ • Places     │ • Rent vs    │
   │ • 24h trend  │   Matrix     │   profile    │   ≤ 1.5 km   │   budget     │
   │ • BQML fcast │ • Drive to   │ • Env.       │ • Amenity    │ • Min-max    │
   │              │   work hub   │   health     │   density    │   normalized │
   └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
                                        │
                                        ▼
                           ┌─────────────────────────┐
                           │       Orchestrator      │   Combines pillar sub-scores
                           │    weighted FitScore    │   with your extracted weights
                           └────────────┬────────────┘
                                        │
                                        ▼
                Ranked FitScores + anomaly flags, streamed to the
                 UI over SSE, then explained by Gemini on the detail page
```

**The flow.** Your sentence goes to Gemini, which extracts a budget and a weight for each pillar. Live AQI, amenity, and commute data is fetched per locality (cached 30 minutes). Each pillar agent normalizes its metric across the city, the orchestrator combines them with your weights into FitScores, and results stream back with anomaly flags and explanations. Every search also snapshots the features into BigQuery, so the warehouse — and the ARIMA_PLUS forecast trained on it — grows with use.

---

## <img src="assets/readme/fitscore.svg" height="22" align="center" alt="" /> &nbsp;The FitScore

```text
FitScore = Σ (pillar_subscore × your_weight) / Σ weights
```

| Pillar | Signal | Source | Default weight |
|---|---|---|---|
| **Air Quality** | Live CPCB AQI (lower is cleaner) | Google Air Quality API | 25% |
| **Affordability** | Median monthly rent vs. your budget | Curated market estimate (labeled in-app) | 20% |
| **Safety** | Locality safety index blended with live environmental health | Curated baseline (labeled — open locality-level crime data does not exist for India) | 20% |
| **Commute** | Live drive time with traffic to the city's work hub | Google Distance Matrix | 20% |
| **Lifestyle** | Amenities within 1.5 km (restaurants, cafes, gyms, parks, markets) | Google Places (New) | 15% |

Sub-scores are **min-max normalized within the selected city**, so a 90 in Patna means "best in Patna," not "as clean as Zurich." Air Quality carries the highest default weight because, across Indian cities, it is the most health-critical signal and the one that varies most between localities. **The weights are yours** — parsed from your query by Gemini and adjustable live with sliders. The detail page publishes the full rubric so the score is explainable, never a black box.

---

## <img src="assets/readme/anomaly.svg" height="22" align="center" alt="" /> &nbsp;Anomaly detection

NestIQ automatically surfaces localities that break the pattern — free of extra API calls, reusing metrics already fetched:

- **Cross-sectional outliers.** For each metric, a locality flagged when its value sits **≥ 1.5σ from the city mean** — for example *"Unusually polluted — AQI 251, 1.7σ above the city average"* or *"Unusually affordable — ₹17,000/mo, 1.5σ below."* Shown as an "Anomalies detected" panel on results and as flag chips on the detail page.
- **Temporal AQI spikes.** On the Air Quality tab, the current reading is compared to the locality's own 24-hour history; a genuine spike (≥ 1.5σ from its rolling mean) is flagged, so a pollution event is caught the moment it happens.

Guardrails keep it honest: a minimum-sample floor and a two-flags-per-locality cap prevent false positives on thin data.

---

## <img src="assets/readme/techstack.svg" height="22" align="center" alt="" /> &nbsp;Tech stack

| Layer | Technology |
|---|---|
| **AI / LLM** | **Gemini 2.5 Flash on Vertex AI** — structured output (Pydantic schemas), NL → weights, NL → SQL, grounded Q&A, explanations, Google-Search-grounded web reviews |
| **Data warehouse & ML** | **BigQuery** (locality snapshots + hourly AQI history) · **BigQuery ML ARIMA_PLUS** (AQI forecasting with confidence intervals) · **BigQuery public datasets** (NYC 311, NYPD collisions) for the reference pipeline |
| **Live data** | **Google Maps Platform** — Air Quality API (CPCB), Places API (New), Distance Matrix, Maps JavaScript SDK, Place Photos |
| **Backend** | **FastAPI** (Python) · Server-Sent Events streaming · self-healing Vertex client · read-only SQL guards |
| **Frontend** | **React 18 + Vite** · Tailwind CSS · Recharts · lucide-react · **Google Identity Services** (OAuth sign-in) + guest mode |
| **Auth & state** | Client-side **Google sign-in** (Google Identity Services, JWT decode) · localStorage watchlist, saved localities, and recent questions |
| **Deployment & CI** | **Cloud Run** (backend, containerized by **Cloud Build** and stored in **Artifact Registry**) · **Firebase Hosting** (frontend) |

> **Google Cloud footprint.** Vertex AI (Gemini 2.5 Flash) · Google Search grounding · BigQuery · BigQuery ML (ARIMA_PLUS) · BigQuery public datasets · Google Maps Platform (Air Quality, Places New, Distance Matrix, Maps JS SDK, Place Photos) · Google Identity Services (OAuth sign-in) · Cloud Run · Cloud Build · Artifact Registry · Firebase Hosting.

---

## <img src="assets/readme/data.svg" height="22" align="center" alt="" /> &nbsp;Data sources & honesty

Being explicit about provenance is a feature, not a footnote:

- **Live** — CPCB AQI (via Google), amenity counts, commute times, and locality photos are fetched in real time and cached for 30 minutes.
- **Estimated & labeled** — median rents and safety baselines are curated market estimates; open locality-level data for these does not exist in India, and the UI says so wherever they appear.
- **Accumulating** — BigQuery tables grow with every search, and the ARIMA_PLUS forecast model improves as history builds up.
- **Reference pipeline** — the repo also contains a complete NYC pipeline (Zillow ZORI + NYC 311 + NYPD collisions in BigQuery, rent forecasting with ARIMA_PLUS) that validated the architecture on fully open public data.

---

## <img src="assets/readme/resilience.svg" height="22" align="center" alt="" /> &nbsp;Resilience & production

Production-class safety nets so the platform stays up under demo conditions:

- **SQL guards against injection** — `DROP`, `DELETE`, stacked statements, and `EXPORT DATA` are rejected *before* any BigQuery client is even constructed.
- **Stale-while-revalidate caching** — locality base metrics cached 30 minutes; Gemini explanations, detail payloads, and web reviews cached up to 24 hours, so responses are instant and LLM cost stays low.
- **Parallel fan-out** — the five pillar agents and all Google calls run concurrently, keeping a full search to roughly 2–3 seconds cold and about 10 ms warm.
- **Concurrent-build de-duplication** — simultaneous requests for the same city share one live build instead of each hammering Google.
- **Graceful fallbacks** — if the Air Quality API is cold or rate-limited, the system falls back to BigQuery snapshots or clearly labeled samples rather than failing.
- **Non-blocking logging** — BigQuery snapshot writes happen off the request thread and only when data actually changed.

---

## <img src="assets/readme/structure.svg" height="22" align="center" alt="" /> &nbsp;Project structure

```text
NestIQ/
├── src/                         React frontend (Vite)
│   ├── pages/                   Home · Results · NeighborhoodDetail (7 tabs) · Compare · Saved · Alerts · Ask · SignIn
│   ├── components/              result cards · agent progress (SSE) · filters · maps · FitScore gauges · layout
│   └── lib/                     API client · SSE parser · city store · auth · saved/recent stores · adapters
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI endpoints (search, SSE stream, detail, reviews, ask, cities)
│   │   ├── gemini.py            NL → weights, NL → SQL, explanations, grounded Q&A, web reviews
│   │   ├── maps.py              Air Quality / Places / Distance Matrix + India scoring + anomaly flags
│   │   ├── bq_india.py          BigQuery snapshots, AQI history, ARIMA_PLUS forecast, SQL guards
│   │   ├── india.py             9 cities · 53 localities (curated geo anchors) · FitScore weights
│   │   └── fitscore.py          normalization + weighted scoring engine
│   ├── tests/                   69 backend tests (fully offline)
│   └── seed_bq_india.py         seed BigQuery tables from live data
├── assets/readme/               themed section icons
└── README.md
```

---

## <img src="assets/readme/setup.svg" height="22" align="center" alt="" /> &nbsp;Setup & local development

**Prerequisites:** Node 18+, Python 3.12+, and a GCP project with **BigQuery, Vertex AI, Air Quality, Places (New), and Distance Matrix** APIs enabled, plus `gcloud auth application-default login`.

**1. Backend (FastAPI)**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # fill in the values below
python seed_bq_india.py delhi-ncr                       # optional: seed BigQuery from live data
python -m uvicorn app.main:app --port 8080
```

`backend/.env`:

```env
GCP_PROJECT=your-project-id
GCP_LOCATION=us-central1
BQ_DATASET=nestiq
GEMINI_MODEL=gemini-2.5-flash
MAPS_API_KEY=your-maps-platform-key
```

**2. Frontend (React + Vite)**

```bash
npm install
npm run dev                                             # http://localhost:5173
```

Optional: set `VITE_GOOGLE_CLIENT_ID` in a root `.env` to enable "Continue with Google" (guest mode works without it).

> **Security:** `.env` files are gitignored. Restrict your Maps key (HTTP referrers + only the APIs above) before any public deployment.

---

## <img src="assets/readme/api.svg" height="22" align="center" alt="" /> &nbsp;API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/search` | NL query → Gemini weights → live-data FitScore ranking |
| `GET` | `/api/search/stream` | Same, streamed as SSE agent events (Planner → Collector → 5 pillar agents → Orchestrator) |
| `GET` | `/api/neighborhood/{id}` | Full locality detail: sub-scores, anomaly flags, Gemini "why", AQI history + Google forecast + **BQML forecast** |
| `GET` | `/api/neighborhood/{id}/reviews` | Cited resident sentiment (Gemini + Google Search grounding) |
| `POST` | `/api/ask` | Ask NestIQ: **NL → SQL on BigQuery** (SQL + rows returned) for cross-locality questions; grounded Gemini for locality questions |
| `GET` | `/api/cities` | Supported cities |

---

## <img src="assets/readme/testing.svg" height="22" align="center" alt="" /> &nbsp;Testing & quality

**87 automated tests** (69 backend + 18 frontend) run fully offline — every external service is stubbed — in a few seconds.

| Suite | Focus |
|---|---|
| `backend/tests/test_fitscore.py` | Scoring engine: normalization bands, weight-driven re-ranking (max-weighting Air Quality vs. Lifestyle provably flips the winner), anomaly flags (outliers flagged, central localities and thin data are not), match labels, edge cases |
| `backend/tests/test_sql_guards.py` | NL → SQL safety: injection attempts (`DROP`, `DELETE`, stacked statements, `EXPORT DATA`) rejected before any BigQuery client is constructed |
| `backend/tests/test_api.py` | Full API contract: search ranking order, detail with BQML confidence bounds, NL → SQL ask path, 404s, and the SSE agent stream |
| `backend/tests/test_maps_cache.py`, `test_efficiency.py`, `test_bq_logging.py` | Stale-while-revalidate cache, parallel fan-out, concurrent-build de-dup, detail cache, single-log-per-build |
| `backend/tests/test_india_catalog.py` | Data integrity: 9 cities, globally-unique locality IDs, coordinates inside India, sane ranges |
| `src/lib/*.test.{js,jsx}` | Frontend: Indian-notation rent formatting (₹1,25,000), tag derivation, map-pin bounds, city auto-detection from free text |

```bash
cd backend && python -m pytest -q     # 69 passed
npm test                              # 18 passed
```

---

## <img src="assets/readme/demo.svg" height="22" align="center" alt="" /> &nbsp;Demo flow

1. **The persona.** You are Aditya, relocating to Delhi with three days to pick an apartment.
2. **The search.** Open NestIQ and type *"Clean air, safe area under ₹25,000, short commute."*
3. **The agents.** Watch the Planner, Data Collector, and five specialist agents light up the dashboard over live SSE.
4. **The results.** Scan the ranked shortlist and the "Anomalies detected" panel, then open the top match.
5. **The proof (zero hallucination).** Open "How it works" on the FitScore to see the transparent rubric. Check the Air Quality tab for the live Google AQI line *and* our own **BigQuery ML ARIMA_PLUS** forecast line.
6. **Ask NestIQ.** Go to the Ask tab and type *"Which locality has the cheapest rent but AQI under 150?"* Watch Gemini write the raw SQL, run it against BigQuery, and return a grounded answer with the query shown.

---

## <img src="assets/readme/roadmap.svg" height="22" align="center" alt="" /> &nbsp;Roadmap

- Real rent ingestion (city rent indices) into BigQuery
- Watchlist push alerts on AQI threshold crossings via Cloud Scheduler
- Hindi and regional-language interface
- CI/CD for Cloud Run + Firebase Hosting

---

<div align="center">

Built for better living and smarter communities · Powered by Google Cloud & Gemini

</div>
