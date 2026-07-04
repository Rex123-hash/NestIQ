"""Canonical NYC neighborhood definitions.

Everything in the data pipeline aggregates public data (311, collisions, rent)
to this grain via ZIP codes. Centroids drive the commute-distance proxy.
"""

# Workplace anchor used for the commute sub-score (Midtown Manhattan).
WORKPLACE = {"name": "Midtown Manhattan", "lat": 40.7549, "lng": -73.9840}

NEIGHBORHOODS = [
    {"id": "astoria", "name": "Astoria, Queens", "short": "Astoria", "borough": "QUEENS",
     "zips": ["11102", "11103", "11105", "11106"], "lat": 40.7644, "lng": -73.9235, "pop": 78000, "amenities": 1250, "accent": "#7C5CF6"},
    {"id": "lic", "name": "Long Island City, Queens", "short": "Long Island City", "borough": "QUEENS",
     "zips": ["11101", "11109"], "lat": 40.7447, "lng": -73.9485, "pop": 32000, "amenities": 820, "accent": "#4F86F7"},
    {"id": "park-slope", "name": "Park Slope, Brooklyn", "short": "Park Slope", "borough": "BROOKLYN",
     "zips": ["11215", "11217"], "lat": 40.6710, "lng": -73.9814, "pop": 66000, "amenities": 940, "accent": "#3FB984"},
    {"id": "williamsburg", "name": "Williamsburg, Brooklyn", "short": "Williamsburg", "borough": "BROOKLYN",
     "zips": ["11211", "11249"], "lat": 40.7081, "lng": -73.9571, "pop": 90000, "amenities": 1400, "accent": "#9478F1"},
    {"id": "harlem", "name": "Harlem, Manhattan", "short": "Harlem", "borough": "MANHATTAN",
     "zips": ["10026", "10027", "10030", "10037", "10039"], "lat": 40.8116, "lng": -73.9465, "pop": 143000, "amenities": 1100, "accent": "#EC6FA6"},
    {"id": "upper-west-side", "name": "Upper West Side, Manhattan", "short": "Upper West Side", "borough": "MANHATTAN",
     "zips": ["10023", "10024", "10025"], "lat": 40.7870, "lng": -73.9754, "pop": 210000, "amenities": 1600, "accent": "#2FB6A8"},
    {"id": "east-village", "name": "East Village, Manhattan", "short": "East Village", "borough": "MANHATTAN",
     "zips": ["10009", "10003"], "lat": 40.7265, "lng": -73.9815, "pop": 46000, "amenities": 1500, "accent": "#F2775A"},
    {"id": "flushing", "name": "Flushing, Queens", "short": "Flushing", "borough": "QUEENS",
     "zips": ["11354", "11355"], "lat": 40.7654, "lng": -73.8318, "pop": 72000, "amenities": 900, "accent": "#5B8DEF"},
    {"id": "bushwick", "name": "Bushwick, Brooklyn", "short": "Bushwick", "borough": "BROOKLYN",
     "zips": ["11206", "11221", "11237"], "lat": 40.6944, "lng": -73.9213, "pop": 110000, "amenities": 760, "accent": "#C77DFF"},
]

BY_ID = {n["id"]: n for n in NEIGHBORHOODS}
ALL_ZIPS = sorted({z for n in NEIGHBORHOODS for z in n["zips"]})


def zip_to_neighborhood() -> dict[str, str]:
    return {z: n["id"] for n in NEIGHBORHOODS for z in n["zips"]}
