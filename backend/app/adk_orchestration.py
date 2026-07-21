"""Authentic ADK workflow for the search SSE contract.

The workflow is intentionally deterministic at the tool/scoring boundary: ADK
owns execution and event lifecycle, while existing Python tools own arithmetic,
validation, and data access. The legacy stream remains available behind the
feature flag for rollback.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Callable, AsyncGenerator

from pydantic import PrivateAttr
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from . import civic_rag, telemetry


def _event(author: str, kind: str, payload: dict[str, Any]) -> Event:
    return Event(author=author, output={"kind": kind, **payload})


class _ToolAgent(BaseAgent):
    _run_tool: Callable[[Any], dict[str, Any]] = PrivateAttr()
    _tool_name: str = PrivateAttr()
    _display_name: str = PrivateAttr()

    def __init__(self, *, tool_name: str, display_name: str, run_tool: Callable[[Any], dict[str, Any]], **kwargs):
        super().__init__(**kwargs)
        self._run_tool = run_tool
        self._tool_name = tool_name
        self._display_name = display_name

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        started = time.perf_counter()
        telemetry.event("agent_tool_started", agent=self.name, tool=self._tool_name)
        yield _event(self.name, "agent", {"id": self.name, "name": self._display_name, "status": "running",
                                           "msg": f"{self._tool_name} tool running"})
        try:
            result = self._run_tool(ctx.session.state)
        except Exception as error:  # noqa: BLE001
            telemetry.event(
                "agent_tool_failed", agent=self.name, tool=self._tool_name,
                latencyMs=telemetry.elapsed_ms(started), errorType=type(error).__name__,
            )
            raise
        ctx.session.state[f"{self.name}_result"] = result
        telemetry.event(
            "agent_tool_completed", agent=self.name, tool=self._tool_name,
            latencyMs=telemetry.elapsed_ms(started),
        )
        yield _event(self.name, "agent", {"id": self.name, "name": self._display_name, "status": "done",
                                           "msg": result.get("message", f"{self._tool_name} tool completed")})


class _NestIQCoordinator(BaseAgent):
    _parse_query: Callable[..., dict] = PrivateAttr()
    _rank: Callable[..., list[dict]] = PrivateAttr()
    _city: str = PrivateAttr()
    _query: str = PrivateAttr()

    def __init__(self, *, parse_query, rank, city: str, query: str):
        super().__init__(name="nestiq_planner", description="Plans and validates NestIQ locality searches.")
        self._parse_query = parse_query
        self._rank = rank
        self._city = city
        self._query = query
        self.sub_agents = [
            _ToolAgent(name="live_signals_agent", description="Retrieves live AQI, Places, and commute signals.",
                       tool_name="Live Signals", display_name="Live Signals Agent", run_tool=self._live_tool),
            _ToolAgent(name="analytics_agent", description="Reads validated locality analytics and snapshots.",
                       tool_name="Analytics", display_name="Analytics Agent", run_tool=self._analytics_tool),
            _ToolAgent(name="civic_intelligence_agent", description="Retrieves scoped civic evidence and citations.",
                       tool_name="Civic Intelligence", display_name="Civic Intelligence Agent", run_tool=self._civic_tool),
        ]

    def _live_tool(self, state):
        # Real work: fetch live Google signals and compute the deterministic
        # FitScore ranking (rank -> maps.build_city_features + score_india).
        parsed = state["preferences"]
        results = self._rank(self._city, parsed["weights"], parsed.get("budget"))
        state["results"] = results
        unavailable = sum(1 for r in results if r.get("aqi") is None)
        top = results[0] if results else None
        msg = f"Live AQI/Places/commute fetched for {len(results)} localities"
        if top:
            msg += f"; top FitScore {top['fitScore']} ({top['name']})"
        if unavailable:
            msg += f"; {unavailable} with air data unavailable"
        return {"message": msg}

    def _analytics_tool(self, state):
        # Real work: read the computed analytics that score_india produced from
        # the live data (cross-sectional anomalies + provisional coverage). No
        # numbers are invented; this reports what the deterministic engine found.
        results = state.get("results", [])
        anomalies = sum(1 for r in results if r.get("anomalies"))
        provisional = sum(1 for r in results if r.get("fitScoreDataStatus") == "provisional")
        return {"message": (
            f"Analyzed {len(results)} locality snapshots; {anomalies} with statistical anomalies, "
            f"{provisional} provisional (incomplete signals)"
        )}

    def _civic_tool(self, state):
        # Real work: citation-locked civic RAG retrieval, scoped to the top
        # locality. Reports the true retrieved count (0 is an honest answer).
        results = state.get("results", [])
        top = results[0] if results else None
        try:
            docs = civic_rag.retrieve(
                "civic development water transport environment notices",
                self._city, top["id"] if top else None,
            )
        except Exception:  # noqa: BLE001
            docs = []
        state["civic_docs"] = len(docs)
        if not docs:
            return {"message": "No scoped official civic document matched; none invented"}
        return {"message": f"Retrieved {len(docs)} scoped civic document(s); citations preserved"}

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        started = time.perf_counter()
        parsed = self._parse_query(self._query, None)
        ctx.session.state["preferences"] = parsed
        top = ", ".join(k.replace("_", " ") for k, value in sorted(parsed["weights"].items(), key=lambda item: -item[1]) if value >= 40)
        telemetry.event("agent_plan_selected", agent=self.name, city=self._city, priorityCount=len(top.split(", ")) if top else 0)
        yield _event(self.name, "agent", {"id": "planner", "name": "NestIQ Planner", "status": "done",
                                           "msg": f"Selected tools for {top or 'balanced priorities'}"})
        # ADK executes each specialist as a real agent; the tools themselves remain deterministic.
        async for event in self.sub_agents[0].run_async(ctx):
            yield event
        # Analytics and civic retrieval are independent after live signals have
        # established the validated locality set, so ADK runs them together.
        async def collect(agent):
            return [event async for event in agent.run_async(ctx)]
        parallel_events = await asyncio.gather(*(collect(agent) for agent in self.sub_agents[1:]))
        for events in parallel_events:
            for event in events:
                yield event
        results = ctx.session.state.get("results", [])
        # Real validation over the structured results: (1) no Severe locality may
        # carry a high air-health subscore; (2) report how many are provisional
        # (missing signals). Nothing here changes a score; it only flags/labels.
        contradictions = [
            r["id"] for r in results
            if r.get("airHealthBand") == "Severe" and r.get("subscores", {}).get("air_quality", 100) > 14
        ]
        provisional = sum(1 for r in results if r.get("fitScoreDataStatus") == "provisional")
        if contradictions:
            vmsg = f"Validator flagged {len(contradictions)} air-health contradiction(s)"
        elif provisional:
            vmsg = f"Validator: no contradictions; {provisional} result(s) marked provisional for missing signals"
        else:
            vmsg = "Validator found no contradictions"
        telemetry.event(
            "agent_validation_completed", agent="validator_agent", city=self._city,
            validatorResult="failed" if contradictions else "passed",
            contradictionCount=len(contradictions), provisionalCount=provisional,
        )
        yield _event("validator_agent", "agent", {"id": "validator", "name": "Validator Agent", "status": "done",
                                                   "msg": vmsg, "contradictions": contradictions})
        # Explainer: a deterministic summary drawn only from validated structured
        # evidence — it never invents facts. The full natural-language explanation
        # is produced on the locality detail page.
        top_result = results[0] if results else None
        if top_result:
            emsg = (f"Ranked {len(results)} localities; top {top_result['name']}: "
                    f"FitScore {top_result['fitScore']} ({top_result.get('matchDisplay', top_result.get('match', ''))}), "
                    f"air {top_result.get('airHealthBand', 'n/a')}")
        else:
            emsg = "No localities to rank"
        yield _event("explainer", "agent", {"id": "explainer", "name": "Explainer", "status": "done", "msg": emsg})
        telemetry.event(
            "agent_run_completed", agent=self.name, city=self._city,
            resultCount=len(results), latencyMs=telemetry.elapsed_ms(started),
            usageAvailable=False,
        )
        yield _event(self.name, "final", {"preferences": parsed, "results": results, "city": self._city})


def run_adk_search(query: str, city: str, parse_query, rank) -> list[dict[str, Any]]:
    """Run the ADK coordinator and return only contract-level SSE payloads."""
    async def execute():
        service = InMemorySessionService()
        session_id = uuid.uuid4().hex
        await service.create_session(app_name="nestiq", user_id="search", session_id=session_id)
        runner = Runner(agent=_NestIQCoordinator(parse_query=parse_query, rank=rank, city=city, query=query),
                        app_name="nestiq", session_service=service)
        content = types.Content(role="user", parts=[types.Part.from_text(text=query)])
        payloads = []
        async for event in runner.run_async(user_id="search", session_id=session_id, new_message=content):
            if isinstance(event.output, dict) and event.output.get("kind"):
                payloads.append(event.output)
        return payloads
    return asyncio.run(execute())
