"""Write a timestamped Responsible AI evaluation artifact without network calls."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.evaluation import run_offline_scorecard


def main() -> int:
    report = run_offline_scorecard()
    report["generatedAt"] = datetime.now(timezone.utc).isoformat()
    report["runner"] = "NestIQ deterministic ADK and guardrail evaluation"

    output_dir = (
        Path(__file__).resolve().parents[2]
        / "artifacts"
        / "responsible-ai-evaluation"
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = output_dir / f"scorecard-{stamp}.json"
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output_dir / "latest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    cli_trace = {
        "eval_cases": [{
            "eval_case_id": "nestiq-responsible-ai-capabilities",
            "prompt": {
                "role": "user",
                "parts": [{"text": "Evaluate NestIQ's implemented agent, RAG, scoring, and degradation paths."}],
            },
            "responses": [{
                "response": {
                    "role": "model",
                    "parts": [{"text": json.dumps(report)}],
                },
            }],
        }],
    }
    cli_trace_path = output_dir / "agent-evaluation-trace.json"
    cli_trace_path.write_text(json.dumps(cli_trace, indent=2), encoding="utf-8")

    print(json.dumps({
        "status": report["status"],
        "passed": report["passed"],
        "total": report["total"],
        "passRate": report["passRate"],
        "billableCalls": report["billableCalls"],
        "metrics": report["metrics"],
        "artifact": str(output_path),
        "agentsCliTrace": str(cli_trace_path),
    }, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
