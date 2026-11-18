from typing import Literal

from pydantic import AwareDatetime, Field, SecretStr, model_validator, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    IMAGE_ENHANCEMENT_ENABLED: bool = False
    GEMINI_API_KEY: SecretStr = SecretStr("")
    GEMINI_IMAGE_MODEL: str = ""
    AI_REQUEST_TIMEOUT_MS: int = Field(default=60000, ge=1, le=60000)
    AI_MAX_INPUT_BYTES: int = Field(default=10485760, ge=1, le=10485760)
    AI_MAX_OUTPUT_BYTES: int = Field(default=20971520, ge=1, le=20971520)
    AI_MAX_IMAGE_PIXELS: int = Field(default=40_000_000, ge=1, le=40_000_000)
    GEMINI_ENHANCEMENT_RPM: int = Field(default=0, ge=0, le=1000)
    GEMINI_ENHANCEMENT_DAILY_CAP: int = Field(default=0, ge=0)
    GEMINI_ENHANCEMENT_MONTHLY_CAP: int = Field(default=0, ge=0)
    SEMANTIC_SEARCH_ENABLED: bool = False
    GEMINI_EMBEDDING_API_KEY: SecretStr = SecretStr("")
    AI_SERVICE_TOKEN: SecretStr = SecretStr("")
    AI_ACTOR_SECRET: SecretStr = SecretStr("")
    GEMINI_EMBEDDING_MODEL: Literal["gemini-embedding-2"] = "gemini-embedding-2"
    QUERY_TRANSLATION_ENABLED: bool = True
    GEMINI_QUERY_TRANSLATION_MODEL: str = Field(default="gemini-3.1-flash-lite", min_length=1, max_length=120)
    EMBEDDING_DIM: Literal[768, 1536, 3072] = 768
    EMBEDDING_PROFILE_ID: str = ""
    QDRANT_URL: str = "http://127.0.0.1:6333"
    QDRANT_API_KEY: SecretStr = SecretStr("")
    QDRANT_COLLECTION_NAME: str = ""
    REDIS_URL: str = "redis://127.0.0.1:6379"
    GEMINI_QUERY_RPM: int = Field(default=0, ge=0, le=10000)
    AI_OWNER_SEARCH_RPM: int = Field(default=30, ge=1, le=1000)
    GEMINI_INGEST_RPM: int = Field(default=0, ge=0, le=10000)
    GEMINI_DAILY_REQUEST_CAP: int = Field(default=0, ge=0)
    GEMINI_DAILY_REQUEST_CAP_OVERRIDE: int = Field(default=0, ge=0)
    GEMINI_DAILY_REQUEST_CAP_OVERRIDE_UNTIL: AwareDatetime | None = None
    GEMINI_MONTHLY_REQUEST_CAP: int = Field(default=0, ge=0)
    PROVIDER_TIMEOUT_SECONDS: float = Field(default=2.5, gt=0, le=10)
    PORT: int = Field(default=8087, ge=1, le=65535)

    @field_validator("EMBEDDING_DIM", mode="before")
    @classmethod
    def parse_dimension(cls, value):
        return int(value) if isinstance(value, str) and value.isascii() and value.isdigit() else value

    @model_validator(mode="after")
    def validate_runtime(self):
        from urllib.parse import urlsplit

        if bool(self.GEMINI_DAILY_REQUEST_CAP_OVERRIDE) != bool(self.GEMINI_DAILY_REQUEST_CAP_OVERRIDE_UNTIL):
            raise ValueError("Temporary daily cap requires both a cap and an explicit expiry")
        profile = f"gemini2-d{self.EMBEDDING_DIM}-imgv1-queryv1"
        collection = f"moments_gemini2_d{self.EMBEDDING_DIM}_v1"
        if self.EMBEDDING_PROFILE_ID not in ("", profile) or self.QDRANT_COLLECTION_NAME not in (
            "",
            collection,
        ):
            raise ValueError("Embedding profile and collection must match EMBEDDING_DIM")
        self.EMBEDDING_PROFILE_ID = profile
        self.QDRANT_COLLECTION_NAME = collection
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
        if self.IMAGE_ENHANCEMENT_ENABLED:
            if (
                not self.GEMINI_API_KEY.get_secret_value().strip()
                or not self.GEMINI_IMAGE_MODEL.strip()
                or len(self.AI_SERVICE_TOKEN.get_secret_value()) < 32
            ):
                raise ValueError("Enabled enhancement requires image credentials, model and service token")
        if self.SEMANTIC_SEARCH_ENABLED:
            secrets = [self.AI_SERVICE_TOKEN.get_secret_value(), self.AI_ACTOR_SECRET.get_secret_value()]
            if not self.GEMINI_EMBEDDING_API_KEY.get_secret_value().strip() or any(
                len(s) < 32 for s in secrets
            ):
                raise ValueError("Enabled semantic runtime requires provider and service credentials")
            if secrets[0] == secrets[1]:
                raise ValueError("Service token and actor secret must differ")
        return self
