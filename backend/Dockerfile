FROM python:3.11-slim

# libgl/glib needed by opencv-python-headless & matplotlib backends at import time
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
# CPU-only torch wheel (this backend never has a GPU available) -- much
# smaller than the CUDA-bundled default PyPI wheel.
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Pre-download NLP models at build time so requests never hit the network.
RUN python -m spacy download ru_core_news_sm \
    && python -m spacy download en_core_web_sm
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

# Cassandra + gRPC ML project: generate the gRPC Python stubs the backend
# needs to act as a client of the grpc-worker service.
COPY cassandra-grpc-ml/proto ./cassandra-grpc-ml/proto
RUN python -m grpc_tools.protoc -I cassandra-grpc-ml/proto --python_out=. --grpc_python_out=. cassandra-grpc-ml/proto/ml_worker.proto

# The three ML projects, reused as-is (see backend/app/services for the adapters).
COPY AutoTopic ./AutoTopic
COPY rl_cv_car-autopilot ./rl_cv_car-autopilot
COPY raspberry-pi-ecg ./raspberry-pi-ecg

COPY backend/app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
