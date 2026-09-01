FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY cassandra-grpc-ml/worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY cassandra-grpc-ml/proto ./proto
RUN python -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/ml_worker.proto

COPY cassandra-grpc-ml/worker/ml_core.py cassandra-grpc-ml/worker/model_store.py cassandra-grpc-ml/worker/server.py ./

ENV PYTHONUNBUFFERED=1
EXPOSE 50061

CMD ["python", "server.py"]
