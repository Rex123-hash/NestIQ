"""Allowlist validation for model-generated analytics SQL.

Context: `bq_india.analytics_query` prepends a CTE that defines the alias
`india_localities_latest` over the real snapshot table. That prepended CTE supplies the
ONLY legitimate real-table reference, so a qualified or backticked table name inside the
generated SELECT is unambiguously an attempt to reach some other table.

This replaces a substring blocklist that both under-blocked (no table allowlist, so a
UNION or subquery could read anything the service account could see) and over-blocked
(a string literal containing "update" was refused).

Scope note: this is a syntactic guard, not a full SQL parser. It is deliberately
conservative — anything it cannot positively recognise is rejected.
"""
from __future__ import annotations

import re

# The CTE alias defined by bq_india._latest_cte(). The only table the model may read.
ALLOWED_TABLES = {"india_localities_latest"}

# Rows returned to the caller. Cost is bounded separately by maximum_bytes_billed.
MAX_ROWS = 50

# Statements that must never appear as a real keyword. Matched on word boundaries so a
# literal like 'Updated Colony' is not a false positive.
FORBIDDEN_KEYWORDS = (
    "insert", "update", "delete", "drop", "create", "merge", "alter", "truncate",
    "grant", "revoke", "call", "export", "load", "replace", "begin", "commit",
)


class SqlGuardError(ValueError):
    """Raised when generated SQL fails validation. Never surfaced verbatim to users."""


def _strip_string_literals(sql: str) -> str:
    """Blank out quoted literals so keyword/table scanning can't be fooled or
    confused by their contents (e.g. a locality literally named 'Updated Colony')."""
    return re.sub(r"'([^']|'')*'", "''", sql)


def validate_analytics_sql(sql: str) -> str:
    """Return the validated SQL (with a safe LIMIT applied), or raise SqlGuardError."""
    if not sql or not sql.strip():
        raise SqlGuardError("empty query")

    text = sql.strip().rstrip(";").strip()

    # Comments can hide intent and split statements; the model is never asked for them.
    if "--" in text or "#" in text or "/*" in text or "*/" in text:
        raise SqlGuardError("comments are not allowed")

    # A single statement only. (Trailing semicolon already stripped above.)
    if ";" in text:
        raise SqlGuardError("only a single statement is allowed")

    # Backticks would introduce a qualified table reference; the CTE we prepend is the
    # only real table this query may touch.
    if "`" in text:
        raise SqlGuardError("qualified/backticked table references are not allowed")

    scan = _strip_string_literals(text).lower()

    if not scan.startswith("select"):
        raise SqlGuardError("only a read-only SELECT is allowed")

    for kw in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{kw}\b", scan):
            raise SqlGuardError(f"forbidden keyword: {kw}")

    # Every actual table-position identifier must be the allowed CTE. Subquery
    # aliases are consumed by _table_targets and never need to be allowlisted;
    # treating aliases as tables lets a hostile inner table reuse its own name
    # as an outer alias and bypass validation.
    targets = _table_targets(scan)
    for target in targets:
        if target not in ALLOWED_TABLES:
            raise SqlGuardError(f"table not allowed: {target}")
    if not targets:
        raise SqlGuardError("query does not read the allowed table")

    return _apply_row_limit(text)


_IDENT = re.compile(r"[a-z_][a-z0-9_.]*")

# Words that end a table list. Regex splitting is not enough here: a subquery can
# contain commas ("FROM (SELECT a, b FROM t) x"), so entries are scanned with
# parenthesis awareness instead.
_CLAUSE_WORDS = {
    "where", "group", "order", "limit", "having", "union", "intersect", "except",
    "join", "on", "using", "inner", "left", "right", "full", "cross", "window",
    "qualify", "from", "select",
}


def _skip_parens(scan: str, i: int) -> int:
    """Return the index just past the balanced group starting at scan[i] == '('."""
    depth = 0
    while i < len(scan):
        if scan[i] == "(":
            depth += 1
        elif scan[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return i


def _table_targets(scan: str) -> list[str]:
    """Every identifier in a table position: each entry of every FROM list (so implicit
    comma joins are all checked) plus every JOIN target. Subqueries are skipped here
    because their own FROM keyword is matched independently."""
    targets: list[str] = []

    for match in re.finditer(r"\b(from|join)\b", scan):
        keyword = match.group(1)
        i = match.end()
        while True:
            while i < len(scan) and scan[i].isspace():
                i += 1
            if i >= len(scan):
                break

            if scan[i] == "(":
                i = _skip_parens(scan, i)  # subquery: validated via its own FROM
            else:
                ident = _IDENT.match(scan, i)
                if not ident or ident.group(0) in _CLAUSE_WORDS:
                    break
                targets.append(ident.group(0))
                i = ident.end()

            # Consume an optional alias, with or without AS.
            while i < len(scan) and scan[i].isspace():
                i += 1
            alias = _IDENT.match(scan, i)
            if alias and alias.group(0) == "as":
                i = alias.end()
                while i < len(scan) and scan[i].isspace():
                    i += 1
                alias = _IDENT.match(scan, i)
            if alias and alias.group(0) not in _CLAUSE_WORDS:
                i = alias.end()

            # Only a FROM list continues past a comma.
            while i < len(scan) and scan[i].isspace():
                i += 1
            if keyword == "from" and i < len(scan) and scan[i] == ",":
                i += 1
                continue
            break

    return targets


def _apply_row_limit(text: str) -> str:
    """Clamp an existing LIMIT to MAX_ROWS, or append one when absent."""
    match = re.search(r"\blimit\s+(\d+)\s*$", text, flags=re.IGNORECASE)
    if match:
        if int(match.group(1)) <= MAX_ROWS:
            return text
        return text[: match.start()].rstrip() + f" LIMIT {MAX_ROWS}"
    return f"{text} LIMIT {MAX_ROWS}"
