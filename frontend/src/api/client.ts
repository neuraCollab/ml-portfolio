import { AutoTopicConfig, AutoTopicDatasetInfo, AutoTopicFullPipelineStatus, AutoTopicResults, CameraCalibration, EcgAnalysisResult, EcgEvaluationResult, EcgHealth } from '../types';

const API_BASE_URL: string = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';
const WS_BASE_URL: string = API_BASE_URL.replace(/^http/, 'ws');

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (err) {
    throw new ApiError(0, 'Could not reach the backend API. Is it running?');
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // response body wasn't JSON; keep statusText
    }
    throw new ApiError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

export function analyzeTexts(texts: string[], config: AutoTopicConfig): Promise<AutoTopicResults> {
  return request<AutoTopicResults>('/api/autotopic/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, config }),
  });
}

export function analyzeCsv(file: File, textColumn: string, config: AutoTopicConfig): Promise<AutoTopicResults> {
  const form = new FormData();
  form.append('file', file);
  form.append('text_column', textColumn);
  form.append('config', JSON.stringify(config));
  return request<AutoTopicResults>('/api/autotopic/analyze-csv', {
    method: 'POST',
    body: form,
  });
}

export function getAutoTopicDatasetInfo(): Promise<AutoTopicDatasetInfo> {
  return request<AutoTopicDatasetInfo>('/api/autotopic/dataset-info');
}

export function analyzeDataset(sampleSize: number, seed: number, config: AutoTopicConfig): Promise<AutoTopicResults> {
  return request<AutoTopicResults>('/api/autotopic/analyze-dataset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleSize, seed, config }),
  });
}

export function startFullPipeline(config: AutoTopicConfig): Promise<AutoTopicFullPipelineStatus> {
  return request<AutoTopicFullPipelineStatus>('/api/autotopic/full-pipeline/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

export function getFullPipelineStatus(): Promise<AutoTopicFullPipelineStatus> {
  return request<AutoTopicFullPipelineStatus>('/api/autotopic/full-pipeline/status');
}

export interface UndistortResponse {
  originalImageBase64: string;
  undistortedImageBase64: string;
  imageWidth: number;
  imageHeight: number;
  processingTimeMs: number;
  note: string;
}

export function runUndistort(calibration: CameraCalibration): Promise<UndistortResponse> {
  return request<UndistortResponse>('/api/autopilot/undistort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calibration }),
  });
}

export interface LidarOverlayResponse {
  imageBase64: string;
  pointsGenerated: number;
  pointsInFrame: number;
  nearestDistanceM: number | null;
  warningActive: boolean;
  warningThresholdM: number;
  imageWidth: number;
  imageHeight: number;
  processingTimeMs: number;
  note: string;
}

export function runLidarOverlay(calibration: CameraCalibration, numPoints = 400, pointSize = 2, seed?: number): Promise<LidarOverlayResponse> {
  return request<LidarOverlayResponse>('/api/autopilot/lidar-overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calibration, numPoints, pointSize, seed }),
  });
}

export interface VehicleState {
  speed: number;
  yawRate: number;
  nearestObstacleDist: number;
  laneOffset: number;
}

export interface PredictActionResponse {
  action: { steering: number; throttle: number; brake: number };
  modelSource: 'pretrained-sac' | 'heuristic-fallback';
  modelName: string;
  observationShape: string;
  actionSpace: { low: { steering: number; throttle: number; brake: number }; high: { steering: number; throttle: number; brake: number } };
  clipped: { steering: boolean; throttle: boolean; brake: boolean };
  inferenceTimeMs: number;
  note: string;
}

export function predictAction(state: VehicleState): Promise<PredictActionResponse> {
  return request<PredictActionResponse>('/api/autopilot/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
}

export function ecgHealth(): Promise<EcgHealth> {
  return request<EcgHealth>('/api/ecg/health');
}

export function runEcgDemo(source: 'synthetic' | 'sample' | 'public', heartRate: number, seed?: number): Promise<EcgAnalysisResult> {
  return request<EcgAnalysisResult>('/api/ecg/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, heartRate, seed }),
  });
}

export function analyzeEcgUpload(file: File): Promise<EcgAnalysisResult> {
  const form = new FormData();
  form.append('file', file);
  return request<EcgAnalysisResult>('/api/ecg/analyze', { method: 'POST', body: form });
}

export function evaluateEcgDataset(file: File): Promise<EcgEvaluationResult> {
  const form = new FormData();
  form.append('file', file);
  return request<EcgEvaluationResult>('/api/ecg/evaluate', { method: 'POST', body: form });
}

export function evaluateEcgBundledDataset(): Promise<EcgEvaluationResult> {
  return request<EcgEvaluationResult>('/api/ecg/evaluate-bundled', { method: 'POST' });
}

export function openEcgLiveSocket(onMessage: (data: any) => void, onClose?: () => void): WebSocket {
  const ws = new WebSocket(`${WS_BASE_URL}/api/ecg/live`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed frames
    }
  };
  if (onClose) ws.onclose = onClose;
  return ws;
}
