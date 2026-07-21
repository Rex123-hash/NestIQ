"""Indian cities + localities for NestIQ.

Each locality has a curated centroid. Air quality, amenities and commute are
fetched LIVE from Google Maps Platform; rent + a base safety index are
market estimates (no open locality-level dataset exists for India) and are
labelled as estimates in the UI.
"""

from .market_data import rent_baseline

# Single source of truth for the India FitScore pillar weights.
# gemini.py (query parsing) and maps.py (scoring) both import from here so the
# backend can never disagree with itself.
INDIA_DEFAULT_WEIGHTS = {"affordability": 20, "safety": 20, "commute": 20, "lifestyle": 15, "air_quality": 25}

CITIES = {
    "delhi-ncr": {
        "id": "delhi-ncr",
        "name": "Delhi NCR",
        "anchor": {"name": "Connaught Place", "lat": 28.6315, "lng": 77.2167},
        "localities": [
            {"id": "noida-62", "name": "Sector 62, Noida", "short": "Sector 62", "lat": 28.6280, "lng": 77.3649, "rent": 19000, "safety": 74, "accent": "#7C5CF6"},
            {"id": "noida-18", "name": "Sector 18, Noida", "short": "Sector 18", "lat": 28.5708, "lng": 77.3260, "rent": 24000, "safety": 70, "accent": "#4F86F7"},
            {"id": "indirapuram", "name": "Indirapuram, Ghaziabad", "short": "Indirapuram", "lat": 28.6440, "lng": 77.3717, "rent": 17000, "safety": 68, "accent": "#3FB984"},
            {"id": "cyber-city", "name": "Cyber City, Gurgaon", "short": "Cyber City", "lat": 28.4945, "lng": 77.0880, "rent": 38000, "safety": 78, "accent": "#F5A63B"},
            {"id": "sector-29-ggn", "name": "Sector 29, Gurgaon", "short": "Sector 29", "lat": 28.4595, "lng": 77.0640, "rent": 32000, "safety": 72, "accent": "#9478F1"},
            {"id": "dwarka", "name": "Dwarka, Delhi", "short": "Dwarka", "lat": 28.5921, "lng": 77.0460, "rent": 26000, "safety": 71, "accent": "#EC6FA6"},
            {"id": "saket", "name": "Saket, Delhi", "short": "Saket", "lat": 28.5245, "lng": 77.2066, "rent": 34000, "safety": 76, "accent": "#2FB6A8"},
            {"id": "rajouri-garden", "name": "Rajouri Garden, Delhi", "short": "Rajouri Garden", "lat": 28.6469, "lng": 77.1200, "rent": 28000, "safety": 69, "accent": "#F2775A"},
        ],
    },
    "mumbai": {
        "id": "mumbai",
        "name": "Mumbai",
        "anchor": {"name": "Bandra Kurla Complex", "lat": 19.0670, "lng": 72.8700},
        "localities": [
            {"id": "bandra", "name": "Bandra West", "short": "Bandra", "lat": 19.0596, "lng": 72.8295, "rent": 75000, "safety": 80, "accent": "#7C5CF6"},
            {"id": "andheri", "name": "Andheri West", "short": "Andheri", "lat": 19.1136, "lng": 72.8697, "rent": 55000, "safety": 75, "accent": "#4F86F7"},
            {"id": "powai", "name": "Powai", "short": "Powai", "lat": 19.1176, "lng": 72.9060, "rent": 60000, "safety": 82, "accent": "#3FB984"},
            {"id": "thane", "name": "Thane West", "short": "Thane", "lat": 19.2183, "lng": 72.9781, "rent": 32000, "safety": 74, "accent": "#F5A63B"},
            {"id": "lower-parel", "name": "Lower Parel", "short": "Lower Parel", "lat": 18.9980, "lng": 72.8300, "rent": 85000, "safety": 79, "accent": "#9478F1"},
            {"id": "vashi", "name": "Vashi, Navi Mumbai", "short": "Vashi", "lat": 19.0770, "lng": 72.9986, "rent": 34000, "safety": 77, "accent": "#EC6FA6"},
            {"id": "borivali", "name": "Borivali West", "short": "Borivali", "lat": 19.2307, "lng": 72.8567, "rent": 40000, "safety": 76, "accent": "#2FB6A8"},
        ],
    },
    "bangalore": {
        "id": "bangalore",
        "name": "Bengaluru",
        "anchor": {"name": "MG Road", "lat": 12.9756, "lng": 77.6068},
        "localities": [
            {"id": "koramangala", "name": "Koramangala", "short": "Koramangala", "lat": 12.9352, "lng": 77.6245, "rent": 32000, "safety": 80, "accent": "#7C5CF6"},
            {"id": "indiranagar", "name": "Indiranagar", "short": "Indiranagar", "lat": 12.9719, "lng": 77.6412, "rent": 35000, "safety": 81, "accent": "#4F86F7"},
            {"id": "whitefield", "name": "Whitefield", "short": "Whitefield", "lat": 12.9698, "lng": 77.7500, "rent": 26000, "safety": 78, "accent": "#3FB984"},
            {"id": "hsr-layout", "name": "HSR Layout", "short": "HSR Layout", "lat": 12.9082, "lng": 77.6476, "rent": 28000, "safety": 82, "accent": "#F5A63B"},
            {"id": "electronic-city", "name": "Electronic City", "short": "Electronic City", "lat": 12.8452, "lng": 77.6602, "rent": 18000, "safety": 75, "accent": "#9478F1"},
            {"id": "marathahalli", "name": "Marathahalli", "short": "Marathahalli", "lat": 12.9591, "lng": 77.6974, "rent": 22000, "safety": 74, "accent": "#EC6FA6"},
            {"id": "jayanagar", "name": "Jayanagar", "short": "Jayanagar", "lat": 12.9250, "lng": 77.5938, "rent": 27000, "safety": 83, "accent": "#2FB6A8"},
        ],
    },
    "kolkata": {
        "id": "kolkata", "name": "Kolkata",
        "anchor": {"name": "Park Street", "lat": 22.5535, "lng": 88.3520},
        "localities": [
            {"id": "salt-lake", "name": "Salt Lake (Bidhannagar)", "short": "Salt Lake", "lat": 22.5800, "lng": 88.4200, "rent": 18000, "safety": 74},
            {"id": "new-town-kol", "name": "New Town", "short": "New Town", "lat": 22.5800, "lng": 88.4600, "rent": 20000, "safety": 76},
            {"id": "ballygunge", "name": "Ballygunge", "short": "Ballygunge", "lat": 22.5250, "lng": 88.3650, "rent": 25000, "safety": 78},
            {"id": "behala", "name": "Behala", "short": "Behala", "lat": 22.4980, "lng": 88.3130, "rent": 14000, "safety": 70},
            {"id": "howrah", "name": "Howrah", "short": "Howrah", "lat": 22.5958, "lng": 88.2636, "rent": 13000, "safety": 66},
            {"id": "dumdum", "name": "Dum Dum", "short": "Dum Dum", "lat": 22.6420, "lng": 88.4230, "rent": 15000, "safety": 68},
        ],
    },
    "hyderabad": {
        "id": "hyderabad", "name": "Hyderabad",
        "anchor": {"name": "HITEC City", "lat": 17.4470, "lng": 78.3760},
        "localities": [
            {"id": "gachibowli", "name": "Gachibowli", "short": "Gachibowli", "lat": 17.4400, "lng": 78.3480, "rent": 24000, "safety": 80},
            {"id": "madhapur", "name": "Madhapur", "short": "Madhapur", "lat": 17.4480, "lng": 78.3910, "rent": 26000, "safety": 80},
            {"id": "banjara-hills", "name": "Banjara Hills", "short": "Banjara Hills", "lat": 17.4130, "lng": 78.4380, "rent": 30000, "safety": 82},
            {"id": "kondapur", "name": "Kondapur", "short": "Kondapur", "lat": 17.4640, "lng": 78.3640, "rent": 22000, "safety": 79},
            {"id": "kukatpally", "name": "Kukatpally", "short": "Kukatpally", "lat": 17.4940, "lng": 78.3990, "rent": 18000, "safety": 76},
        ],
    },
    "chennai": {
        "id": "chennai", "name": "Chennai",
        "anchor": {"name": "T. Nagar", "lat": 13.0410, "lng": 80.2330},
        "localities": [
            {"id": "adyar", "name": "Adyar", "short": "Adyar", "lat": 13.0060, "lng": 80.2570, "rent": 22000, "safety": 80},
            {"id": "velachery", "name": "Velachery", "short": "Velachery", "lat": 12.9790, "lng": 80.2180, "rent": 18000, "safety": 78},
            {"id": "anna-nagar", "name": "Anna Nagar", "short": "Anna Nagar", "lat": 13.0850, "lng": 80.2100, "rent": 24000, "safety": 81},
            {"id": "omr", "name": "OMR (Thoraipakkam)", "short": "OMR", "lat": 12.9410, "lng": 80.2340, "rent": 20000, "safety": 77},
            {"id": "mylapore", "name": "Mylapore", "short": "Mylapore", "lat": 13.0330, "lng": 80.2680, "rent": 26000, "safety": 82},
        ],
    },
    "pune": {
        "id": "pune", "name": "Pune",
        "anchor": {"name": "Shivajinagar", "lat": 18.5300, "lng": 73.8500},
        "localities": [
            {"id": "hinjewadi", "name": "Hinjewadi", "short": "Hinjewadi", "lat": 18.5910, "lng": 73.7380, "rent": 20000, "safety": 78},
            {"id": "kothrud", "name": "Kothrud", "short": "Kothrud", "lat": 18.5070, "lng": 73.8070, "rent": 22000, "safety": 80},
            {"id": "viman-nagar", "name": "Viman Nagar", "short": "Viman Nagar", "lat": 18.5670, "lng": 73.9140, "rent": 24000, "safety": 79},
            {"id": "baner", "name": "Baner", "short": "Baner", "lat": 18.5590, "lng": 73.7770, "rent": 26000, "safety": 80},
            {"id": "hadapsar", "name": "Hadapsar", "short": "Hadapsar", "lat": 18.5010, "lng": 73.9260, "rent": 17000, "safety": 75},
        ],
    },
    "patna": {
        "id": "patna", "name": "Patna (Bihar)",
        "anchor": {"name": "Gandhi Maidan", "lat": 25.6120, "lng": 85.1440},
        "localities": [
            {"id": "boring-road", "name": "Boring Road", "short": "Boring Road", "lat": 25.6180, "lng": 85.1180, "rent": 15000, "safety": 68},
            {"id": "kankarbagh", "name": "Kankarbagh", "short": "Kankarbagh", "lat": 25.5940, "lng": 85.1550, "rent": 12000, "safety": 66},
            {"id": "patliputra", "name": "Patliputra Colony", "short": "Patliputra", "lat": 25.6280, "lng": 85.1080, "rent": 16000, "safety": 70},
            {"id": "rajendra-nagar", "name": "Rajendra Nagar", "short": "Rajendra Nagar", "lat": 25.6050, "lng": 85.1620, "rent": 13000, "safety": 67},
            {"id": "bailey-road", "name": "Bailey Road", "short": "Bailey Road", "lat": 25.6100, "lng": 85.1000, "rent": 17000, "safety": 71},
        ],
    },
    "ranchi": {
        "id": "ranchi", "name": "Ranchi (Jharkhand)",
        "anchor": {"name": "Albert Ekka Chowk", "lat": 23.3600, "lng": 85.3300},
        "localities": [
            {"id": "lalpur", "name": "Lalpur", "short": "Lalpur", "lat": 23.3820, "lng": 85.3350, "rent": 12000, "safety": 70},
            {"id": "harmu", "name": "Harmu", "short": "Harmu", "lat": 23.3560, "lng": 85.2960, "rent": 11000, "safety": 69},
            {"id": "kanke-road", "name": "Kanke Road", "short": "Kanke Road", "lat": 23.4100, "lng": 85.3130, "rent": 13000, "safety": 72},
            {"id": "doranda", "name": "Doranda", "short": "Doranda", "lat": 23.3350, "lng": 85.3200, "rent": 10000, "safety": 68},
            {"id": "ashok-nagar-ran", "name": "Ashok Nagar", "short": "Ashok Nagar", "lat": 23.3690, "lng": 85.3110, "rent": 12500, "safety": 71},
        ],
    },
    # --- Phase 11 onboarded metros -----------------------------------------
    # Centroids verified against live Google signals. Source-backed rent is
    # merged below; safety uses a live emergency-access resilience proxy.
    # Neither is represented as locality-level crime data.
    "ahmedabad": {
        "id": "ahmedabad", "name": "Ahmedabad (Gujarat)",
        "anchor": {"name": "Ashram Road", "lat": 23.0395, "lng": 72.5660},
        "localities": [
            {"id": "satellite-amd", "name": "Satellite, Ahmedabad", "short": "Satellite", "lat": 23.0276, "lng": 72.5075},
            {"id": "bodakdev", "name": "Bodakdev, Ahmedabad", "short": "Bodakdev", "lat": 23.0395, "lng": 72.5066},
            {"id": "vastrapur", "name": "Vastrapur, Ahmedabad", "short": "Vastrapur", "lat": 23.0369, "lng": 72.5290},
            {"id": "prahlad-nagar", "name": "Prahlad Nagar, Ahmedabad", "short": "Prahlad Nagar", "lat": 23.0122, "lng": 72.5108},
            {"id": "maninagar", "name": "Maninagar, Ahmedabad", "short": "Maninagar", "lat": 22.9967, "lng": 72.6047},
        ],
    },
    "jaipur": {
        "id": "jaipur", "name": "Jaipur (Rajasthan)",
        "anchor": {"name": "MI Road", "lat": 26.9124, "lng": 75.8100},
        "localities": [
            {"id": "malviya-nagar-jpr", "name": "Malviya Nagar, Jaipur", "short": "Malviya Nagar", "lat": 26.8505, "lng": 75.8060},
            {"id": "vaishali-nagar", "name": "Vaishali Nagar, Jaipur", "short": "Vaishali Nagar", "lat": 26.9124, "lng": 75.7373},
            {"id": "c-scheme", "name": "C-Scheme, Jaipur", "short": "C-Scheme", "lat": 26.9088, "lng": 75.7963},
            {"id": "mansarovar", "name": "Mansarovar, Jaipur", "short": "Mansarovar", "lat": 26.8505, "lng": 75.7628},
            {"id": "jagatpura", "name": "Jagatpura, Jaipur", "short": "Jagatpura", "lat": 26.8300, "lng": 75.8500},
        ],
    },
    "lucknow": {
        "id": "lucknow", "name": "Lucknow (Uttar Pradesh)",
        "anchor": {"name": "Hazratganj", "lat": 26.8500, "lng": 80.9450},
        "localities": [
            {"id": "gomti-nagar", "name": "Gomti Nagar, Lucknow", "short": "Gomti Nagar", "lat": 26.8560, "lng": 81.0000},
            {"id": "hazratganj", "name": "Hazratganj, Lucknow", "short": "Hazratganj", "lat": 26.8500, "lng": 80.9450},
            {"id": "indira-nagar-lko", "name": "Indira Nagar, Lucknow", "short": "Indira Nagar", "lat": 26.8760, "lng": 80.9950},
            {"id": "aliganj", "name": "Aliganj, Lucknow", "short": "Aliganj", "lat": 26.8900, "lng": 80.9400},
            {"id": "alambagh", "name": "Alambagh, Lucknow", "short": "Alambagh", "lat": 26.8100, "lng": 80.9100},
        ],
    },
    "kochi": {
        "id": "kochi", "name": "Kochi (Kerala)",
        "anchor": {"name": "Marine Drive, Kochi", "lat": 9.9780, "lng": 76.2760},
        "localities": [
            {"id": "kakkanad", "name": "Kakkanad, Kochi", "short": "Kakkanad", "lat": 10.0150, "lng": 76.3420},
            {"id": "edappally", "name": "Edappally, Kochi", "short": "Edappally", "lat": 10.0250, "lng": 76.3080},
            {"id": "palarivattom", "name": "Palarivattom, Kochi", "short": "Palarivattom", "lat": 10.0060, "lng": 76.3050},
            {"id": "vyttila", "name": "Vyttila, Kochi", "short": "Vyttila", "lat": 9.9670, "lng": 76.3180},
            {"id": "fort-kochi", "name": "Fort Kochi", "short": "Fort Kochi", "lat": 9.9650, "lng": 76.2420},
        ],
    },
}

def _apply_grounded_rent_baselines() -> None:
    """Add reviewable rent evidence without touching established cities."""
    for city in CITIES.values():
        for loc in city["localities"]:
            evidence = rent_baseline(loc["id"])
            if not evidence:
                continue
            loc["rent"] = evidence["medianRent"]
            loc["rentSource"] = evidence["sourceType"]
            loc["rentEvidence"] = evidence


_apply_grounded_rent_baselines()

# Assign a display accent to any locality that doesn't specify one.
_PALETTE = ["#7C5CF6", "#4F86F7", "#3FB984", "#F5A63B", "#9478F1", "#EC6FA6", "#2FB6A8", "#F2775A"]
for _c in CITIES.values():
    for _i, _loc in enumerate(_c["localities"]):
        _loc.setdefault("accent", _PALETTE[_i % len(_PALETTE)])


def city_list() -> list[dict]:
    return [{"id": c["id"], "name": c["name"]} for c in CITIES.values()]


def get_city(city_id: str) -> dict | None:
    return CITIES.get(city_id)
