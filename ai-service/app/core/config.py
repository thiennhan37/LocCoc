from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    SEMANTIC_SEARCH_ENABLED: bool = False
    GEMINI_EMBEDDING_API_KEY: SecretStr = SecretStr("")
    AI_SERVICE_TOKEN: SecretStr = SecretStr("")
    AI_ACTOR_SECRET: SecretStr = SecretStr("")
    GEMINI_EMBEDDING_MODEL: Literal["gemini-embedding-2"] = "gemini-embedding-2"
    EMBEDDING_DIM: Literal[768] = 768
    EMBEDDING_PROFILE_ID: Literal["gemini2-d768-imgv1-queryv1"] = "gemini2-d768-imgv1-queryv1"
    QDRANT_URL: str = "http://127.0.0.1:6333"
    QDRANT_API_KEY: SecretStr = SecretStr("")
    QDRANT_COLLECTION_NAME: Literal["moments_gemini2_d768_v1"] = "moments_gemini2_d768_v1"
    REDIS_URL: str = "redis://127.0.0.1:6379"
    GEMINI_QUERY_RPM: int = Field(default=0, ge=0, le=10000)
    AI_OWNER_SEARCH_RPM: int = Field(default=30, ge=1, le=1000)
    GEMINI_INGEST_RPM: int = Field(default=0, ge=0, le=10000)
    GEMINI_DAILY_REQUEST_CAP: int = Field(default=0, ge=0)
    GEMINI_MONTHLY_REQUEST_CAP: int = Field(default=0, ge=0)
    PROVIDER_TIMEOUT_SECONDS: float = Field(default=2.5, gt=0, le=10)
    PORT: int = Field(default=8087, ge=1, le=65535)

    @model_validator(mode="after")
    def validate_runtime(self):
        from urllib.parse import urlsplit

        url = urlsplit(self.QDRANT_URL)
        if (
            url.scheme not in ("http", "https")
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
            or url.path not in ("", "/")
        ):
            raise ValueError("QDRANT_URL must be an HTTP origin")
        if self.SEMANTIC_SEARCH_ENABLED:
            secrets = [self.AI_SERVICE_TOKEN.get_secret_value(), self.AI_ACTOR_SECRET.get_secret_value()]
            if not self.GEMINI_EMBEDDING_API_KEY.get_secret_value().strip() or any(len(s) < 32 for s in secrets):
                raise ValueError("Enabled semantic runtime requires provider and service credentials")
            if secrets[0] == secrets[1]:
                raise ValueError("Service token and actor secret must differ")
        return self
