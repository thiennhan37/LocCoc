"""Read-only exact ranking analysis of the authorized local 20-image experiment."""

import asyncio
import json
import math
from pathlib import Path
from qdrant_client import AsyncQdrantClient, models as m
from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "logs/moment-dimensions"
RELEVANCE = {
    "người": {"person_man": 2, "person_woman": 2, "person_outdoors": 2, "cycling": 2, "cat_home": 1},
    "con người": {"person_man": 2, "person_woman": 2, "person_outdoors": 2, "cycling": 2, "cat_home": 1},
    "xe": {"cycling": 2, "bicycle_road": 2, "bicycle_city": 2, "car_dark": 2, "car_sport": 2},
    "phương tiện giao thông": {
        "cycling": 2,
        "bicycle_road": 2,
        "bicycle_city": 2,
        "car_dark": 2,
        "car_sport": 2,
    },
    "xe đạp": {"cycling": 2, "bicycle_road": 2, "bicycle_city": 2},
    "chó": {"dog_golden": 2, "dog_small": 2},
    "mèo": {"cat_home": 2, "cat_portrait": 2},
    "cà phê": {"coffee_beans": 2, "coffee_cup": 1},
    "hoa": {"flowers": 2},
    "tàu vũ trụ": {},
}


def normalized(v, dim):
    v = v[:dim]
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v]


def metrics(ranking, qrels):
    relevant = {key for key, grade in qrels.items() if grade > 0}
    dcg = sum((2 ** qrels.get(label, 0) - 1) / math.log2(i + 2) for i, label in enumerate(ranking[:5]))
    ideal = sum(
        (2**grade - 1) / math.log2(i + 2) for i, grade in enumerate(sorted(qrels.values(), reverse=True)[:5])
    )
    return {
        "precision3": sum(x in relevant for x in ranking[:3]) / 3,
        "recall5": sum(x in relevant for x in ranking[:5]) / len(relevant) if relevant else None,
        "ndcg5": dcg / ideal if ideal else None,
        "firstRelevantRank": next((i + 1 for i, x in enumerate(ranking) if x in relevant), None),
    }


async def main():
    manifest = json.loads((DIR / "manifest.json").read_text("utf-8"))
    ids = {i["id"]: i["label"] for i in manifest["items"]}
    s = Settings(_env_file=ROOT / "ai-service/.env")
    client = AsyncQdrantClient(url=s.QDRANT_URL, api_key=s.QDRANT_API_KEY.get_secret_value() or None)
    core_queries = {"người", "xe", "xe đạp", "chó", "mèo", "cà phê", "hoa"}
    RELEVANCE["a photo of a person"] = RELEVANCE["người"]
    RELEVANCE["bông hoa"] = RELEVANCE["hoa"]
    report = {"corpus": 20, "relevance": RELEVANCE, "meanQuerySet": sorted(core_queries), "profiles": {}}
    try:
        for dim in (1536, 3072):
            points, _ = await client.scroll(
                f"moments_gemini2_d{dim}_v1",
                scroll_filter=m.Filter(
                    must=[m.FieldCondition(key="albumId", match=m.MatchValue(value=manifest["albumId"]))]
                ),
                limit=50,
                with_vectors=True,
                with_payload=True,
            )
            if len(points) != 20:
                raise ValueError(f"Expected 20 points for {dim}, got {len(points)}")
            images = {ids[p.payload["assetId"]]: normalized(p.vector, dim) for p in points}
            (DIR / f"image-vectors-{dim}.json").write_text(json.dumps(images), "utf-8")
            queries = [json.loads(p.read_text("utf-8")) for p in (DIR / f"queries-{dim}").glob("*.json")]
            for target in (1536,) if dim == 1536 else (3072, 768):
                rows = []
                for query in queries:
                    q = query["query"]
                    v = normalized(query["vector"], target)
                    scores = {
                        label: sum(a * b for a, b in zip(v, normalized(iv, target)))
                        for label, iv in images.items()
                    }
                    ranking = sorted(scores, key=scores.get, reverse=True)
                    rows.append(
                        {"query": q, "ranking": ranking, "scores": scores, **metrics(ranking, RELEVANCE[q])}
                    )
                key = str(target) if target != 768 else "768_prefix_from_3072"
                answer = [r for r in rows if r["query"] in core_queries]
                report["profiles"][key] = {
                    "rows": rows,
                    "meanPrecision3": sum(r["precision3"] for r in answer) / len(answer),
                    "meanRecall5": sum(r["recall5"] for r in answer) / len(answer),
                    "meanNdcg5": sum(r["ndcg5"] for r in answer) / len(answer),
                }
        (DIR / "comparison.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
        for key, value in report["profiles"].items():
            print(key, {k: v for k, v in value.items() if k != "rows"})
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
