FROM python:3.11-slim

WORKDIR /app

# Cài đặt các gói hệ thống cần thiết cho Pillow, PyTorch, C++ extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy file dependencies và cài đặt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8087

# Lệnh khởi chạy server FastAPI với uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8087"]
