// Mock data modeled to match the approved NestIQ mockups.
// This is the single source of truth for the UI until the BigQuery/Gemini
// backend is wired in. Numbers intentionally mirror the design screenshots.

export const SUBSCORES = [
  { key: 'affordability', label: 'Affordability', color: 'aff' },
  { key: 'safety', label: 'Safety', color: 'safe' },
  { key: 'commute', label: 'Commute', color: 'commute' },
  { key: 'lifestyle', label: 'Lifestyle', color: 'life' },
  { key: 'air_quality', label: 'Air Quality', color: 'trend' },
]

export const WEIGHTS = {
  affordability: 20,
  safety: 20,
  commute: 20,
  lifestyle: 15,
  air_quality: 25,
}

export const neighborhoods = [
  {
    id: 'astoria',
    name: 'Astoria, Queens',
    short: 'Astoria',
    accent: '#7C5CF6',
    fitScore: 86,
    match: 'Excellent Match',
    tags: ['Vibrant', 'Diverse', 'Great Food', 'Waterfront Nearby'],
    descriptors: 'Vibrant • Diverse • Great Food',
    commuteMin: 24,
    crimeLabel: 'Very Safe',
    rent: 1850,
    amenityTags: ['Great Restaurants', 'Parks', 'Subway Access'],
    extraTags: 2,
    subscores: { affordability: 78, safety: 92, commute: 85, lifestyle: 82, trend: 75 },
    pin: { top: '18%', left: '82%' },
    blurb:
      'I want a safe neighborhood with a short commute to Midtown. Love good food and a vibrant community.',
    why: 'Astoria offers an excellent balance of safety, reasonable rent, and a short commute to Midtown. It has abundant amenities and a lively community vibe.',
  },
  {
    id: 'lic',
    name: 'Long Island City, Queens',
    short: 'Long Island City',
    accent: '#4F86F7',
    fitScore: 82,
    match: 'Excellent Match',
    tags: ['Modern', 'Convenient', 'Growing'],
    descriptors: 'Modern • Convenient • Growing',
    commuteMin: 18,
    crimeLabel: 'Safe',
    rent: 1950,
    amenityTags: ['Waterfront', 'Parks', 'Subway Access'],
    extraTags: 3,
    subscores: { affordability: 72, safety: 85, commute: 95, lifestyle: 78, trend: 80 },
    pin: { top: '40%', left: '70%' },
    blurb: 'Close to Manhattan, good amenities and waterfront access.',
    why: 'Long Island City offers the shortest commute of the shortlist with a fast-growing, modern feel and strong waterfront amenities.',
  },
  {
    id: 'park-slope',
    name: 'Park Slope, Brooklyn',
    short: 'Park Slope',
    accent: '#3FB984',
    fitScore: 78,
    match: 'Good Match',
    tags: ['Family-friendly', 'Charming', 'Green'],
    descriptors: 'Family-friendly • Charming • Green',
    commuteMin: 28,
    crimeLabel: 'Safe',
    rent: 2000,
    amenityTags: ['Tree-lined Streets', 'Parks', 'Great Schools'],
    extraTags: 2,
    subscores: { affordability: 61, safety: 76, commute: 68, lifestyle: 92, trend: 65 },
    pin: { top: '62%', left: '64%' },
    blurb: 'Family-friendly vibe with parks and good schools. Happy to extend commute a bit.',
    why: 'Park Slope leads on lifestyle with tree-lined streets, top schools and green space, at a slightly higher rent and commute.',
  },
  {
    id: 'jersey-city',
    name: 'Jersey City, NJ',
    short: 'Jersey City',
    accent: '#F5A63B',
    fitScore: 74,
    match: 'Good Match',
    tags: ['Affordable', 'Diverse', 'Easy Commute'],
    descriptors: 'Affordable • Diverse • Easy Commute',
    commuteMin: 22,
    crimeLabel: 'Very Safe',
    rent: 1750,
    amenityTags: ['Affordable', 'Parks', 'PATH Access'],
    extraTags: 3,
    subscores: { affordability: 58, safety: 70, commute: 75, lifestyle: 72, trend: 70 },
    pin: { top: '52%', left: '40%' },
    blurb: 'Considering NJ for more affordability and easy PATH access.',
    why: 'Jersey City is the most affordable option with easy PATH access into Manhattan and a diverse, growing community.',
  },
]

export const byId = (id) => neighborhoods.find((n) => n.id === id)

export const preferences = {
  statement: "I'm moving to New York City for a job in Midtown Manhattan.",
  budget: 2000,
  bed: '1 bed preferred',
  priorities: 'Safety (high), Commute (high), Affordability (medium), Lifestyle (medium), Trend (low)',
}

// Rent-trend series used across Overview / Affordability / Trend charts.
export const rentTrend = [
  { m: 'Jul', astoria: 1810, nyc: 2010 },
  { m: 'Aug', astoria: 1835, nyc: 2035 },
  { m: 'Sep', astoria: 1840, nyc: 2040 },
  { m: 'Oct', astoria: 1825, nyc: 2075 },
  { m: 'Nov', astoria: 1830, nyc: 2090 },
  { m: 'Dec', astoria: 1855, nyc: 2060 },
  { m: 'Jan', astoria: 1900, nyc: 2040 },
  { m: 'Feb', astoria: 1930, nyc: 2015 },
  { m: 'Mar', astoria: 1955, nyc: 1990 },
  { m: 'Apr', astoria: 1990, nyc: 1970 },
  { m: 'May', astoria: 2040, nyc: 1955 },
  { m: 'Jun', astoria: 2120, nyc: 1940 },
]
