"""Optional Google Secret Manager backing for sensitive settings.

DEFAULT OFF. With `USE_SECRET_MANAGER=false` (the default) nothing here runs and secrets
come from environment variables exactly as before. This module is inert until the
secrets and the IAM binding actually exist in GCP, so the presence of this code must NOT
be described as "NestIQ stores its secrets in Secret Manager" — that is only true once
the runbook's setup steps are done and verified.

Two deliberate safety properties:

1. FAIL-SAFE, NOT FAIL-CLOSED. If a secret is missing or the fetch errors, the existing
   env value is kept. Blanking a working key would take the whole service down, which is
   strictly worse than continuing on the value it already had. (This differs from the
   CORS decision, where failing closed is safe because the blast radius is one origin.)
2. NEVER LOG SECRET MATERIAL. Only the secret's NAME and an exception TYPE are logged —
   never a value, and never an exception message, which can echo the payload back.
"""
from __future__ import annotations

# Settings fields backed by Secret Manager, mapped to their secret id in GCP.
SECRET_FIELDS: dict[str, str] = {
    "maps_api_key": "nestiq-maps-server-key",
    "maps_browser_key": "nestiq-maps-browser-key",
}


def fetch_secret(project: str, secret_id: str, version: str = "latest") -> str | None:
    """Read one secret payload, or None if unavailable.

    The import is lazy so the dependency is only needed when the flag is enabled.
    """
    from google.cloud import secretmanager

    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project}/secrets/{secret_id}/versions/{version}"
    response = client.access_secret_version(name=name)
    return response.payload.data.decode("utf-8")


def resolve(settings) -> None:
    """Override secret-bearing settings fields in place when the flag is enabled.

    Silently a no-op when disabled. Never raises: a secrets backend problem must not
    prevent the API from starting on its existing env configuration.
    """
    if not getattr(settings, "use_secret_manager", False):
        return

    project = getattr(settings, "gcp_project", "") or ""
    if not project:
        print("[secrets] USE_SECRET_MANAGER is on but GCP_PROJECT is empty; keeping env values")
        return

    for field, secret_id in SECRET_FIELDS.items():
        try:
            value = fetch_secret(project, secret_id)
        except Exception as error:  # noqa: BLE001
            # Log the TYPE only — an exception message can contain the payload.
            print(f"[secrets] {secret_id}: fetch failed ({type(error).__name__}); keeping env value")
            continue
        if value is None or not str(value).strip():
            print(f"[secrets] {secret_id}: not set; keeping env value")
            continue
        object.__setattr__(settings, field, str(value).strip())
        print(f"[secrets] {secret_id}: loaded from Secret Manager")
