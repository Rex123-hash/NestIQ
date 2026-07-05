<div align="center">

# NestIQ — AI-Powered Decision Intelligence Platform

**Find the right neighborhood. For your life.**

*Ask in plain language → specialist AI agents score every locality on live data → get a ranked, explainable answer in seconds.*

Built for **Google Cloud Gen AI Academy APAC — Cohort 2 Hackathon** (Problem Statement: *AI for Better Living and Smarter Communities*)

**[Live demo → nestiq-india.web.app](https://nestiq-india.web.app)**

`Gemini on Vertex AI` · `BigQuery + BigQuery ML` · `Google Maps Platform` · `FastAPI` · `React` · `69 automated tests`

</div>

---

**Live Demo:** https://nestiq-india.web.app

You describe your ideal neighborhood in one sentence. NestIQ turns it into a transparently ranked, explainable shortlist in seconds — every flag sourced, every rent estimated, every commute calculated, and every air quality forecast generated via BigQuery ML.

It's not a basic search filter. It's a **parallel multi-agent system** that converts natural language into weighted priorities, pulls live data from Google Maps APIs, and streams the specialist agent scoring process live over SSE.

![NestIQ App Preview](https://i.imgur.com/example-nestiq-preview.png)

```text
                User describes ideal home → Planner Agent (Extracts weights & constraints)
                                                     ↓
                            Data Collector Agent (Pulls live Google APIs)
                                                     ↓
         ┌──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
         │                      │                      │                      │                      │
   Air Quality Agent      Commute Agent         Safety Agent         Lifestyle Agent      Affordability Agent
   • Live CPCB AQI        • Distance Matrix      • Crime baselines    • Google Places      • Curated market rent
   • 24h history          • Live traffic         • Anomaly flags      • 1.5km radius       • Budget matching
   • BQML forecast        • To city work hub                          • Amenities count    • Min-Max normalized
         │                      │                      │                      │                      │
         └──────────────────────┴───────────┬──────────┴──────────────────────┴──────────────────────┘
                                            ↓
                                    Orchestrator Agent
                                 (Applies Gemini-extracted weights)
                                            ↓
                                    Final FitScore → SSE complete event
```

Everything runs in a highly optimized architecture: React/Vite frontend and a FastAPI Python backend utilizing BigQuery and Vertex AI.

---

## 🌟 What makes it different (Zero Hallucination)

| Feature | What's behind it |
|---|---|
| **Zero Hallucination. Everything Sourced.** | Judges can trust the output. FitScores are derived strictly from live Google Maps and AQI APIs. Natural language questions are converted to BigQuery SQL, and the exact SQL query is shown to the user alongside the cited answer. |
| **Conversational analytics (NL→SQL)** | Ask NestIQ a cross-locality question (e.g., "Where is rent under 25k and AQI under 150?") and Gemini writes a real **BigQuery SQL** query, runs it against our locality warehouse, and answers grounded in the rows — *with the generated SQL shown to you*. |
| **Self-building dataset + BQML forecast** | Every search snapshots live locality features into **BigQuery** (`india_localities`) and appends hourly AQI readings (`india_aqi_history`). A **BigQuery ML ARIMA_PLUS** model trained on that history produces our own AQI forecast alongside Google's. |
| **Agent fan-out you can watch** | A Planner parses your request, a Data Collector pulls live Google signals, and five specialist pillar agents score localities in parallel — streamed to the UI over **SSE** so you see the system think. |
| **Air Quality as a first-class pillar** | Live **CPCB AQI** per locality via the Google Air Quality API — current, 24h history, and 24h forecast — weighted into every recommendation. Built for the reality of Indian cities. |
| **Explainable FitScore** | A personalized 0–100 match across five pillars. Weights come from *your own words*, parsed by Gemini — and you can re-tune them live. Fully transparent breakdown, never a black box. |
| **10 cities, Tier-1 to Tier-3** | Delhi NCR, Mumbai, Bengaluru, Kolkata, Hyderabad, Chennai, Pune, **Patna**, **Ranchi** — decision intelligence isn't just for metros. |

---

## 📂 Project Structure

```text
NestIQ/
├── src/                        ← React frontend (Vite)
│   ├── pages/                  ← Home, Results, NeighborhoodDetail, AskNestIQ
│   ├── components/             ← AgentDashboard (SSE streaming), FitScore gauges
│   └── lib/                    ← API client, SSE parsers
├── backend/
│   ├── app/
│   │   ├── main.py             ← FastAPI endpoints (SSE stream, detail, ask)
│   │   ├── gemini.py           ← NL→weights, NL→SQL, explanations, grounded RAG
│   │   ├── maps.py             ← Air Quality / Places / Distance Matrix
│   │   ├── bq_india.py         ← BigQuery snapshots, BQML forecast, SQL guards
│   │   ├── india.py            ← 9 cities · 50+ localities
│   │   └── fitscore.py         ← Normalization + weighted scoring engine
│   ├── tests/                  ← 69 automated tests (backend)
│   └── seed_bq_india.py        ← Seed BigQuery tables from live data
└── README.md
```

---

## 🛠 Setup & Local Development

### 1. Configure environment
```bash
cd backend
cp .env.example .env
# Fill in your GCP_PROJECT, GEMINI_MODEL, MAPS_API_KEY
```

> **Note:** Requires `generativelanguage.googleapis.com`, `bigquery.googleapis.com`, and Maps Platform (Air Quality, Places, Distance Matrix). 

### 2. Run Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # (or .venv\Scripts\activate on Windows)
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8080 --reload
```

### 3. Run Frontend (React/Vite)
```bash
npm install
npm run dev
# Opens on http://localhost:5173
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/search` | NL query → Gemini weights → live-data FitScore ranking |
| `GET` | `/api/search/stream` | Multi-agent orchestration (SSE stream of agent progress) |
| `GET` | `/api/neighborhood/{id}` | Full locality detail: sub-scores, Gemini "why", AQI history + **BQML forecast** |
| `GET` | `/api/neighborhood/{id}/reviews` | Community reviews (Gemini + Google Search grounding) |
| `POST` | `/api/ask` | Ask NestIQ: **NL→SQL on BigQuery** (SQL + rows returned) |
| `GET` | `/api/cities` | Supported cities |

---

## 🛡️ Resilience & Graceful Degradation
Production-class safety nets so the platform stays up:

- **SQL Guards against Injection:** `DROP`, `DELETE`, stacked statements, and `EXPORT DATA` are rejected *before* any BigQuery client is constructed. 
- **Stale-While-Revalidate Caching:** Locality base metrics are cached for 30 mins; Gemini explanations and community web reviews are cached for 24h. Ensures instant responses and saves LLM costs.
- **Graceful Data Fallbacks:** If the live Air Quality API is cold or rate-limited, the system seamlessly falls back to historical BigQuery snapshots or labeled samples.
- **Parallel Fan-out:** The 5 pillar agents run in parallel, drastically reducing time-to-insight to under 3 seconds per search.
- **Test Coverage:** 69 backend tests run offline via mocked dependencies, verifying everything from the normalization bounds to the SSE streaming payload.

---

## 🚀 Hackathon Demo Flow (Try this!)

1. **The Persona:** You are Rahul, relocating to Delhi with 3 days to pick an apartment. 
2. **The Search:** Open NestIQ. Type *"Clean air, safe area under ₹25,000, short commute"*.
3. **The Agents:** Watch the Planner, Data Collector, and 5 specialist agents light up the dashboard via live SSE streaming.
4. **The Results:** Click on the top-ranked neighborhood. 
5. **The Proof (Zero Hallucination):** Hover over the FitScore to see the transparent rubric. Check the Air Quality tab to see the live Google AQI line *and* our custom **BigQuery ML ARIMA_PLUS** forecast line.
6. **Ask NestIQ:** Go to the "Ask" tab. Type *"Which locality has the cheapest rent but AQI under 150?"* Watch Gemini write the raw SQL query, execute it against BigQuery, and return a perfectly grounded answer.

---
<div align="center">
Built for better living and smarter communities · Powered by Google Cloud & Gemini
</div>
