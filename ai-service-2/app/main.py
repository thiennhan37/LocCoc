from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logger import logger
from app.api.v1.router import api_router
from app.services.qdrant_service import qdrant_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động dịch vụ
    logger.info("=" * 60)
    logger.info(f"Đang khởi động {settings.APP_NAME}...")
    logger.info(f"Môi trường: {settings.APP_ENV} | Cổng: {settings.PORT}")
    logger.info(f"Qdrant Vector DB: {settings.QDRANT_URL}")
    logger.info(f"Model Path: {settings.effective_model_path}")
    logger.info("=" * 60)

    # Đảm bảo collection Qdrant đã sẵn sàng
    try:
        qdrant_service.ensure_collection()
    except Exception as e:
        logger.warning(f"Lưu ý: Chưa thể kết nối tới Qdrant lúc khởi động: {e}")

    yield

    # Tắt dịch vụ
    logger.info(f"Đang tắt {settings.APP_NAME}...")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Microservice quản lý Vector Embedding (Jina CLIP v2) và Tìm kiếm khoảnh khắc đa phương tiện bằng ngôn ngữ tự nhiên (Qdrant) cho nền tảng LocCoc.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["Root"])
async def root():
    return {
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=(settings.APP_ENV == "development"),
    )
