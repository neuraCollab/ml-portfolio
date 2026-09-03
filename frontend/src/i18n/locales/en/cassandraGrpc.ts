export const cassandraGrpc = {
  workspace: {
    categoryLabel: 'Distributed MLOps',
    title: 'Cassandra + gRPC ML',
    description:
      'A distributed serving system for a machine-learning model: a FastAPI gateway forwards ' +
      'requests to a Coordinator, which finds live worker pods on Kubernetes and load-balances ' +
      'gRPC calls across them. Model artifacts live in MinIO; Cassandra tracks metadata and ' +
      'application state. Reimplements the coordinator/worker pattern from my own earlier project, ' +
      'neuraCollab/cassandra-grpc-dev (a C++ web crawler), for a real ML workload.',
    positioningNote: 'ML model is intentionally lightweight; this project focuses on distributed inference infrastructure.',
  },
  roleContribution: {
    body:
      'Reimplemented the Cassandra-for-storage + gRPC-coordinator/worker distributed-processing ' +
      'pattern from an existing C++ web-crawler project in Python. Designed the Kubernetes ' +
      "Deployment for the worker pool (1-5 replicas), the Coordinator's pod discovery and " +
      'round-robin gRPC dispatch with retry-on-failure, and a real failure-injection endpoint. ' +
      'Built the TF-IDF + One-vs-Rest Logistic Regression training/inference pipeline, the ' +
      'Protocol Buffers/gRPC service definitions, and the Cassandra schema for ' +
      'requests/predictions/training-run metadata. Migrated model-artifact storage from a ' +
      'Cassandra blob column to MinIO object storage after hitting a real message-size limit. ' +
      'Diagnosed and fixed a real training-time parallelization bug (n_jobs was silently a no-op ' +
      'under multinomial Logistic Regression) by switching to One-vs-Rest.',
  },
  overview: {
    title: 'Real Request Path',
    stages: {
      client: 'Client (browser)',
      backend: 'FastAPI gateway',
      grpcCall: 'Coordinator (routes + discovers pods)',
      worker: 'worker pod (1 of N, real k8s replica)',
      model: 'MinIO / scikit-learn model',
      prediction: 'Prediction',
    },
    cassandraLabel: 'Cassandra',
    workerLabel: 'Coordinator',
    modelLabel: 'Model: {{status}}',
    modelClasses: '{{count}} classes',
    modelNotTrained: 'not trained yet',
    neverTrained: 'Never trained',
    statusFetchError: 'Could not reach the backend status endpoint.',
  },
  dataset: {
    title: 'Dataset',
    ingestedRowsLabel: 'Ingested Rows',
    trainTestLabel: 'Train / Test',
    classesLabel: 'Classes',
    sampleSizeCapLabel: 'Sample Size Cap',
    topTopicsHeading: 'Top 10 topics by row count',
    loadingTitle: 'Loading dataset info',
    loadingDetail: 'First call triggers ingestion into Cassandra...',
    loadErrorFallback: 'Could not load dataset info -- ingestion may still be running on first startup.',
  },
  training: {
    title: 'Training',
    sampleSizeLabel: 'Sample size',
    trainButtonRunning: 'Training...',
    trainButtonIdle: 'Train Model',
    statusLine: 'status: {{status}}',
    statusValues: {
      idle: 'idle',
      running: 'running',
      completed: 'completed',
      failed: 'failed',
    },
    startErrorFallback: 'Could not start training -- see the Architecture panel for backend/worker status.',
    accuracyLabel: 'Accuracy',
    macroF1Label: 'Macro F1',
    microF1Label: 'Micro F1',
    trainingTimeLabel: 'Training Time (model .fit() only)',
    perPodNote:
      "The full sample size trains on a single worker pod -- whichever one the Coordinator's " +
      "round-robin dispatch picks. Training isn't sharded across the pool; other pods pick up the " +
      'resulting model afterward via MinIO (see Architecture).',
  },
  confusionMatrix: {
    truePredictedHeader: 'true \\ predicted',
  },
  inference: {
    title: 'Inference',
    pipelineDescription: 'input → preprocessing → HTTP to Coordinator → gRPC to worker pod → model prediction → confidence → result',
    textareaPlaceholder: 'Enter a Russian request to classify...',
    predictButtonLabel: 'Predict',
    predictErrorFallback: 'Prediction request failed.',
    predictedTopicLabel: 'Predicted topic',
    topicIdLabel: 'topic_id {{id}}',
    timingLine: 'preprocessing {{preprocessing}}ms · gRPC {{grpc}}ms',
  },
  grpcLog: {
    heading: 'Recent gRPC calls',
    emptyState: 'No gRPC calls logged yet.',
  },
  staticResults: {
    eyebrow: 'Results',
    title: 'Real Results: Infrastructure Benchmarks',
    distributedNote:
      'Benchmarks of the serving infrastructure -- gRPC throughput, latency, and how they scale ' +
      "with the worker pool. ML workload numbers below are secondary; see AutoTopic for that work.",
    scalingHeading: 'Horizontal scaling: throughput vs. worker replicas',
    replicaCountLabel: 'Pool size: {{count}}',
    p50P99ErrorsLabel: 'p50 {{p50}}ms · p99 {{p99}}ms · {{errors}} errors',
    benchmarkHeading: 'Latest stress-test snapshot ({{requests}} requests, concurrency {{concurrency}})',
    throughputLabel: 'Throughput',
    p50Label: 'p50 Latency',
    p99Label: 'p99 Latency',
    errorsLabel: 'Errors',
    notAvailablePrefix: 'Not available -- this snapshot is generated by running',
    notAvailableSuffix: 'after a real training run has completed.',
    workloadIdentityHeading: 'Workload identity',
    datasetSizeLabel: 'Dataset Size',
    modelLabel: 'Model',
    trainingTimeLabel: 'Training Time (model .fit() only)',
    grpcRoundtripLabel: 'gRPC Round-Trip Latency',
    workloadQualityHeading: 'ML workload quality (secondary -- see AutoTopic for model-quality work)',
    accuracyLabel: 'Accuracy',
    macroPrecisionLabel: 'Macro Precision',
    macroRecallLabel: 'Macro Recall',
    macroF1Label: 'Macro F1',
    confusionMatrixHeading: 'Confusion Matrix (top classes by support)',
    examplePredictionLabel: 'Example prediction',
  },
  benchmark: {
    title: 'Run a Real gRPC Stress Test',
    description:
      'Fires real calls at concurrency {{concurrency}}, dispatched by the Coordinator over gRPC to ' +
      'whichever worker pods are Ready right now.',
    whatIsACallNote:
      'Each call is a real Predict request -- the same call the Inference panel above makes, with ' +
      'the same fixed sample text -- dispatched round-robin to a single Ready worker pod: the ' +
      'actual ML workload under concurrent load, not a health check.',
    requestsLabel: 'Number of calls (max 15,000)',
    runButtonLabel: 'Run Stress Test',
    runningLabel: 'Running...',
    errorFallback: 'Benchmark request failed.',
    throughputLabel: 'Throughput',
    p50Label: 'p50 Latency',
    p99Label: 'p99 Latency',
    errorsLabel: 'Errors',
    errorsExplainerNote: 'Real FAILED_PRECONDITION errors from pods with no model loaded, not a stress-test bug.',
    distributionHeading: 'Requests per pod ({{count}} Ready)',
  },
  architecture: {
    eyebrow: 'System Architecture',
    title: 'Client to Coordinator to Worker to Cassandra/MinIO',
    flowBanner: 'Client → FastAPI → Coordinator → gRPC → Workers → Cassandra (state) + MinIO (models)',
    intro:
      "The Coordinator is the key piece: it discovers Ready worker pods live via the Kubernetes " +
      'API and distributes requests between them -- these are real Deployment replicas, not ' +
      'simulated instances.',
    steps: {
      s1: { title: 'Client (browser)', detail: 'Sends HTTP requests (train, predict, status) to the FastAPI backend.' },
      s2: { title: 'FastAPI backend -- gateway', detail: 'Owns the Cassandra session used for ingestion and logging, and proxies requests over HTTP to the Coordinator. Writes every prediction and training run to Cassandra directly.' },
      s3: { title: 'Coordinator (real k8s pod)', detail: 'Discovers Ready worker pods via the Kubernetes API and round-robin dispatches gRPC calls to them, retrying once against a different pod on grpc.RpcError. Can also delete a pod on request to demonstrate failure handling.' },
      s4: { title: 'Worker pod (one of N)', detail: 'A real Kubernetes Deployment replica (1-5) holding the trained model in memory, loaded from MinIO at startup using a metadata pointer read from Cassandra.' },
      s5: { title: 'Cassandra (k8s pod)', detail: 'Application state and metadata: ingested training rows, prediction/training-run logs, and which model artifact is current (id, version, artifact_uri) -- never the model blob itself.' },
      s6: { title: 'MinIO (k8s pod)', detail: 'Object storage for the trained model artifact (joblib + gzip), uploaded by the worker that trained it and downloaded by every pod at startup or refresh.' },
    },
    whyHeading: 'Why Cassandra + gRPC + MinIO',
    whyBody:
      'Cassandra owns distributed application state and metadata; MinIO owns large ML artifacts -- ' +
      'this is a minimal, real model-registry pattern, not a production-ready one (no versioning ' +
      'UI, rollback, or access control). gRPC is a real network call to a separate worker process, ' +
      'the same distributed-processing shape as the C++ crawler this project is adapted from ' +
      '(neuraCollab/cassandra-grpc-dev).',
    systemStatusHeading: 'System Status (real, self-reported)',
    workerPoolHeading: 'Worker Pool',
  },
  systemStatus: {
    backendLabel: 'Backend',
    cassandraLabel: 'Cassandra',
    cpuLabel: 'CPU',
    memoryLabel: 'Memory',
    uptimeLabel: 'Uptime',
    releaseVersionLabel: 'Release version',
    clusterNameLabel: 'Cluster name',
    hostIdLabel: 'Host ID',
    cassandraUptimeNote: "Cassandra has no built-in queryable process-uptime metric, so this shows real identity/version info from system.local instead of fabricating an uptime figure.",
    selfReportNote:
      'Backend and worker stats are real, self-reported process readings (psutil: CPU%, RSS memory, process uptime) -- not a Docker-API container-level reading, since that would need Docker socket access this deployment intentionally avoids.',
    fetchError: 'Could not reach the backend status endpoint.',
    workerPodsLabel: '{{count}} Worker Pods',
    noPodsReady: 'No worker pods are currently Ready.',
  },
  workerPool: {
    deploymentLabel: 'Deployment',
    readyOfRequested: '{{ready}} Ready / {{requested}} requested',
    addButtonTitle: 'Scale up by one real worker replica',
    removeButtonTitle: 'Scale down by one real worker replica',
    scaleErrorFallback: 'Could not scale the worker pool.',
    killOneButton: 'Simulate Worker Failure',
    killOneNote:
      'Deletes one real pod outright. The Coordinator excludes it immediately (pod discovery ' +
      "re-queries Ready pods on every call, with retry-on-failure to a different pod), and " +
      "Kubernetes' Deployment controller replaces it on its own.",
    killedPodMessage: 'Killed {{pod}} -- Kubernetes is replacing it now.',
    killErrorFallback: 'Could not kill a worker pod.',
    realNote: 'Real pods on a local kind Kubernetes cluster -- scaling patches the real Deployment via the Coordinator.',
  },
  methodologySection: {
    eyebrow: 'Methodology',
    title: 'Ingestion → Training → Model Storage → gRPC Serving → Prediction → Logging',
    ingestionHeading: '1. Ingestion',
    ingestionBody:
      'A stratified sample (capped at CASSANDRA_GRPC_SAMPLE_SIZE, default 40,000 rows) of ' +
      "AutoTopic's labeled_requests.parquet (373,657 rows) is inserted into Cassandra's requests " +
      'table with a 90/10 train/test split per class.',
    trainingHeading: '2. Training',
    trainingBody:
      'The worker reads all rows from Cassandra, fits a TfidfVectorizer (max 50,000 features, 1-2 ' +
      "grams) and a One-vs-Rest LogisticRegression classifier (n_jobs=-1) on the train split, then " +
      'evaluates on the held-out test split with scikit-learn.',
    persistenceHeading: '3. Model Storage',
    persistenceBody:
      'The worker joblib-serializes and gzip-compresses the model, uploads it to MinIO, then ' +
      "writes a small metadata row (model id, trained_at, artifact_uri, num_classes) to Cassandra's " +
      'models table -- never the blob itself. Every worker pod loads the latest artifact this way ' +
      'at startup and on periodic refresh, so newly scaled-up pods converge on the same model ' +
      "without ever running training themselves. This replaces an earlier design that stored the " +
      "blob directly in Cassandra and hit a real message-size limit (see Error Analysis).",
    servingHeading: '4. gRPC Serving',
    servingBody:
      'A Predict request reaches the worker pool over gRPC, dispatched by the Coordinator to a ' +
      'Ready pod it discovered via the Kubernetes API -- retried against a different pod if the ' +
      'first one errors.',
    predictionHeading: '5. Prediction',
    predictionBody: 'The worker runs a forward pass through its loaded model and returns topic_id, topic_name, and a confidence score over the same gRPC call.',
    loggingHeading: '6. Cassandra Logging',
    loggingBody:
      "Every prediction and its latency are logged to Cassandra's predictions table by the FastAPI " +
      'gateway, independent of which worker pod served it -- so history survives pool scaling and ' +
      'pod restarts.',
  },
  baselineSection: {
    eyebrow: 'Baseline',
    title: "What This Project Replaces: AutoTopic's Unsupervised Clustering",
    intro:
      "This project's stated purpose (see README) is distilling AutoTopic's slow unsupervised " +
      'BERTopic clustering into a fast supervised classifier for real-time inference -- compared ' +
      'below on that dimension using each project\'s own measured numbers.',
    caveat:
      'BERTopic (unsupervised) and this classifier (supervised) are different task types, so ' +
      "accuracy isn't a meaningful comparison -- only this classifier produces a per-query " +
      'confidence score at all.',
    baselineCardTitle: 'Baseline: AutoTopic (BERTopic, unsupervised)',
    baselineTime: 'Full corpus re-clustering: 46.0 min',
    baselineQuery: 'Single-query classification: not supported',
    modelCardTitle: 'Model: this project (TF-IDF + LogisticRegression, One-vs-Rest)',
    modelTime: 'One-time training: 30.1s at 40,000 rows (model .fit() only)',
    modelQuery: 'Per-query gRPC round-trip: 63.6ms',
    sourceNote: "AutoTopic's 46.0 min figure is from its own full-dataset run (see that page's Results). This project's figures are from a training run at the 40,000-row default.",
  },
  errorAnalysisSection: {
    eyebrow: 'Error Analysis',
    title: 'Real Findings From Operating This System',
    intro: 'Real infrastructure issues found while running Cassandra, gRPC, and Kubernetes locally -- not classifier-quality findings (see AutoTopic for that).',
    cassandraPersistenceTitle: 'Historical: Cassandra message-size limit broke cross-pod model sharing',
    cassandraPersistenceBody:
      'The trained model (~22.7MB serialized) failed to save to Cassandra with an error reporting ' +
      '~45.3MB -- double the real size, because a simple-statement INSERT hex-encodes a blob ' +
      'client-side. A prepared statement plus gzip compression fixed the encoding bug, but at this ' +
      "project's actual default sample size (40,000 rows) the compressed model is still ~18.9MB, " +
      "over Cassandra's 16MB limit. This is what motivated moving model artifacts to MinIO object " +
      'storage entirely (see Architecture) -- Cassandra now only ever stores a short artifact URI.',
    clusterAvailabilityTitle: 'Local kind cluster lost its NodePort mappings after a Docker restart',
    clusterAvailabilityBody:
      'After a Docker Desktop restart, the kind control-plane container came back up healthy but ' +
      'with none of its NodePort mappings published to the host -- Cassandra, the Coordinator, and ' +
      'every worker pod were fine inside the cluster and unreachable from outside it. docker port ' +
      'and kubectl showed the real cause. Fixed by recreating the cluster; now the documented ' +
      'recovery step in cassandra-grpc-ml/README.md.',
  },
  regressionTestsSection: {
    eyebrow: 'Regression Tests',
    title: 'Worker ML Core & Schema Regression Tests',
    intro:
      'Tests run against every layer of the system: the ML core, model storage (MinIO + Cassandra ' +
      "metadata), the Coordinator's pod discovery, gRPC dispatch, retry-on-failure and " +
      "failure-injection, and the backend's API schemas and HTTP proxying.",
    testListHeading: 'What is verified',
    test1: 'train_and_evaluate() returns correct shapes and near-perfect accuracy on trivially-separable synthetic data.',
    test2: 'The confusion matrix is correctly capped to the top-N classes by test support.',
    test3: 'Empty train/test splits are rejected with a clear error, not a silent failure.',
    test4: 'A model round-trips through MinIO + Cassandra metadata and produces identical predictions after reloading.',
    test5: 'API schemas round-trip correctly and reject out-of-range values; stratified sampling stays proportional and deterministic given a fixed seed.',
    test6: "The Coordinator's round-robin dispatcher retries against a different pod on grpc.RpcError, pod discovery filters to Ready pods only, kill-one deletes a Ready pod, and its FastAPI routes behave correctly against a mocked k8s API and gRPC layer.",
    howToRerun: 'Re-run locally with: ',
  },
};
