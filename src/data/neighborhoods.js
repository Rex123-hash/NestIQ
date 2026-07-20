// Frontend single source of truth for the FitScore pillars and their
// default weights. Mirrors backend/app/india.py INDIA_DEFAULT_WEIGHTS.
// Locality metrics arrive from the API with per-pillar evidence metadata.

export const SUBSCORES = [
  { key: 'affordability', label: 'Affordability', color: 'aff' },
  { key: 'safety', label: 'Safety', color: 'safe' },
  { key: 'commute', label: 'Commute', color: 'commute' },
  { key: 'lifestyle', label: 'Essentials & Lifestyle', color: 'life' },
  { key: 'air_quality', label: 'Air Quality', color: 'trend' },
]

export const WEIGHTS = {
  affordability: 20,
  safety: 20,
  commute: 20,
  lifestyle: 15,
  air_quality: 25,
}

// The published FitScore rubric: for each pillar, its default weight, why it
// carries that weight, and the evidence signal it is derived from. Rendered in the
// "How it works" methodology panel so the score is explainable, not a black box.
export const RUBRIC = [
  {
    key: 'air_quality',
    label: 'Air Quality',
    why: 'Weighted highest: across Indian cities AQI is the most health-critical signal and the one that varies most between localities, so it separates them the most.',
    source: 'Google Air Quality API (live CPCB AQI)',
  },
  {
    key: 'affordability',
    label: 'Affordability',
    why: 'Rent is the largest recurring cost and the hardest constraint when relocating, so it anchors the score.',
    source: 'Market rent estimate (labelled; no open locality-level dataset exists for India)',
  },
  {
    key: 'safety',
    label: 'Safety',
    why: 'A baseline most people will not trade away, weighted on par with cost and commute.',
    source: 'NestIQ curated locality safety proxy (does not include air quality)',
  },
  {
    key: 'commute',
    label: 'Commute',
    why: 'A daily time cost that compounds and strongly drives real-world satisfaction.',
    source: 'Google Distance Matrix (live driving time to the city hub)',
  },
  {
    key: 'lifestyle',
    label: 'Essentials & Lifestyle',
    why: 'Amenity density is a comfort rather than a dealbreaker, so it is weighted slightly lower.',
    source: 'Google Places (live count of amenities within 1.5 km)',
  },
]

// How the pillars combine into one number. Kept next to the rubric so the
// methodology copy never drifts from the actual scoring code in maps.py.
export const METHOD_NOTE =
  'Air quality uses absolute CPCB health bands. Affordability, safety, commute and lifestyle are normalized across available localities, then combined using your weights. Missing or partial signals are excluded and the score is labelled provisional with its coverage percentage.'

// The live data sources behind every India locality. One definition, imported
// wherever the "Sources" chips render, so they can never drift out of sync.
export const SOURCE_CHIPS = ['Google Air Quality', 'Google Places', 'Google Maps', 'Gemini']

// Neutral fallback shown only until live preferences arrive from the API.
export const preferences = {
  statement: 'Top neighborhood matches for you',
  budget: 30000,
  bed: '1 bed preferred',
  priorities: 'Air Quality (medium), Affordability (medium), Safety (medium), Commute (medium), Essentials & Lifestyle (medium)',
}
