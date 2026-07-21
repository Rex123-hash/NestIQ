"""Versioned, source-backed rent baselines for newly onboarded cities."""

AS_OF = "2026-07-21"
BASIS = "Indicative monthly asking rent for a one-bedroom home."

RENT_BASELINES = {
    "satellite-amd": (18000, "https://makaan.rent/rent-guide"),
    "bodakdev": (20000, "https://makaan.rent/rent-guide"),
    "vastrapur": (14000, "https://makaan.rent/rent-guide"),
    "prahlad-nagar": (20000, "https://makaan.rent/rent-guide"),
    "maninagar": (9000, "https://makaan.rent/rent-guide"),
    "malviya-nagar-jpr": (22000, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-malviya-nagar-jaipur-pppfr"),
    "vaishali-nagar": (19750, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-vaishali-nagar-jaipur-pppfr"),
    "c-scheme": (23250, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-c-scheme-jaipur-pppfr"),
    "mansarovar": (11750, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-mansarovar-jaipur-pppfr"),
    "jagatpura": (13750, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-jagatpura-jaipur-pppfr"),
    "gomti-nagar": (21850, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-gomti-nagar-lucknow-pppfr"),
    "hazratganj": (26500, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-hazratganj-lucknow-pppfr"),
    "indira-nagar-lko": (12700, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-indira-nagar-lucknow-pppfr"),
    "aliganj": (14000, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-aliganj-lucknow-pppfr"),
    "alambagh": (11000, "https://www.magicbricks.com/1-bhk-flats-for-rent-in-alambagh-lucknow-pppfr"),
    "kakkanad": (13000, "https://housing.com/rent/1bhk-flats-in-kakkanad-kochi-C2P451q7vjrdc4cm951T3uwU7ps"),
    "edappally": (12000, "https://housing.com/rent/1bhk-flats-for-rent-in-edappally-kochi-C2P4mq7lgrlj4n3mfwf"),
    "palarivattom": (14000, "https://housing.com/rent/1bhk-flats-for-rent-in-palarivattom-kochi-C2P2oulw6a15nw7wjg0"),
    "vyttila": (13000, "https://www.squareyards.com/blog/cost-of-living-in-kochi"),
    "fort-kochi": (18500, "https://www.squareyards.com/blog/cost-of-living-in-kochi"),
}


def rent_baseline(locality_id: str) -> dict | None:
    """Return a reviewable evidence record, never a silent fallback."""
    row = RENT_BASELINES.get(locality_id)
    if not row:
        return None
    value, uri = row
    return {
        "medianRent": value,
        "source": "Grounded published rental marketplace evidence",
        "sourceType": "grounded_market_evidence",
        "asOf": AS_OF,
        "basis": BASIS,
        "method": "Published locality trend or rounded midpoint of current marketplace observations.",
        "confidence": "medium",
        "citations": [{"title": "Current locality rental evidence", "uri": uri}],
    }
