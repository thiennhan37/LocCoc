import unicodedata
from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=50, ge=1, le=200)
    album_id: str | None = Field(default=None, max_length=36)
    place: str | None = Field(default=None, max_length=120)
    date_from: AwareDatetime | None = None
    date_to: AwareDatetime | None = None

    @field_validator("query")
    @classmethod
    def canonical_query(cls, value: str) -> str:
        value = unicodedata.normalize("NFC", value).strip()
        if not value or any(unicodedata.category(c) == "Cc" for c in value):
            raise ValueError("Query is blank or contains control characters")
        return value

    @field_validator("album_id")
    @classmethod
    def valid_album(cls, value):
        return str(UUID(value)) if value is not None else None

    @field_validator("date_from", "date_to", mode="before")
    @classmethod
    def parse_datetime(cls, value):
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value

    @model_validator(mode="after")
    def ordered_range(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("Invalid date range")
        return self


class IndexMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    capturedAt: AwareDatetime
    albumId: UUID | None = None
    place: str | None = Field(default=None, max_length=120)
