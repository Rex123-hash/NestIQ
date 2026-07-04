<div align="center">

# NestIQ — AI-Powered Decision Intelligence Platform

**Find the right neighborhood. For your life.**

*Ask in plain language → specialist AI agents score every locality on live data → get a ranked, explainable answer in seconds.*

Built for **Google Cloud Gen AI Academy APAC — Cohort 2 Hackathon** (Problem Statement: *AI for Better Living and Smarter Communities*)

**[Live demo → nestiq-india.web.app](https://nestiq-india.web.app)**

`Gemini on Vertex AI` · `BigQuery + BigQuery ML` · `Google Maps Platform` · `FastAPI` · `React` · `66 automated tests`

</div>

---

## The problem

Choosing where to live in an Indian city is one of the highest-stakes decisions a person makes — and today it means juggling a dozen tabs: rent sites, commute checks, word-of-mouth on safety, and (increasingly, the thing people care about most in Delhi NCR) **air quality**. The data exists, but it's scattered, unpersonalized, and never predictive.

**NestIQ** turns that into a single decision: describe what you need in one sentence — *"clean air, safe area under ₹25,000, short commute"* — and get a ranked shortlist of localities with a transparent **FitScore**, live air-quality forecasts, and an AI explanation of *why* each one fits **you**.

## What makes it different

| | |
|---|---|
| **Air Quality as a first-class pillar** | Live **CPCB AQI** per locality via the Google Air Quality API — current, 24h history, and 24h forecast — weighted into every recommendation. Built for the reality of Indian cities. |
| **FitScore** | A personalized 0–100 match across five pillars (Affordability · Safety · Commute · Lifestyle · Air Quality). Weights come from *your own words*, parsed by Gemini — and you can re-tune them live with sliders. Fully transparent breakdown, never a black box. |
| **Agent fan-out you can watch** | A Planner parses your request, a Data Collector pulls live Google signals, and five specialist pillar agents score localities in parallel — streamed to the UI over **SSE** so you see the system think. |
| **Conversational analytics (NL→SQL)** | Ask NestIQ a cross-locality question and Gemini writes a real **BigQuery SQL** query, runs it against our locality warehouse, and answers grounded in the rows — *with the generated SQL shown to you*. |
| **Self-building dataset + our own ML forecast** | Every search snapshots live locality features into **BigQuery** (`india_localities`) and appends hourly AQI readings (`india_aqi_history`). A **BigQuery ML ARIMA_PLUS** model trained on that accumulated history produces our own AQI forecast — with confidence intervals — alongside Google's. |
| **10 cities, Tier-1 to Tier-3** | Delhi NCR, Mumbai, Bengaluru, Kolkata, Hyderabad, Chennai, Pune, **Patna**, **Ranchi** — decision intelligence isn't just for metros. |

## How it works

```
                        ┌──────────────────────────────────────────────┐
  "clean air, safe,     │            React frontend (Vite)             │
   under ₹25k"  ───────►│  NL search · live agent panel · FitScore UI  │
                        │  maps · filters · watchlist · Ask NestIQ     │
                        └───────────────────┬──────────────────────────┘
                                            │ REST + SSE
                        ┌───────────────────▼──────────────────────────┐
                        │           FastAPI backend (Python)           │
                        │                                              │
                        │   Planner ──► Data Collector ──► 5 pillar    │
                        │   (Gemini)     (live Google)     agents      │
                        │                     │            ──► Orchestrator
                        │                     │                → FitScore
                        └──────┬──────────────┼───────────────┬────────┘
                               │              │               │
                 ┌─────────────▼───┐  ┌───────▼───────┐  ┌────▼────────────┐
                 │ Vertex AI       │  │ Google Maps   │  │ BigQuery + BQML │
                 │ (Gemini)        │  │ Platform      │  │                 │
                 │ · NL → weights  │  │ · Air Quality │  │ · locality      │
                 │ · NL → SQL      │  │   (CPCB AQI)  │  │   snapshots     │
                 │ · explanations  │  │ · Places      │  │ · AQI history   │
                 │ · grounded Q&A  │  │ · Distance    │  │ · ARIMA_PLUS    │
                 │                 │  │   Matrix      │  │   AQI forecast  │
                 └─────────────────┘  └───────────────┘  └─────────────────┘
```

**The flow:** your sentence → Gemini extracts budget + pillar weights → live AQI/amenity/commute data is fetched per locality (30-min cache) → each pillar agent normalizes its metric across the city → the orchestrator combines them with your weights into FitScores → results stream back with explanations. Every search also snapshots the features into BigQuery, so the platform's own warehouse — and the BQML forecast trained on it — grows with use.

## The FitScore

```
FitScore = Σ (pillar_subscore × your_weight) / Σ weights
```

| Pillar | Signal | Source |
|---|---|---|
| Affordability | Median monthly rent vs. your budget | Curated market estimates (labeled) |
| Safety | Locality safety index | Curated baseline (open locality-level crime data doesn't exist for India — labeled honestly in-app) |
| Commute | Live drive time (with traffic) to the city's work hub | Google Distance Matrix |
| Lifestyle | Amenities within 1.5 km (restaurants, gyms, parks, markets…) | Google Places |
| Air Quality | Live CPCB AQI (lower = cleaner) | Google Air Quality API |

Sub-scores are min-max normalized **within the selected city**, so a 90 in Patna means "best in Patna," not "as clean as Zurich." Weights are yours: parsed from your query, adjustable live.

## Tech stack

| Layer | Technology |
|---|---|
| AI / LLM | **Gemini 2.5 Flash on Vertex AI** — structured output (Pydantic schemas), NL→SQL, grounded Q&A, explanations |
| Data warehouse & ML | **BigQuery** (locality snapshots + AQI history) · **BigQuery ML ARIMA_PLUS** (AQI forecasting with confidence intervals) |
| Live data | **Google Maps Platform** — Air Quality API (CPCB), Places API (New), Distance Matrix, Maps JS SDK, Places Photos |
| Backend | **FastAPI** (Python 3.14) · SSE streaming · self-healing Vertex client · read-only SQL guards |
| Frontend | **React 18 + Vite** · Tailwind CSS · Recharts · Google Identity Services (sign-in) + guest mode |
| Auth & state | Client-side Google sign-in (JWT decode) · localStorage watchlist/saved |

## Project structure

```
├── src/                        # React frontend
│   ├── pages/                  # Home · Results · Detail (7 tabs) · Compare · Saved · Alerts · Ask · SignIn
│   ├── components/             # cards, agent panel, filters, maps, charts, layout
│   └── lib/                    # api client, SSE, city store, auth, saved, adapters
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI endpoints (search, stream, detail, ask, cities)
│   │   ├── gemini.py           # NL→weights, NL→SQL, explanations, grounded Q&A
│   │   ├── maps.py             # Air Quality / Places / Distance Matrix + India scoring
│   │   ├── bq_india.py         # BigQuery snapshots, AQI history, BQML forecast, SQL guards
│   │   ├── india.py            # 9 cities · 50+ localities (curated geo anchors)
│   │   ├── fitscore.py         # normalization + weighted scoring engine
│   │   └── bq.py, config.py, schemas.py
│   ├── data_pipeline/          # NYC reference pipeline (Zillow + 311 + collisions + ARIMA_PLUS)
│   └── seed_bq_india.py        # seed BigQuery tables from live data
└── NestIQ-Design-Spec.md       # full design document
```

## Run it locally

**Prereqs:** Node 18+, Python 3.12+, a GCP project with **BigQuery, Vertex AI, Air Quality, Places (New), Distance Matrix** APIs enabled, and `gcloud auth application-default login` done.

```bash
# 1. Backend
cd backend
python -m venv .venv && .venv/Scripts/activate     # Windows (use bin/activate on mac/linux)
pip install -r requirements.txt
cp .env.example .env                                # fill in GCP_PROJECT + MAPS_API_KEY
python seed_bq_india.py delhi-ncr                   # seed BigQuery (optional but recommended)
python -m uvicorn app.main:app --port 8080

# 2. Frontend (new terminal, repo root)
npm install
npm run dev                                         # → http://localhost:5173
```

`backend/.env`:

```env
GCP_PROJECT=your-project-id
GCP_LOCATION=us-central1
BQ_DATASET=nestiq
GEMINI_MODEL=gemini-2.5-flash
MAPS_API_KEY=your-maps-platform-key
```

> **Security:** `.env` files are gitignored. Restrict your Maps key (HTTP referrers + only the APIs above) before any public deployment.

## API at a glance

| Endpoint | What it does |
|---|---|
| `POST /api/search` | NL query → Gemini weights → live-data FitScore ranking |
| `GET /api/search/stream` | Same, streamed as SSE agent events (Planner → Collector → pillar agents → Orchestrator) |
| `GET /api/neighborhood/{id}` | Full locality detail: sub-scores, Gemini "why", AQI history + Google forecast + **BQML forecast** |
| `POST /api/ask` | Cross-locality questions → **NL→SQL on BigQuery** (SQL + rows returned) · locality questions → grounded Gemini |
| `GET /api/cities` | Supported cities |

## Quality & testing

**66 automated tests** run fully offline (every external service is stubbed), in under 5 seconds:

| Suite | Tests | What it proves |
|---|---|---|
| `backend/tests/test_fitscore.py` | 16 | Scoring engine: normalization bands, weight-driven re-ranking (max-weighting Air Quality vs. Lifestyle provably flips the winner), match labels, edge cases |
| `backend/tests/test_sql_guards.py` | 19 | **NL→SQL safety**: injection attempts (`DROP`, `DELETE`, stacked statements, `EXPORT DATA`) are rejected *before* any BigQuery client is even constructed; LLM output sanitization |
| `backend/tests/test_india_catalog.py` | 8 | Data integrity: 9 cities, globally-unique locality IDs, every coordinate inside India, sane rent/safety ranges |
| `backend/tests/test_api.py` | 10 | Full API contract: search ranking order, detail with BQML confidence bounds, NL→SQL ask path, 404s, and the **SSE agent stream** (all 5 pillar agents + orchestrator + final payload) |
| `src/lib/*.test.{js,jsx}` | 13 | Frontend: Indian-notation rent formatting (₹1,25,000), tag derivation, map-pin bounds, city auto-detection from free text ("flat in patna…" → Patna) |

```bash
cd backend && python -m pytest tests -q     # 53 passed
npm test                                    # 13 passed
```

## Honest data notes

- **Live:** AQI (CPCB via Google), amenity counts, commute times, locality photos — fetched in real time, cached 30 min.
- **Estimated & labeled:** median rents and safety baselines are curated market estimates; locality-level open data for these doesn't exist in India. The UI says so wherever they appear.
- **Accumulating:** BigQuery tables grow with every search; the AQI forecast model improves as history accumulates.
- The repo also contains a complete **NYC reference pipeline** (Zillow ZORI + NYC 311 + NYPD collisions in BigQuery, rent forecasting with ARIMA_PLUS) that validated the architecture on fully-open public data.

## Roadmap

- Real rent ingestion (city rent indices) into BigQuery
- Watchlist push alerts (AQI threshold crossings) via Cloud Scheduler
- Hindi + regional language interface
- Cloud Run deployment with CI/CD

---

<div align="center">

Built for better living and smarter communities · Powered by Google Cloud & Gemini

</div>
