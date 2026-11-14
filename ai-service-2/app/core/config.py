import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "LocCoc AI Service 2"
    APP_ENV: str = "development"
    PORT: int = 8088
    HOST: str = "0.0.0.0"

    # Jina CLIP v2 Model Configuration
    # Ưu tiên load từ LOCAL_MODEL_DIR nếu tồn tại, ngược lại tải từ MODEL_NAME_OR_PATH
    MODEL_NAME_OR_PATH: str = "jinaai/jina-clip-v2"
    LOCAL_MODEL_DIR: str = "./models/jina-clip-v2"
    DEVICE: str = "auto"  # 'auto', 'cuda', 'cpu'
    EMBEDDING_DIM: int = 512  # Matryoshka Representation Learning (1024, 512, 256)

    # Qdrant Vector DB Configuration
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str | None = None
    QDRANT_COLLECTION_NAME: str = "media_moments"

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def effective_model_path(self) -> str:
        """Kiểm tra nếu thư mục local tồn tại và có file config thì load local"""
        local_path = Path(self.LOCAL_MODEL_DIR)
        if local_path.exists() and (local_path / "config.json").exists():
            return str(local_path.resolve())
        return self.MODEL_NAME_OR_PATH


settings = Settings()
