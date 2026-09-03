export type ActiveTab = 'autotopic' | 'autopilot' | 'ecg' | 'cassandragrpc' | 'overview';

// AutoTopic Types
export interface LogDocument {
  id: string;
  text: string;
  cleanedText: string;
  language: 'ru' | 'en';
  topicId: number;
  confidence: number;
  /** 2D UMAP projection of this document's real embedding, for the topic-map
   * scatter plot only -- null when too few documents survived to fit one. */
  x?: number | null;
  y?: number | null;
}

export interface TopicKeyword {
  word: string;
  weight: number;
}

export interface TopicModel {
  id: number; // -1 is noise
  name: string;
  count: number;
  percentage: number;
  keywords: TopicKeyword[];
  color: string;
  representativeDocs: string[];
}

export interface AutoTopicConfig {
  removeHtml: boolean;
  removeEmojis: boolean;
  removeCode: boolean;
  removeLlmPrefix: boolean;
  minLen: number;
  maxLen: number;
  minTopicSize: number;
  nrTopics: number;
  umapNeighbors: number;
  umapMinDist: number;
  vectorizerMinDf: number;
  vectorizerMaxDf: number;
  nGramRange: [number, number];
  topNWords: number;
  languageMode: 'ru' | 'en' | 'mixed';
}

export interface OptunaTrial {
  trial: number;
  minTopicSize: number;
  nrTopics: number;
  umapNeighbors: number;
  coherenceUci: number;
  diversity: number;
  compositeScore: number; // coherence_uci + 0.2 * diversity
  nTopics: number;
  status: 'COMPLETE' | 'PRUNED';
}

export interface AutoTopicDatasetInfo {
  configuredLocation: string;
  resolvedPath: string;
  isUrl: boolean;
  exists: boolean;
  totalRows?: number | null;
  sampledRows?: number | null;
}

export interface AutoTopicResults {
  metrics: {
    documentsAnalyzed: number;
    nTopics: number;
    outlierCount: number;
    outlierPercentage: number;
    coherenceUci: number;
    coherenceUmass: number;
    diversity: number;
    compositeScore: number;
  };
  topics: TopicModel[];
  documents: LogDocument[];
  trials: OptunaTrial[];
  note?: string | null;
  datasetInfo?: AutoTopicDatasetInfo | null;
}

export interface AutoTopicFullPipelineStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  stage?: string | null;
  progressPercent?: number | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  elapsedSeconds?: number | null;
  totalRows?: number | null;
  survivingRows?: number | null;
  error?: string | null;
  result?: AutoTopicResults | null;
}

// RL & CV Car Autopilot Types
export interface TrackletObject {
  id: string;
  objectType: 'Car' | 'Pedestrian' | 'Cyclist' | 'Van';
  tx: number; // distance forward (m)
  ty: number; // left/right offset (m)
  tz: number; // height offset (m)
  h: number;
  w: number;
  l: number;
  distance: number;
  truncation: number;
  occlusion: number;
}

export interface KittiFrame {
  frameId: number;
  timestamp: string;
  vf: number; // speed m/s
  yaw: number; // rad/s
  tracklets: TrackletObject[];
  lidarPointsCount: number;
}

export interface RLAction {
  steering: number; // -1 to 1
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
}

// Structured description of a penalty event, kept semantic (not pre-formatted
// text) so the UI can translate it at render time -- see stepKittiEnv() in
// data/autopilotData.ts and the penaltyFeed rendering in AutopilotWorkspace.tsx.
export type RLPenaltyPart =
  | { kind: 'harshSteeringFull'; magnitude: number }
  | { kind: 'overspeedFull' }
  | { kind: 'overspeedSuffix' }
  | { kind: 'collision'; distance: number }
  | { kind: 'highYawFull' }
  | { kind: 'highYawSuffix' };

export interface RLLogStep {
  step: number;
  frameId: number;
  action: RLAction;
  speed: number;
  yawRate: number;
  nearestObstacleDist: number;
  reward: number;
  cumulativeReward: number;
  penalty: RLPenaltyPart[] | null;
}

export interface CameraCalibration {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  p1: number;
  p2: number;
}

// ECG / Edge AI Types
export const ECG_LEAD_NAMES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'] as const;
export type EcgLeadName = typeof ECG_LEAD_NAMES[number];
export type EcgStage = 'raw' | 'filtered' | 'processed';

export interface EcgClassPrediction {
  probability: number;
  predicted: boolean;
}

export interface EcgSignalMetrics {
  numSamples: number;
  samplingRateHz: number;
  durationSeconds: number;
  minAmplitude: number;
  maxAmplitude: number;
  meanAmplitude: number;
  stdAmplitude: number;
  amplitudeRange: number;
}

export interface EcgRPeakInfo {
  peakCount: number;
  peakIndices: number[];
  heartRateBpm: number | null;
  note: string;
}

export interface EcgSignalQualityMetrics {
  globalStd: number;
  uniqueValueFraction: number;
  clippedFraction: number;
  noiseRatio: number;
  baselineInstabilityRatio: number;
  peakCount: number;
  expectedMinPeaks: number;
}

export interface EcgSignalQuality {
  status: 'GOOD' | 'WARNING' | 'POOR';
  issues: string[];
  metrics: EcgSignalQualityMetrics;
  note: string;
}

export interface EcgAnalysisResult {
  leads: Record<EcgLeadName, number[]>;
  filteredLeads: Record<EcgLeadName, number[]>;
  processedLeads: Record<EcgLeadName, number[]>;
  samplingRateHz: number;
  signalMetrics: EcgSignalMetrics;
  rPeaks: EcgRPeakInfo;
  signalQuality: EcgSignalQuality;
  predictions: Record<string, EcgClassPrediction>;
  topClass: string;
  topLabel: string;
  topProbability: number;
  preprocessingTimeMs: number;
  inferenceTimeMs: number;
  source: 'synthetic' | 'sample' | 'upload' | 'public';
  groundTruthAvailable: boolean;
  groundTruthLabels?: Record<string, boolean> | null;
  groundTruthCorrect?: Record<string, boolean> | null;
  note: string;
}

export interface EcgHealth {
  status: 'ok' | 'degraded';
  modelLoaded: boolean;
  modelLoadError: string | null;
}

export interface EcgPerClassMetric {
  className: string;
  label: string;
  support: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  /** null ("N/A") for classes with zero positive support in this evaluation
   * set -- never a misleading measured 0.0 for "never evaluated". */
  precision: number | null;
  recall: number | null;
  f1: number | null;
  prAuc: number | null;
  threshold: number;
}

export interface EcgThresholdInfo {
  className: string;
  label: string;
  threshold: number;
  isCalibrated: boolean;
}

export interface EcgEvaluationResult {
  numSamples: number;
  numClasses: number;
  numEvaluatedClasses: number;
  subsetAccuracy: number;
  hammingAccuracy: number;
  microPrecision: number;
  microRecall: number;
  microF1: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  prAucMicro: number | null;
  prAucMacro: number | null;
  perClass: EcgPerClassMetric[];
  thresholds: EcgThresholdInfo[];
  thresholdCalibrationNote: string;
  note: string;
}

export interface EcgRuntimeInfo {
  cpuPercent: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  cpuTemperatureCelsius: number | null;
  samplingRateHz: number;
  lastInferenceTimeMs: number | null;
  lastPreprocessingTimeMs: number | null;
  platform: string;
  note: string;
}

export interface EcgLatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}

export interface EcgBenchmarkResult {
  iterations: number;
  preprocessing: EcgLatencyPercentiles;
  inference: EcgLatencyPercentiles;
  total: EcgLatencyPercentiles;
  platform: string;
  note: string;
}

// Cassandra + gRPC ML Types
export interface ServiceSelfStats {
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
}

export interface CassandraSystemInfo {
  releaseVersion: string;
  clusterName: string;
  hostId: string;
}

export interface PodStatus {
  address: string;
  modelLoaded: boolean;
  numClasses: number;
  trainedAt?: string | null;
  stats?: ServiceSelfStats | null;
  error?: string | null;
}

export interface CassandraGrpcStatus {
  cassandra: 'connected' | 'unreachable';
  coordinator: 'connected' | 'unreachable';
  modelLoaded: boolean;
  numClasses: number;
  trainedAt?: string | null;
  backendStats?: ServiceSelfStats | null;
  pods: PodStatus[];
  cassandraInfo?: CassandraSystemInfo | null;
}

export interface PoolScaleResult {
  requestedReplicas: number;
  readyReplicas: number;
}

export interface ClassDistributionEntry {
  topicId: number;
  topicName: string;
  count: number;
}

export interface CassandraGrpcDatasetInfo {
  ingestedRows: number;
  trainRows: number;
  testRows: number;
  numClasses: number;
  sampleSize: number;
  topicDistribution: ClassDistributionEntry[];
  note: string;
}

export interface ClassSupport {
  topicId: number;
  topicName: string;
  support: number;
}

export interface ConfusionMatrixEntry {
  trueTopicId: number;
  predictedTopicId: number;
  count: number;
}

export interface CassandraGrpcTrainMetrics {
  numClasses: number;
  trainRows: number;
  testRows: number;
  accuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  microPrecision: number;
  microRecall: number;
  microF1: number;
  trainingTimeSeconds: number;
  topClasses: ClassSupport[];
  confusionMatrix: ConfusionMatrixEntry[];
  trainedAt: string;
}

export interface CassandraGrpcTrainJobStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt?: number | null;
  finishedAt?: number | null;
  error?: string | null;
  result?: CassandraGrpcTrainMetrics | null;
}

export interface CassandraGrpcPredictResult {
  topicId: number;
  topicName: string;
  confidence: number;
  preprocessingTimeMs: number;
  grpcRoundtripMs: number;
  note: string;
}

export interface CassandraGrpcLogEntry {
  id: string;
  timestamp: string;
  method: 'Predict' | 'Train' | 'GetStatus';
  status: 'OK' | 'UNAVAILABLE' | 'FAILED_PRECONDITION' | 'INTERNAL';
  latencyMs: number;
  detail: string;
}
