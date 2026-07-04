"""Integrity of the city/locality catalog every ranking is built on."""
from app.india import CITIES, city_list, get_city

INDIA_LAT = (6.0, 37.5)
INDIA_LNG = (68.0, 98.0)


def all_localities():
    return [(c["id"], loc) for c in CITIES.values() for loc in c["localities"]]


class TestCatalog:
    def test_covers_nine_cities_including_tier2_3(self):
        ids = {c["id"] for c in city_list()}
        assert {"delhi-ncr", "mumbai", "bangalore", "kolkata", "hyderabad",
                "chennai", "pune", "patna", "ranchi"} <= ids

    def test_every_city_has_work_anchor_with_coordinates(self):
        for c in CITIES.values():
            assert c["anchor"]["name"]
            assert INDIA_LAT[0] <= c["anchor"]["lat"] <= INDIA_LAT[1]
            assert INDIA_LNG[0] <= c["anchor"]["lng"] <= INDIA_LNG[1]

    def test_every_city_has_at_least_five_localities(self):
        for c in CITIES.values():
            assert len(c["localities"]) >= 5, c["id"]

    def test_locality_ids_are_globally_unique(self):
        ids = [loc["id"] for _, loc in all_localities()]
        assert len(ids) == len(set(ids))

    def test_all_coordinates_inside_india(self):
        for city_id, loc in all_localities():
            assert INDIA_LAT[0] <= loc["lat"] <= INDIA_LAT[1], (city_id, loc["id"])
            assert INDIA_LNG[0] <= loc["lng"] <= INDIA_LNG[1], (city_id, loc["id"])

    def test_rent_and_safety_ranges_are_sane(self):
        for _, loc in all_localities():
            assert 5000 <= loc["rent"] <= 200000
            assert 0 <= loc["safety"] <= 100

    def test_every_locality_has_a_display_accent(self):
        for _, loc in all_localities():
            assert str(loc.get("accent", "")).startswith("#")

    def test_get_city_lookup(self):
        assert get_city("patna")["name"].startswith("Patna")
        assert get_city("nowhere") is None
