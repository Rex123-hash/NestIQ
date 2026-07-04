# NestIQ — Design Specification

**Tagline:** *A Where-Should-I-Live Decision Intelligence Platform.*
**Hackathon:** Gen AI Academy APAC Edition (Cohort 2) — Grand Hackathon
**Problem Statement:** PS1 — "AI for Better Living and Smarter Communities" / *AI-Powered Decision Intelligence Platform*
**Date:** 2026-07-01
**Status:** LOCKED (design approved)

---

## 1. One-line summary

NestIQ takes a person's relocation needs in plain English and returns a ranked shortlist of
neighborhoods — each with a transparent **FitScore**, a **rent-trend forecast**, a **safety
briefing**, and **cited community insight** — turning hours of tab-juggling into a one-minute,
data-grounded decision.

---

## 2. The user & the felt problem

**Persona:** *Aisha*, moving to a new city (NYC for the prototype) for a job. She has 3 weeks,
a budget, and a dozen browser tabs open — rent on one site, crime maps on another, commute times
on Google Maps, "is this area actually nice?" threads on Reddit. She is making one of the
highest-stakes decisions of her year on gut feel and scattered data.

**Why this is a strong problem (the "who wakes up needing this?" test):**
- Happens to nearly everyone (renters/movers), repeatedly across life.
- High stakes: money (rent) + safety + daily quality of life.
- Current process is manual, fragmented, and stressful.
- Genuinely improvable by AI: fuse many data sources, reason over preferences, forecast, explain.
- It is a **decision**, not a dashboard — there is one user making one concrete choice: *where do I live?*

**On decision frequency (honest note):** Relocation is high-stakes but episodic. (So was the
Cohort-1 winner's travel planning — high value *per use* can beat low-stakes daily tools.) We
strengthen recurring engagement two ways, at near-zero extra build:
- **"Renew or move?" framing** — the *same* FitScore engine scores a user's *current* neighborhood
  and compares it to alternatives. Every renter faces this at lease renewal (annual, and a genuinely
  stressful "my rent just jumped" moment) — a more frequent, equally relatable decision on the same core.
- **Ongoing neighborhood alerts** (enhancement layer) — after choosing, NestIQ watches the user's
  area and pings them when rent trend or safety shifts, or an up-and-coming area emerges — turning a
  one-shot tool into a companion with repeat engagement. Reuses the forecast/anomaly infra already in scope.

**Why not just use Niche / AreaVibes?** Those are static, one-size-fits-all rating sites. NestIQ is
**personalized** (your priorities reweight the score via natural language), **predictive** (rent
forecast + up-and-coming detection, not just today's snapshot), **conversational** (ask follow-ups,
refine live), and **explainable** (every score shows its "why," grounded in live civic data).

**Measurable outcome (the "so what"):** collapses a ~15–20-hour, 12-tab manual search into a
~60-second, data-grounded, personalized decision.

---

## 3. Signature feature — the FitScore

A personalized **0–100** neighborhood match score with a **transparent, weighted breakdown** so
users trust and understand it (this is our memorable "index," the thing judges remember).

**FitScore = weighted sum of five normalized sub-scores:**

| Sub-score | What it measures | Data source |
|---|---|---|
| **Affordability** | Median rent vs. user budget | Zillow Research ZORI |
| **Safety** | Inverse of crime + collision density | NYPD complaints / MV collisions |
| **Commute** | Travel time to the user's anchor (workplace) | Google Maps Distance Matrix + transit |
| **Lifestyle/Vibe** | Amenity fit + community sentiment | Google Places + Reddit/reviews (RAG) |
| **Trend** | Rent trajectory (rising cost risk / up-and-coming upside) | BigQuery ML forecast on ZORI |

**Weights are personalized** from the user's stated priorities via natural language
("I care most about safety and a short commute" → safety and commute weights increase).
Every FitScore is shown with its breakdown and a plain-language **"why."**

---

## 4. Core features

### MVP (essential — must ship)
1. **Natural-language needs input** → parsed into structured criteria + weights (Gemini).
2. **Multi-source neighborhood dataset** joined in BigQuery (rent, safety, 311, transit, amenities).
3. **FitScore engine** → ranks neighborhoods for the user.
4. **Rent-trend forecast** per neighborhood (BigQuery ML `ARIMA_PLUS`).
5. **Map + ranked result cards** with FitScore breakdown.
6. **Explainable "why"** for each recommendation (Gemini over the score components).
7. **Deployed** on Cloud Run (public URL).

### Enhancement layer (optional — build if time allows, in this order)
8. **Multi-agent orchestration** (ADK): Affordability · Safety · Commute · Vibe(RAG) agents + orchestrator.
9. **Live agent dashboard** (streaming progress) — high demo impact.
10. **Community-vibe RAG** with citations (Reddit / Places reviews).
11. **Anomaly flags:** over/under-priced areas vs. predicted; "up-and-coming" detection.
12. **Refine loop** ("bump budget to $2,200") + **Ask NestIQ** grounded follow-up Q&A.
13. **"Renew or move?" mode** — score the user's current neighborhood vs. alternatives (same engine).
14. **Ongoing neighborhood alerts** — watch a chosen area; notify on rent/safety shifts (reuses forecast).
15. Firestore saved searches; multi-city.

---

## 5. Data sources (with legitimacy / friction notes)

| Source | Grain | Access | Friction |
|---|---|---|---|
| **Zillow Research (ZORI)** — observed rent index | ZIP / neighborhood, monthly | Public CSV download (legit, aggregate — no scraping) | Low (one download) |
| **NYC 311 service requests** | Complaint-level | `bigquery-public-data.new_york_311` | None (already in BQ) |
| **NYC MV collisions** | Incident-level | `bigquery-public-data.new_york_mv_collisions` | None (already in BQ) |
| **NYPD complaint (crime) data** *(optional, richer safety)* | Incident-level | NYC Open Data (Socrata API/CSV) → BigQuery | Medium (one ingest) |
| **MTA subway stations / GTFS** | Station-level | Public GTFS | Low |
| **Google Places** — amenities & reviews | POI-level | Places API | API (free credit) |
| **Reddit** — neighborhood sentiment *(optional RAG)* | Thread-level | Public search / API | Medium |

> Deliberately **no live rental listings** (scraping/ToS risk). NestIQ is a *decision* tool for
> *where* to live, at neighborhood grain — cleaner, legally safe, and a better fit for the brief.

---

## 6. Architecture

```
                         ┌─────────────────────────────────────────────┐
  User (NL needs)  ─────► │  Frontend (React + Vite + Tailwind + Map)   │
                         │  NL input · agent dashboard · FitScore cards │
                         └───────────────────────┬─────────────────────┘
                                                 │ REST / SSE
                         ┌───────────────────────▼─────────────────────┐
                         │        Backend (FastAPI on Cloud Run)        │
                         │  ┌────────────────────────────────────────┐  │
                         │  │  Orchestrator (ADK)                     │  │
                         │  │   ├── Affordability agent               │  │
                         │  │   ├── Safety agent                      │  │
                         │  │   ├── Commute agent (Maps Distance Mtx) │  │
                         │  │   └── Vibe agent (RAG, cited)           │  │
                         │  └────────────────────────────────────────┘  │
                         │  FitScore engine · explanation (Gemini)      │
                         └───────┬───────────────────────┬──────────────┘
                                 │                       │
                 ┌───────────────▼──────┐     ┌──────────▼───────────┐
                 │  BigQuery + BQML     │     │  Vertex AI (Gemini)  │
                 │  joined neighborhood │     │  NL→criteria, reason,│
                 │  features + rent     │     │  explain, RAG synth  │
                 │  forecast (ARIMA+)   │     └──────────────────────┘
                 └──────────────────────┘
```

**Data pipeline (ingest → clean → analyze/model → serve):**
1. **Ingest:** Zillow CSV + NYC open data → BigQuery (collisions/311 already there).
2. **Clean/normalize:** map everything to a common neighborhood grain (ZIP or NTA), dedup, time-window.
3. **Precompute features:** safety density, amenity counts, base affordability per neighborhood (BigQuery SQL).
4. **Model:** BigQuery ML `ARIMA_PLUS` rent forecast per neighborhood; anomaly = actual vs predicted.
5. **Serve (per query):** parse NL → weights → score → agents enrich (commute, vibe) → rank → explain → return.

---

## 7. Tech stack & cost

| Layer | Choice | Cost tag | GCP trial? |
|---|---|---|---|
| Warehouse + ML | BigQuery + BigQuery ML | 🟡 Free tier (1TB/mo query) | ✅ |
| LLM / reasoning | Gemini via Vertex AI | 💳 pennies per run | ✅ |
| Agents | Agent Development Kit (ADK) | ✅ Free framework | ✅ (runs on Cloud Run) |
| Maps / commute / amenities | Google Maps Platform | 🟡 $200/mo free credit | ✅ |
| Backend | FastAPI on Cloud Run | 🟡 Generous free tier | ✅ |
| Frontend | React + Vite + Tailwind + map lib | ✅ Free | n/a |
| Sessions (optional) | Firestore | 🟡 Free tier | ✅ |
| Analytics view (optional) | Looker Studio | ✅ Always free | n/a |

**No GPU. No NVIDIA/RAPIDS** (not required by PS1). **Estimated total credit burn: a few dollars.**
**Fallback if frontend time runs short:** Streamlit (fully free, fast to build).

---

## 8. PS1 requirement → feature mapping (the "100% alignment")

| PS1 core requirement | NestIQ feature |
|---|---|
| Ingest & analyze data from **multiple sources** | Rent + crime/collisions + 311 + transit + amenities + reviews |
| **Structured + unstructured** data | Numeric datasets + review/Reddit text via RAG |
| **Natural-language** interaction with data | NL needs → criteria; "Ask NestIQ" grounded Q&A |
| Generate insights / **forecasts** / alerts | Ranked recs + rent-trend forecast + rising-area alerts |
| Identify patterns, trends, **anomalies** | Up-and-coming detection; over/under-priced flags |
| **Support decision-making** via AI assistance | Multi-agent ranking + explainable "why" |
| Deploy a **scalable GCP** application | BigQuery + Vertex/Gemini + ADK + Cloud Run + Maps |

**Goal fit** ("better living, more efficient, sustainable communities"): improves a major life
decision + surfaces housing affordability. **Use cases hit:** Community Intelligence & Engagement;
Education & Economic Development.

**Rubric (5 × 20%):** Solution quality (working end-to-end) · Architecture (multi-source BQ +
agents + BQML) · Impact (universal, high-stakes, affordability) · Technical choices (managed GCP,
legit data, feasible) · Demo/UX (map + NL + live agents + FitScore).

---

## 9. Demo storyboard (4 beats)

1. **User + need (with stakes)** — *"I start at Google in 10 days. Budget $2,000. I don't know this
   city, and as a woman living alone, safety comes first."* Aisha types exactly this — real deadline,
   real stress, real stakes. NestIQ parses it into criteria + weights. (Emotion first, tech second.)
2. **Live agents** — dashboard shows Affordability/Safety/Commute/Vibe agents working, citations streaming.
3. **Result** — map with ranked-neighborhood heat + top-3 FitScore cards (with breakdown) + rent-forecast chart + cited community insight.
4. **Decision** — "Ask NestIQ" follow-up ("why is Astoria safer than X?") grounded answer; refine ("budget → $2,200") re-ranks live.

---

## 10. Development roadmap (~5 days)

| Day | Goal |
|---|---|
| **1** | Lock scope. Ingest Zillow + NYC data to BigQuery; join to neighborhood grain; base feature table. |
| **2** | FitScore engine + NL→criteria parsing (Gemini); baseline ranking end-to-end (even unstyled). |
| **3** | BQML rent forecast + anomaly flags; commute via Maps; ADK agent structure. |
| **4** | Vibe RAG (cited) + explanations; frontend map + FitScore cards. |
| **5** | Live agent dashboard + Ask/refine + polish; deploy to Cloud Run; record demo video; build deck. **Freeze 24h before deadline.** |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Data-ingestion eats time | Core on datasets already in BigQuery (collisions, 311); Zillow is one small CSV. |
| Gemini hallucination on stage | Constrain NL parsing to a structured schema; RAG answers cited; rehearse fixed demo queries; recorded fallback video. |
| Maps API cost | Stay within $200/mo free credit; cache distance-matrix results. |
| Scope creep | Build the structured scoring path first; agents/RAG/live-dashboard are enhancement layers, each independently demoable. |
| "Looks like PropTech, not civic" | Lead with the affordability + relocation-stress + community angle. |
| Frontend polish time | Streamlit fallback if the React build lags. |
| Frontend/backend integration late | Deploy a thin end-to-end slice by Day 2; layer features onto a working deployment. |

---

## 12. Essential vs optional (scope discipline)

**Essential (cut everything else before cutting these):** data pipeline in BigQuery · FitScore ·
NL query · ranking · map + cards · one working forecast · explainability · deployed public URL.

**Optional (in priority order):** multi-agent + live dashboard · vibe RAG with citations ·
anomaly flags · refine + Ask loop · saved searches · multi-city.
