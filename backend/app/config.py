"""Runtime configuration, loaded from environment / .env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project: str = ""
    gcp_location: str = "us-central1"
    bq_dataset: str = "nestiq"
    gemini_model: str = "gemini-2.5-flash"
    # Hard timeout for Vertex/Gemini calls, in MILLISECONDS (the SDK's unit). Prevents a
    # hung model call from holding a Cloud Run request open and tying up an instance.
    gemini_timeout_ms: int = 60_000
    firestore_database: str = "(default)"
    pulse_ttl_seconds: int = 21_600
    # Slightly longer than the Gemini SDK timeout. The watchdog and generation
    # check ensure a late SDK response cannot revive an expired job.
    # Production grounding has occasionally completed just above 60 seconds;
    # keep a small coordination margin while remaining firmly bounded.
    pulse_job_deadline_seconds: int = 70
    pulse_failure_ttl_seconds: int = 60
    # Grounded rent evidence shares the cross-instance job protocol with Pulse.
    rent_verification_ttl_seconds: int = 86_400
    rent_job_deadline_seconds: int = 70
    rent_failure_ttl_seconds: int = 60

    # SERVER-ONLY key: Air Quality, Places, Distance Matrix. Never returned to a browser.
    maps_api_key: str = ""
    # Browser-exposed key, served by /api/config for the Maps JS SDK. MUST be
    # HTTP-referrer restricted in the GCP console — separation alone is not protection.
    maps_browser_key: str = ""
    # Comma-separated CORS allowlist. Empty = localhost dev origins only (fail closed);
    # production must set this explicitly.
    allowed_origins: str = ""
    use_mock: bool = False
    use_adk_orchestration: bool = False
    # When true, secret-bearing fields are re-read from Google Secret Manager at
    # startup (see app/secrets.py). Default OFF: until the secrets and IAM binding
    # exist in GCP this changes nothing and secrets come from env.
    use_secret_manager: bool = False
    # Documented extension point (default OFF): guards any FUTURE fold-in of the
    # additive essential-services signals into the lifestyle/amenity score. This
    # phase never enables it — essentials stay display-only and never affect FitScore.
    essentials_in_lifestyle_score: bool = False

    @property
    def dataset_ref(self) -> str:
        return f"{self.gcp_project}.{self.bq_dataset}"


settings = Settings()

# Optionally re-read secrets from Secret Manager. No-op unless the flag is on;
# fail-safe, so a secrets-backend problem never stops the API from starting.
from .secrets import resolve as _resolve_secrets  # noqa: E402

_resolve_secrets(settings)
