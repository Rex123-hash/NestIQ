"""Honest air-quality fallback semantics (Phase 1).

A failed live AQI call used to return a realistic-looking AQI 150, which is
indistinguishable from a genuine live reading. These tests lock the honest
replacement: a missing/failed reading returns aqi=None with an explicit
temporarily_unavailable status and provenance, never a fabricated number.
"""
from app import maps


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class TestAirQualityProvenance:
    def setup_method(self):
        maps._last_good_aqi.clear()

    def test_live_success_carries_provenance(self, monkeypatch):
        payload = {"indexes": [{"code": "ind_cpcb", "aqi": 320, "category": "Very Poor",
                                "dominantPollutant": "pm25"}]}
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(payload))
        out = maps.air_quality(28.6, 77.2)
        assert out["aqi"] == 320
        assert out["status"] == "live"
        assert "Air Quality" in out["source"]
        assert out["fetchedAt"]

    def test_failed_call_returns_no_fabricated_number(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("network down")
        monkeypatch.setattr(maps.requests, "post", boom)
        out = maps.air_quality(28.6, 77.2)
        assert out["aqi"] is None            # never a fake 150
        assert out["status"] == "temporarily_unavailable"
        assert "Air Quality" in out["source"]

    def test_response_without_aqi_is_unavailable(self, monkeypatch):
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp({"indexes": []}))
        out = maps.air_quality(28.6, 77.2)
        assert out["aqi"] is None
        assert out["status"] == "temporarily_unavailable"


class TestIndexProvenance:
    def setup_method(self):
        maps._last_good_aqi.clear()

    def test_cpcb_reading_is_labelled_cpcb(self, monkeypatch):
        payload = {"indexes": [{"code": "ind_cpcb", "aqi": 320, "category": "Very Poor", "dominantPollutant": "pm25"}]}
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(payload))
        out = maps.air_quality(28.6, 77.2)
        assert out["indexCode"] == "ind_cpcb"
        assert "CPCB" in out["source"]
        assert out["scoringMethod"] == "cpcb"
        assert out["aqi"] == 320
        assert out["stale"] is False and out["fallbackUsed"] is False

    def test_uaqi_only_is_labelled_universal_and_not_cpcb_scored(self, monkeypatch):
        payload = {"indexes": [{"code": "uaqi", "aqi": 55, "category": "Good air quality", "dominantPollutant": "pm25"}]}
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(payload))
        out = maps.air_quality(19.0, 72.8)
        assert out["indexCode"] == "uaqi"
        assert "Universal" in out["source"]
        assert out["scoringMethod"] == "none"   # not scored via CPCB
        assert out["aqi"] == 55


class TestMalformedIngestion:
    """Malformed API values must never be cached or labelled live (item 2)."""

    def setup_method(self):
        maps._last_good_aqi.clear()

    def _payload(self, aqi):
        return {"indexes": [{"code": "ind_cpcb", "aqi": aqi, "category": "X", "dominantPollutant": "pm25"}]}

    def test_string_aqi_is_rejected(self, monkeypatch):
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(self._payload("150")))
        out = maps.air_quality(10.0, 10.0)
        assert out["aqi"] is None
        assert out["status"] == "temporarily_unavailable"
        assert maps._last_good_aqi == {}  # not cached

    def test_negative_aqi_is_rejected(self, monkeypatch):
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(self._payload(-20)))
        out = maps.air_quality(11.0, 11.0)
        assert out["aqi"] is None and out["status"] == "temporarily_unavailable"
        assert maps._last_good_aqi == {}

    def test_boolean_aqi_is_rejected(self, monkeypatch):
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(self._payload(True)))
        out = maps.air_quality(12.0, 12.0)
        assert out["aqi"] is None and out["status"] == "temporarily_unavailable"

    def test_infinity_aqi_is_rejected(self, monkeypatch):
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(self._payload(float("inf"))))
        out = maps.air_quality(13.0, 13.0)
        assert out["aqi"] is None and out["status"] == "temporarily_unavailable"

    def test_valid_reading_still_cached_and_live(self, monkeypatch):
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(self._payload(240)))
        out = maps.air_quality(14.0, 14.0)
        assert out["aqi"] == 240 and out["status"] == "live"
        assert maps._last_good_aqi  # cached


class TestHistoryForecastCpcbOnly:
    """History/forecast feed a CPCB-labelled chart, so UAQI points are omitted (item 3)."""

    def test_extract_ignores_uaqi_points(self):
        assert maps._extract_aqi([{"code": "uaqi", "aqi": 60}]) is None

    def test_extract_returns_cpcb_points(self):
        assert maps._extract_aqi([{"code": "ind_cpcb", "aqi": 260}]) == 260

    def test_extract_ignores_malformed_cpcb(self):
        assert maps._extract_aqi([{"code": "ind_cpcb", "aqi": "bad"}]) is None

    def test_history_drops_uaqi_only_points(self, monkeypatch):
        payload = {"hoursInfo": [
            {"dateTime": "2026-07-19T10:00:00Z", "indexes": [{"code": "uaqi", "aqi": 55}]},
            {"dateTime": "2026-07-19T11:00:00Z", "indexes": [{"code": "ind_cpcb", "aqi": 210}]},
        ]}
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(payload))
        out = maps.air_quality_history(10.0, 10.0)
        assert [p["aqi"] for p in out] == [210]  # UAQI point omitted, CPCB kept


class TestStaleCache:
    def setup_method(self):
        maps._last_good_aqi.clear()

    def test_failure_serves_last_good_reading_as_stale(self, monkeypatch):
        good = {"indexes": [{"code": "ind_cpcb", "aqi": 210, "category": "Poor", "dominantPollutant": "pm25"}]}
        monkeypatch.setattr(maps.requests, "post", lambda *a, **k: _Resp(good))
        first = maps.air_quality(12.9, 77.6)
        assert first["status"] == "live"
        original_ts = first["fetchedAt"]

        def boom(*a, **k):
            raise RuntimeError("network down")
        monkeypatch.setattr(maps.requests, "post", boom)
        stale = maps.air_quality(12.9, 77.6)
        assert stale["aqi"] == 210                 # last good value served
        assert stale["status"] == "stale"
        assert stale["stale"] is True
        assert stale["fallbackUsed"] is True
        assert stale["fetchedAt"] == original_ts   # timestamp NOT overwritten

    def test_failure_without_history_is_unavailable(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("down")
        monkeypatch.setattr(maps.requests, "post", boom)
        out = maps.air_quality(1.0, 2.0)
        assert out["aqi"] is None
        assert out["status"] == "temporarily_unavailable"


class TestFetchFeaturesPropagatesProvenance:
    def test_provenance_reaches_the_feature(self, monkeypatch):
        monkeypatch.setattr(maps, "air_quality", lambda lat, lng: {
            "aqi": None, "category": "Unknown", "dominant": "",
            "status": "temporarily_unavailable",
            "source": "Google Air Quality API (CPCB)", "fetchedAt": "2026-07-19T00:00:00Z"})
        monkeypatch.setattr(maps, "amenity_profile", lambda lat, lng: {"total": 5, "breakdown": {}})
        monkeypatch.setattr(maps, "commute_minutes", lambda *a, **k: 30)
        monkeypatch.setattr(maps, "locality_photo", lambda q: "")
        monkeypatch.setattr(maps, "safety_profile", lambda lat, lng: {
            "status": "live", "confidence": "high", "signals": {},
            "emergencyAccessScore": 80,
        })
        city = maps.get_city("delhi-ncr")
        feats = maps._fetch_features(city)
        assert feats[0]["aqi"] is None
        assert feats[0]["airDataStatus"] == "temporarily_unavailable"
        assert feats[0]["airFetchedAt"] == "2026-07-19T00:00:00Z"
