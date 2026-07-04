"""Quick probe: confirm the Python BigQuery client + ADC work end-to-end
against real NYC 311 data for Astoria ZIPs."""
from google.cloud import bigquery

client = bigquery.Client(project="genai-project-track-1-491908")

sql = """
SELECT incident_zip AS zip, COUNT(*) AS complaints,
       COUNT(DISTINCT complaint_type) AS types
FROM `bigquery-public-data.new_york_311.311_service_requests`
WHERE incident_zip IN ('11102','11103','11105','11106')
  AND created_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
GROUP BY incident_zip
ORDER BY incident_zip
"""

job = client.query(sql)
print("bytes scanned:", job.total_bytes_processed)
for row in job.result():
    print(dict(row))
