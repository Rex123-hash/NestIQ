"""analytics_query must validate model SQL and cap cost before executing.

`max_results` only limits rows RETURNED, never bytes SCANNED, so it was never cost
protection. These tests pin the real controls: allowlist validation, a dry run to
measure bytes, and maximum_bytes_billed on the executed job.
"""
import pytest

from app import bq_india
from app.sql_guard import SqlGuardError


class FakeJob:
    def __init__(self, bytes_processed=1000, rows=None):
        self.total_bytes_processed = bytes_processed
        self._rows = rows or []

    def result(self, max_results=None):
        return self._rows


class FakeClient:
    """Records every query call so we can assert on dry-run and byte caps."""

    def __init__(self, bytes_processed=1000, rows=None):
        self.calls = []
        self._bytes = bytes_processed
        self._rows = rows or []

    def query(self, sql, job_config=None):
        self.calls.append({"sql": sql, "config": job_config})
        dry = getattr(job_config, "dry_run", False)
        return FakeJob(self._bytes, [] if dry else self._rows)


@pytest.fixture()
def fake_bq(monkeypatch):
    holder = {}

    def install(bytes_processed=1000, rows=None):
        c = FakeClient(bytes_processed, rows)
        monkeypatch.setattr(bq_india, "client", lambda: c)
        holder["client"] = c
        return c

    holder["install"] = install
    return holder


class TestValidation:
    def test_disallowed_table_never_reaches_bigquery(self, fake_bq):
        c = fake_bq["install"]()
        with pytest.raises(SqlGuardError):
            bq_india.analytics_query("SELECT * FROM `other.ds.secrets`")
        assert c.calls == [], "no query may be sent when validation fails"

    def test_comma_join_escape_never_reaches_bigquery(self, fake_bq):
        c = fake_bq["install"]()
        with pytest.raises(SqlGuardError):
            bq_india.analytics_query("SELECT a FROM india_localities_latest, secrets")
        assert c.calls == []

    def test_valid_query_executes(self, fake_bq):
        c = fake_bq["install"](rows=[{"name": "Saket", "aqi": 210}])
        rows = bq_india.analytics_query(
            "SELECT name, aqi FROM india_localities_latest LIMIT 5")
        assert rows == [{"name": "Saket", "aqi": 210}]
        assert len(c.calls) == 2, "expected a dry run followed by the real query"


class TestCostControls:
    def test_dry_run_precedes_execution(self, fake_bq):
        c = fake_bq["install"]()
        bq_india.analytics_query("SELECT name FROM india_localities_latest LIMIT 5")
        assert getattr(c.calls[0]["config"], "dry_run", False) is True
        # A real QueryJobConfig leaves dry_run as None when unset, so assert falsy.
        assert not getattr(c.calls[1]["config"], "dry_run", False)

    def test_query_over_byte_cap_is_rejected_before_execution(self, fake_bq):
        c = fake_bq["install"](bytes_processed=bq_india.MAX_QUERY_BYTES + 1)
        with pytest.raises(SqlGuardError):
            bq_india.analytics_query("SELECT name FROM india_localities_latest LIMIT 5")
        assert len(c.calls) == 1, "only the dry run may run when the estimate is too large"

    def test_executed_job_sets_maximum_bytes_billed(self, fake_bq):
        c = fake_bq["install"]()
        bq_india.analytics_query("SELECT name FROM india_localities_latest LIMIT 5")
        assert c.calls[1]["config"].maximum_bytes_billed == bq_india.MAX_QUERY_BYTES

    def test_city_filter_is_parameterised(self, fake_bq):
        c = fake_bq["install"]()
        bq_india.analytics_query(
            "SELECT name FROM india_localities_latest WHERE city = @city LIMIT 5",
            city="delhi-ncr")
        params = c.calls[1]["config"].query_parameters
        assert params and params[0].name == "city" and params[0].value == "delhi-ncr"
