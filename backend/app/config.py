"""Runtime configuration, loaded from environment / .env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project: str = ""
    gcp_location: str = "us-central1"
    bq_dataset: str = "nestiq"
    gemini_model: str = "gemini-2.5-flash"
    maps_api_key: str = ""
    use_mock: bool = False

    @property
    def dataset_ref(self) -> str:
        return f"{self.gcp_project}.{self.bq_dataset}"


settings = Settings()
