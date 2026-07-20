"""Phase 4 offline responsible-agent evaluation scorecard."""
from app.evaluation import run_offline_scorecard


def test_offline_scorecard_passes_every_guardrail_without_billable_calls():
    report = run_offline_scorecard()

    assert report["status"] == "passed"
    assert report["passed"] == report["total"] >= 6
    assert report["passRate"] == 100
    assert report["billableCalls"] == 0
    assert {case["dimension"] for case in report["cases"]} >= {
        "health_scoring", "missing_data_honesty", "groundedness", "security",
    }
