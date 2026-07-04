"""NL->SQL safety: only clean, read-only SELECTs may ever reach BigQuery."""
import pytest

from app import bq_india
from app.gemini import _clean_sql


class TestSqlInjectionGuards:
    @pytest.mark.parametrize("bad", [
        "DROP TABLE nestiq.india_localities",
        "DELETE FROM t WHERE 1=1",
        "INSERT INTO t VALUES (1)",
        "UPDATE t SET aqi = 0",
        "CREATE TABLE evil (x INT64)",
        "MERGE t USING s ON true",
        "SELECT 1; DROP TABLE t",           # stacked statement
        "  select 1; delete from t",        # lowercase + leading space
        "WITH x AS (SELECT 1) DELETE FROM t",
        "EXPORT DATA OPTIONS() AS SELECT 1",
    ])
    def test_analytics_query_rejects_writes(self, bad):
        with pytest.raises(ValueError):
            bq_india.analytics_query(bad)

    @pytest.mark.parametrize("bad", [
        "DROP TABLE t", "SELECT 1; SELECT 2", "TRUNCATE TABLE t",
    ])
    def test_run_sql_rejects_writes(self, bad):
        with pytest.raises(ValueError):
            bq_india.run_sql(bad)

    def test_guard_fires_before_any_network_call(self, monkeypatch):
        """A rejected statement must never construct a BigQuery client."""
        def boom():  # pragma: no cover - fails the test if reached
            raise AssertionError("client() must not be called for rejected SQL")
        monkeypatch.setattr(bq_india, "client", boom)
        with pytest.raises(ValueError):
            bq_india.analytics_query("DELETE FROM t")


class TestCleanSql:
    def test_strips_markdown_fences(self):
        raw = "```sql\nSELECT name FROM t\n```"
        assert _clean_sql(raw) == "SELECT name FROM t"

    def test_strips_bare_fences(self):
        assert _clean_sql("```\nSELECT 1\n```") == "SELECT 1"

    def test_keeps_only_first_statement(self):
        assert _clean_sql("SELECT 1; DROP TABLE t") == "SELECT 1"

    def test_plain_sql_passes_through(self):
        assert _clean_sql("SELECT name, aqi FROM t ORDER BY aqi") == "SELECT name, aqi FROM t ORDER BY aqi"

    def test_empty_input_is_safe(self):
        assert _clean_sql("") == ""
