"""Grounded rent must cover general homes and report per-size medians.

Restricting verification to 1 BHK made the evidence incomparable with the
catalog's listed rent, which states no unit size. A median blended across 1 BHK
and 4 BHK is equally useless. So observations carry a bedroom count and are
grouped, letting a reader compare like with like.
"""
from app.gemini import _bedroom_count, _parse_rent_ledger, analyze_rent_observations

_CITES = [{"uri": "https://example.com/a", "title": "Source A"},
          {"uri": "https://example.com/b", "title": "Source B"}]


def _obs(rent, bedrooms=None, title="Listing"):
    item = {"monthlyRent": rent, "observedOn": "", "sourceTitle": title}
    if bedrooms is not None:
        item["bedrooms"] = bedrooms
    return item


class TestBedroomParsing:
    def test_plain_integer(self):
        assert _bedroom_count("2") == 2

    def test_bhk_forms(self):
        assert _bedroom_count("2 BHK") == 2
        assert _bedroom_count("3BHK") == 3
        assert _bedroom_count("1 bhk") == 1

    def test_bedroom_wording(self):
        assert _bedroom_count("2 bedroom") == 2
        assert _bedroom_count("one-bedroom") == 1

    def test_unknown_returns_none(self):
        assert _bedroom_count("") is None
        assert _bedroom_count("unknown") is None
        assert _bedroom_count(None) is None

    def test_implausible_counts_rejected(self):
        # A parsed 0 or 15 is a misread, not a flat.
        assert _bedroom_count("0") is None
        assert _bedroom_count("15 BHK") is None


class TestLedgerParsing:
    def test_four_field_line_captures_bedrooms(self):
        parsed = _parse_rent_ledger("25000 | 2026-07-01 | NoBroker listing | 2 BHK")
        assert parsed["observations"][0]["bedrooms"] == 2

    def test_three_field_line_still_parses(self):
        # Backward compatibility: older ledgers must not break.
        parsed = _parse_rent_ledger("25000 | 2026-07-01 | NoBroker listing")
        assert len(parsed["observations"]) == 1
        assert parsed["observations"][0]["bedrooms"] is None


class TestPerSizeMedians:
    def test_groups_observations_by_bedroom_count(self):
        raw = {"observations": [
            _obs(10000, 1, "a"), _obs(12000, 1, "b"),
            _obs(22000, 2, "c"), _obs(26000, 2, "d"),
        ]}
        result = analyze_rent_observations(raw, _CITES)
        by_size = result["bySize"]
        assert by_size["1"]["median"] == 11000
        assert by_size["2"]["median"] == 24000

    def test_reports_sample_count_per_size(self):
        raw = {"observations": [
            _obs(10000, 1, "a"), _obs(12000, 1, "b"), _obs(22000, 2, "c"),
        ]}
        by_size = analyze_rent_observations(raw, _CITES)["bySize"]
        assert by_size["1"]["count"] == 2
        assert by_size["2"]["count"] == 1

    def test_observations_without_bedrooms_are_excluded_from_groups(self):
        # Unknown size must not silently land in a size bucket.
        raw = {"observations": [_obs(10000, 1, "a"), _obs(99000, None, "b")]}
        by_size = analyze_rent_observations(raw, _CITES)["bySize"]
        assert by_size["1"]["count"] == 1
        assert all(k != "None" for k in by_size)

    def test_overall_median_still_reported(self):
        # Existing consumers read medianRent; it must not disappear.
        raw = {"observations": [_obs(10000, 1, "a"), _obs(12000, 1, "b")]}
        result = analyze_rent_observations(raw, _CITES)
        assert result["medianRent"] == 11000

    def test_no_bedroom_data_yields_empty_groups_not_a_crash(self):
        raw = {"observations": [_obs(10000, None, "a"), _obs(12000, None, "b")]}
        result = analyze_rent_observations(raw, _CITES)
        assert result["bySize"] == {}
        assert result["medianRent"] == 11000
