export const cassandraGrpc = {
  workspace: {
    categoryLabel: 'Distributed MLOps',
    title: 'Cassandra + gRPC ML',
    description:
      'A real distributed system for serving a machine-learning model: a FastAPI gateway forwards ' +
      'requests to a Coordinator, which finds live worker pods on Kubernetes and load-balances ' +
      'gRPC calls across them. Cassandra handles both data storage and sharing the trained model ' +
      'between pods. This is a Python rewrite of the coordinator/worker pattern from my own ' +
      'earlier project, neuraCollab/cassandra-grpc-dev (a C++ web crawler), reused here for a real ' +
      'ML workload. The point of this project is the serving infrastructure itself: pod discovery, ' +
      'load balancing, horizontal scaling. The model is intentionally simple -- a classifier ' +
      "distilled from AutoTopic -- and that project's own page is where the NLP work lives.",
  },
  roleContribution: {
    body:
      'Reimplemented the Cassandra-for-storage + gRPC-coordinator/worker distributed-processing ' +
      'pattern from an existing C++ web-crawler project in Python, applied to a real machine-' +
      'learning serving workload. Designed and implemented the Kubernetes Deployment for the ' +
      'worker pool (1-5 replicas), the Coordinator service\'s pod discovery and round-robin gRPC ' +
      'request routing with retry-on-failure, the TF-IDF + One-vs-Rest Logistic Regression ' +
      'training/inference pipeline (scikit-learn), the Protocol Buffers/gRPC service definitions, ' +
      'and the Cassandra schema for request/prediction/training-run persistence. Diagnosed and ' +
      'fixed a real training-time parallelization bug (n_jobs was silently a no-op under ' +
      'multinomial Logistic Regression) by switching to One-vs-Rest, and a Cassandra message-size ' +
      'limit affecting model persistence.',
  },
  overview: {
    title: 'Real Request Path',
    stages: {
      client: 'Client (browser)',
      backend: 'FastAPI gateway',
      grpcCall: 'Coordinator (routes + discovers pods)',
      worker: 'worker pod (1 of N, real k8s replica)',
      model: 'Cassandra / scikit-learn model',
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
      "round-robin dispatch picks for this Train call. Training isn't sharded across the pool; " +
      "other pods only receive the resulting model afterward, and only if it fits under Cassandra's " +
      'message-size limit (see Error Analysis).',
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
  metrics: {
    title: 'Metrics',
    secondaryNote: "Secondary workload-quality numbers from your most recent training run this session. The distributed-system behavior this project demonstrates is in Architecture and System Status above.",
    loading: 'Loading...',
    notAvailable: 'Not available -- no training run has completed yet this session.',
    accuracyLabel: 'Accuracy',
    macroPrecisionLabel: 'Macro Precision',
    macroRecallLabel: 'Macro Recall',
    macroF1Label: 'Macro F1',
    microF1Label: 'Micro F1',
    trainedAtLabel: 'Trained At',
  },
  staticResults: {
    eyebrow: 'Results',
    title: 'Real Results: Infrastructure Benchmarks',
    distributedNote:
      "Real benchmarks of the serving infrastructure -- gRPC throughput, latency, and how they scale with the worker pool -- shown below and validated by the 55/55 regression tests further down. The ML workload's own numbers (accuracy etc.) are secondary context; see AutoTopic for the model-quality work.",
    scalingHeading: 'Real horizontal scaling: throughput vs. worker replicas',
    replicaCountLabel: 'Pool size: {{count}}',
    p50AndErrorsLabel: 'p50 {{p50}}ms · {{errors}} errors',
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
      'whichever worker pods are Ready right now -- not HTTP, not simulated.',
    whatIsACallNote:
      'Each call is a real Predict request -- the same gRPC call the Inference panel above makes, ' +
      'with the same fixed sample text -- dispatched round-robin to a single Ready worker pod. This ' +
      'is the actual ML workload (vectorizer + classifier forward pass) under concurrent load, not a ' +
      "cheap health check. A pod with no trained model genuinely fails here, and that's counted as a " +
      'real error rather than hidden.',
    requestsLabel: 'Number of calls (max 15,000)',
    runButtonLabel: 'Run Stress Test',
    runningLabel: 'Running...',
    errorFallback: 'Benchmark request failed.',
    throughputLabel: 'Throughput',
    p50Label: 'p50 Latency',
    p99Label: 'p99 Latency',
    errorsLabel: 'Errors',
    errorsExplainerNote:
      "These are real FAILED_PRECONDITION errors from pods with no model loaded -- not a stress-test " +
      "bug. See Error Analysis for why not every pod always has the trained model.",
    distributionHeading: 'Requests per pod ({{count}} Ready)',
  },
  architecture: {
    eyebrow: 'System Architecture',
    title: 'Client to Coordinator to Worker to Cassandra',
    flowBanner: 'Client → FastAPI → Coordinator → gRPC → Workers (real k8s replicas) → Cassandra',
    intro:
      "Reflects the same real architecture described in cassandra-grpc-ml/README.md. The live pipeline-stage status above (Overview) already shows this flow with real connectivity; this section explains each stage's role. The Coordinator is the key piece: it discovers Ready worker pods live via the Kubernetes API and distributes requests between them -- the workers below are real Deployment replicas, not simulated instances.",
    steps: {
      s1: { title: 'Client (browser)', detail: 'Sends HTTP requests (train, predict, status) to the FastAPI backend.' },
      s2: { title: 'FastAPI backend -- gateway', detail: 'Owns the Cassandra session used for ingestion and logging, and proxies train/predict/status/pool-scale requests over HTTP to the Coordinator. Writes every prediction and training run to Cassandra directly, independent of the worker pods\' own Cassandra access.' },
      s3: { title: 'Coordinator (real k8s pod)', detail: 'Discovers Ready worker pods via the Kubernetes API and round-robin dispatches gRPC Predict/Train/GetStatus calls to them (cassandra-grpc-ml/proto/ml_worker.proto), retrying once against a different pod on grpc.RpcError.' },
      s4: { title: 'Worker pod (one of N)', detail: 'A real Kubernetes Deployment replica (1-5) holding the trained TF-IDF + LogisticRegression model in memory, loaded from and persisted to Cassandra when the compressed model fits under Cassandra\'s message-size limit -- see Methodology for a known limitation at this project\'s default training sample size.' },
      s5: { title: 'Cassandra (k8s pod)', detail: 'Stores the ingested labeled sample (requests), a log of every real inference (predictions), training-run history (training_runs), and, size permitting, the gzip-compressed trained model blob (models) so worker pods can share it, in the cassandra_grpc_ml keyspace.' },
    },
    whyHeading: 'Why Cassandra + gRPC',
    whyBody:
      'This pattern (Cassandra for storage, gRPC for a real network call to a separate worker process) is the same distributed-processing shape as the C++ crawler this project is adapted from (neuraCollab/cassandra-grpc-dev), reimplemented in Python around a real ML task instead of web crawling -- see Methodology below for why that specific task was chosen.',
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
    replicaCount: '{{count}} of {{min}}-{{max}} replicas',
    addButtonTitle: 'Scale up by one real worker replica',
    removeButtonTitle: 'Scale down by one real worker replica',
    scaleErrorFallback: 'Could not scale the worker pool.',
    realNote: 'Real pods, running on a local kind Kubernetes cluster -- scaling patches the real Deployment via the Coordinator. See cassandra-grpc-ml/README.md for cluster setup.',
  },
  methodologySection: {
    eyebrow: 'Methodology',
    title: 'Ingestion → Training → Model Persistence → gRPC Serving → Prediction → Cassandra Logging',
    ingestionHeading: '1. Ingestion',
    ingestionBody:
      'On first use, a stratified sample (capped at CASSANDRA_GRPC_SAMPLE_SIZE, default 40,000 rows) of AutoTopic\'s real labeled_requests.parquet (373,657 rows) is drawn per class and inserted into Cassandra\'s requests table with a 90/10 train/test split per class, so every class is represented in both splits.',
    trainingHeading: '2. Training',
    trainingBody:
      'The worker reads all rows from Cassandra, fits a TfidfVectorizer (max 50,000 features, 1-2 grams) and a One-vs-Rest LogisticRegression classifier (n_jobs=-1, so each class\'s binary sub-classifier trains on its own CPU core) on the train split, then evaluates on the held-out test split -- real accuracy, macro/micro precision/recall/F1, and a confusion matrix (top 15 classes by test support) computed with scikit-learn, not estimated.',
    persistenceHeading: '3. Model Persistence',
    persistenceBody:
      'The trained vectorizer + classifier are joblib-serialized, gzip-compressed, and persisted as a single blob in Cassandra\'s models table when it fits under Cassandra\'s 16MB message-size limit -- not just kept in one worker\'s local memory. When it fits, every worker pod loads that same blob on a periodic refresh, so predictions stay consistent across the pool, including newly scaled-up pods that never ran the training job themselves. Known limitation: at this project\'s actual default training sample size (40,000 rows) the compressed blob is large enough (~18.9MB) that this persistence step can fail; when it does, the training pod still serves its freshly-trained model correctly from memory and says so in the training response, but other pods will not receive it until a smaller sample size is used (see cassandra-grpc-ml/README.md).',
    servingHeading: '4. gRPC Serving',
    servingBody:
      "A Predict request reaches the worker pool over a real gRPC call, dispatched by the Coordinator to one of the Ready worker pods it discovered via the Kubernetes API (see Architecture) -- retried against a different pod if the first one errors.",
    predictionHeading: '5. Prediction',
    predictionBody:
      'The worker runs a real forward pass through its loaded model and returns topic_id, topic_name, and a confidence score back over the same gRPC call.',
    loggingHeading: '6. Cassandra Logging',
    loggingBody:
      "Every real prediction and its latency are logged to Cassandra's predictions table by the FastAPI gateway, independent of which worker pod actually served it -- so the request history survives pool scaling and pod restarts.",
  },
  baselineSection: {
    eyebrow: 'Baseline',
    title: "What This Project Replaces: AutoTopic's Unsupervised Clustering",
    intro:
      "This project's own stated purpose (see README) is distilling AutoTopic's slow unsupervised BERTopic clustering into a fast supervised classifier for real-time inference. The comparison below is on that dimension -- speed and real-time capability -- using real, measured numbers from each project's own results, not a re-run of the same classifier without gRPC/Cassandra.",
    caveat:
      "BERTopic (unsupervised topic discovery) and this classifier (supervised classification) are different task types, so accuracy isn't a meaningful comparison between them -- only one of them (this classifier) produces a per-query confidence score at all.",
    baselineCardTitle: 'Baseline: AutoTopic (BERTopic, unsupervised)',
    baselineTime: 'Full corpus re-clustering: 46.0 min',
    baselineQuery: 'Single-query classification: not supported',
    modelCardTitle: 'Model: this project (TF-IDF + LogisticRegression, One-vs-Rest)',
    modelTime: 'One-time training: 30.1s at 40,000 rows (model .fit() only -- a different sample size trains in a different, equally real amount of time)',
    modelQuery: 'Real per-query gRPC round-trip: 63.6ms',
    sourceNote: 'AutoTopic\'s 46.0 min figure is from its own real full-dataset pipeline run (see the AutoTopic page\'s Results). This project\'s 30.1s / 63.6ms figures are from a real training run at the 40,000-row default (see Results below).',
  },
  errorAnalysisSection: {
    eyebrow: 'Error Analysis',
    title: 'Real Findings From Operating This System',
    intro:
      "Most of these are real infrastructure bugs found while actually running Cassandra, gRPC, and Kubernetes locally -- not the classifier's own errors (see AutoTopic for model-quality analysis). The one exception, majority-class bias, is kept because it's real and easy to verify against the confusion matrix below.",
    majorityBiasTitle: 'Majority-class bias',
    majorityBiasBody:
      '"Жизненные советы" (life advice), the largest class (1,287 test examples), attracts misclassifications from almost every other class -- e.g. 201 "Проекты и задачи", 104 "Эмоции студентов", and 78 "Посты о любви" rows were all misclassified as this class. A classic class-imbalance failure: with no class weighting, the model defaults to the statistically safest guess.',
    cassandraPersistenceTitle: 'Cassandra message-size limit broke cross-pod model sharing',
    cassandraPersistenceBody:
      'The trained model (~22.7MB serialized) failed to save to Cassandra with an error reporting ~45.3MB -- double the real size. Cause: the INSERT used a simple statement, which inlines a blob as a hex string client-side, doubling it on the wire. Fixed with a prepared statement (raw binary) plus gzip compression. At this project\'s actual default sample size (40,000 rows) the compressed model is still ~18.9MB, over Cassandra\'s 16MB limit -- so a freshly trained model currently only reaches other pods at a smaller sample size (2,000 rows confirmed working); the pod that trained it always keeps serving correctly from memory either way.',
    clusterAvailabilityTitle: 'Local kind cluster lost its NodePort mappings after a Docker restart',
    clusterAvailabilityBody:
      "After a Docker Desktop restart, the kind control-plane container came back up healthy but with none of its NodePort mappings published to the host -- Cassandra, the Coordinator, and every worker pod were fine inside the cluster and completely unreachable from outside it. No error in the app itself; docker port and kubectl showed the real cause. Fixed by recreating the cluster, now the documented recovery step in cassandra-grpc-ml/README.md.",
  },
  regressionTestsSection: {
    eyebrow: 'Regression Tests',
    title: 'Worker ML Core & Schema Regression Tests',
    intro:
      "55 tests run against every layer of the system: the ML core (training and evaluation on synthetic data), model persistence to and from Cassandra, the Coordinator's pod discovery and round-robin gRPC dispatch with retry-on-failure, and the backend's API schemas and its HTTP proxying to the Coordinator.",
    testListHeading: 'What is verified',
    test1: 'train_and_evaluate() returns correct shapes and near-perfect accuracy on trivially-separable synthetic data.',
    test2: 'The confusion matrix is correctly capped to the top-N classes by test support.',
    test3: 'Empty train/test splits are rejected with a clear error, not a silent failure.',
    test4: 'A saved model round-trips through model_store and produces identical predictions after reloading.',
    test5: 'API schemas round-trip correctly and reject out-of-range values; stratified sampling stays proportional and deterministic given a fixed seed.',
    test6: 'The Coordinator\'s round-robin dispatcher retries against a different pod on grpc.RpcError, pod discovery filters to Ready pods only, and its FastAPI routes (predict/train/status/pool-scale) behave correctly against a mocked k8s API and gRPC layer.',
    howToRerun: 'Re-run locally with: ',
  },
};
