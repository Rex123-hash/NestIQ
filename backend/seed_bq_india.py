"""One-off: seed the India BigQuery tables from live Google data, then verify."""
import sys
sys.path.insert(0, ".")

from app import bq_india, maps, gemini
from app.india import get_city

CITIES = sys.argv[1:] or ["delhi-ncr"]

bq_india.ensure_tables()
print("tables ensured")

for city in CITIES:
    feats = maps.build_city_features(city)
    ranked = maps.score_india(feats, gemini.INDIA_DEFAULT, 30000)
    n = bq_india.log_localities(city, ranked)
    print(f"{city}: logged {n} locality snapshots")
    total = 0
    for loc in get_city(city)["localities"]:
        hist = maps.air_quality_history(loc["lat"], loc["lng"], hours=720)
        total += bq_india.append_aqi_history(city, loc, hist)
    print(f"{city}: appended {total} AQI history points")

# verify with a real analytics query (the kind NL->SQL will generate)
print("\n=== verify: cleanest-air localities in", CITIES[0], "===")
rows = bq_india.run_sql(
    f"SELECT name, aqi, median_rent, commute_min FROM `{bq_india._ref(bq_india.LOCALITIES)}` "
    f"WHERE city=@city ORDER BY aqi ASC LIMIT 5",
    city=CITIES[0],
)
for r in rows:
    print(f"  {r['name']:<26} AQI={r['aqi']}  rent={r['median_rent']}  commute={r['commute_min']}min")
print(f"\nrows returned: {len(rows)}")
