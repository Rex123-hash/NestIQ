"""NL->SQL safety guard.

The model-generated SELECT is appended to a CTE that defines `india_localities_latest`.
That CTE supplies the ONLY legitimate real-table reference, so any qualified/backticked
table name in the generated SQL is by definition an attempt to reach another table.

The previous guard was a substring blocklist, which both under-blocked (no table
allowlist, so a UNION or subquery could read any table the service account can see) and
over-blocked (a literal containing "update" was refused). These tests pin the allowlist
behaviour that replaces it.
"""
import pytest

from app.sql_guard import validate_analytics_sql, SqlGuardError, MAX_ROWS

OK = "SELECT name, aqi FROM india_localities_latest WHERE city = 'delhi-ncr' ORDER BY aqi LIMIT 5"


class TestAccepts:
    def test_plain_select_over_the_allowed_cte(self):
        assert validate_analytics_sql(OK)

    def test_aggregate_and_group_by(self):
        sql = ("SELECT city, AVG(aqi) AS avg_aqi FROM india_localities_latest "
               "GROUP BY city ORDER BY avg_aqi LIMIT 5")
        assert validate_analytics_sql(sql)

    def test_subquery_alias_is_not_treated_as_a_foreign_table(self):
        sql = ("SELECT name FROM (SELECT name, aqi FROM india_localities_latest) AS t "
               "ORDER BY aqi LIMIT 5")
        assert validate_analytics_sql(sql)

    def test_literal_containing_a_ddl_word_is_not_a_false_positive(self):
        # The old substring blocklist rejected this purely because of "update".
        sql = "SELECT name FROM india_localities_latest WHERE name = 'Updated Colony' LIMIT 5"
        assert validate_analytics_sql(sql)

    def test_case_insensitive(self):
        assert validate_analytics_sql(OK.lower())
        assert validate_analytics_sql(OK.upper())


class TestRejects:
    def _bad(self, sql):
        with pytest.raises(SqlGuardError):
            validate_analytics_sql(sql)

    def test_backticked_table_reference(self):
        # The escape the old guard missed entirely.
        self._bad("SELECT * FROM `other-project.secrets.customers` LIMIT 5")

    def test_union_to_a_foreign_table(self):
        self._bad("SELECT name FROM india_localities_latest UNION ALL "
                  "SELECT email FROM `proj.ds.users` LIMIT 5")

    def test_subquery_reading_a_foreign_table(self):
        self._bad("SELECT name FROM india_localities_latest WHERE city IN "
                  "(SELECT city FROM secret_table) LIMIT 5")

    def test_unknown_bare_table(self):
        self._bad("SELECT * FROM some_other_table LIMIT 5")

    def test_comma_join_to_foreign_table(self):
        # Implicit cross join: only the first FROM entry used to be validated.
        self._bad("SELECT name FROM india_localities_latest, secret_table LIMIT 5")

    def test_comma_join_to_qualified_foreign_table(self):
        self._bad("SELECT name FROM india_localities_latest, proj.ds.users LIMIT 5")

    def test_explicit_cross_join_to_foreign_table(self):
        self._bad("SELECT name FROM india_localities_latest CROSS JOIN secret_table LIMIT 5")

    def test_stacked_statement(self):
        self._bad("SELECT name FROM india_localities_latest; DROP TABLE users")

    def test_non_select_statement(self):
        self._bad("DELETE FROM india_localities_latest")
        self._bad("UPDATE india_localities_latest SET aqi = 0")

    def test_ddl_dml_as_a_real_keyword(self):
        self._bad("SELECT name FROM india_localities_latest WHERE 1=1 "
                  "AND (SELECT 1) IN (SELECT 1) INSERT INTO x VALUES (1)")

    def test_line_comment(self):
        self._bad("SELECT name FROM india_localities_latest -- drop everything\nLIMIT 5")

    def test_block_comment(self):
        self._bad("SELECT name /* sneaky */ FROM india_localities_latest LIMIT 5")

    def test_empty_or_blank(self):
        self._bad("")
        self._bad("   ")


class TestRowLimit:
    def test_missing_limit_is_added(self):
        out = validate_analytics_sql("SELECT name FROM india_localities_latest")
        assert f"LIMIT {MAX_ROWS}" in out.upper()

    def test_oversized_limit_is_clamped(self):
        out = validate_analytics_sql("SELECT name FROM india_localities_latest LIMIT 5000")
        assert "5000" not in out
        assert f"LIMIT {MAX_ROWS}" in out.upper()

    def test_small_limit_is_preserved(self):
        out = validate_analytics_sql("SELECT name FROM india_localities_latest LIMIT 3")
        assert "LIMIT 3" in out.upper()
