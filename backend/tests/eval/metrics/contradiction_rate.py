import json


def evaluate(instance):
    report = json.loads(instance["response"]["parts"][0]["text"])
    return {"score": report["metrics"]["contradictionRate"] / 100}
