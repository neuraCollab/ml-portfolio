# cassandra-grpc-ml/coordinator/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY cassandra-grpc-ml/coordinator/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY cassandra-grpc-ml/proto ./proto
RUN python -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/ml_worker.proto

COPY cassandra-grpc-ml/coordinator/dispatch.py cassandra-grpc-ml/coordinator/k8s_client.py cassandra-grpc-ml/coordinator/app.py ./

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
