"""Phase 4 offline responsible-agent evaluation scorecard."""
from app.evaluation import run_offline_scorecard


def test_offline_scorecard_passes_every_guardrail_without_billable_calls():
    report = run_offline_scorecard()

    assert report["status"] == "passed"
    assert report["passed"] == report["total"] >= 15
    assert report["passRate"] == 100
    assert report["billableCalls"] == 0
    assert {case["dimension"] for case in report["cases"]} >= {
        "health_scoring", "missing_data_honesty", "groundedness", "security",
        "api_contract", "tool_trajectory", "contradiction_control", "graceful_degradation",
    }
    assert report["metrics"]["toolTrajectoryAccuracy"] == 100
    assert report["metrics"]["groundedness"] == 100
    assert report["metrics"]["citationPrecision"] == 100
    assert report["metrics"]["unsupportedClaimRate"] == 0
    assert report["metrics"]["contradictionRate"] == 0
    assert report["scope"]["excludedNotImplemented"] == [
        "multilingual rendering and multilingual agent equivalents",
    ]
