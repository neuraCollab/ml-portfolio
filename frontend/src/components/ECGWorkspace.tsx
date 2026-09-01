import React, { useState, useRef, useEffect, useMemo } from 'react';
import { EcgAnalysisResult, EcgLeadName, EcgStage, ECG_LEAD_NAMES } from '../types';
import { runEcgDemo, analyzeEcgUpload, openEcgLiveSocket, ApiError } from '../api/client';
import { LoadingState } from './shared/LoadingState';
import { ErrorState } from './shared/ErrorState';
import { EmptyState } from './shared/EmptyState';
import { LeadSelector } from './ecg/LeadSelector';
import { ECGChart } from './ecg/ECGChart';
import { InferenceResult } from './ecg/InferenceResult';
import { SignalStatus } from './ecg/SignalStatus';
import { SignalMetricsPanel } from './ecg/SignalMetricsPanel';
import { EvaluationPanel } from './ecg/EvaluationPanel';
import { StaticResultsSection } from './ecg/StaticResultsSection';
import {
  HeartPulse, Play, Upload, Radio, FlaskConical, ShieldAlert,
  Cpu, Waves, Sliders, Info, ChevronDown, ChevronUp, ClipboardCheck,
} from 'lucide-react';

type Mode = 'demo' | 'live';

export const ECGWorkspace: React.FC = () => {
  const [mode, setMode] = useState<Mode>('demo');
  const [source, setSource] = useState<'sample' | 'synthetic' | 'public'>('sample');
  const [heartRate, setHeartRate] = useState(72);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedLead, setSelectedLead] = useState<EcgLeadName | 'all'>('all');
  const [stage, setStage] = useState<EcgStage>('raw');
  const [showEvaluation, setShowEvaluation] = useState(false);

  const [result, setResult] = useState<EcgAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveHardware, setLiveHardware] = useState<boolean | null>(null);
  const [liveLeads, setLiveLeads] = useState<Record<string, number[]>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const runDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = uploadFile ? await analyzeEcgUpload(uploadFile) : await runEcgDemo(source, heartRate);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ECG analysis request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadFile(e.target.files?.[0] ?? null);
  };

  useEffect(() => {
    if (mode !== 'live') {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    setLiveStatus('Connecting...');
    setLiveHardware(null);
    setLiveLeads({});
    let receivedAnyMessage = false;
    const ws = openEcgLiveSocket(
      (data) => {
        receivedAnyMessage = true;
        if (data.type === 'status') {
          setLiveHardware(data.hardwareAvailable);
          setLiveStatus(data.message ?? (data.hardwareAvailable ? 'Streaming' : 'No hardware detected'));
          return;
        }
        setLiveHardware(true);
        setLiveStatus('Streaming live sensor data');
        setLiveLeads((prev) => {
          const next: Record<string, number[]> = {};
          for (const lead of ECG_LEAD_NAMES) {
            const arr = [...(prev[lead] ?? []), data[lead] ?? 0];
            next[lead] = arr.slice(-300);
          }
          return next;
        });
      },
      () => {
        // The server closes the socket right after sending its one status
        // message when no hardware is attached (see stream_live_ecg) -- that's
        // a normal, informative close, not a connection failure. Only show
        // the generic "unreachable" message if we never got anything at all.
        if (!receivedAnyMessage) {
          setLiveHardware(false);
          setLiveStatus('Could not reach the backend WebSocket endpoint. Is the backend running?');
        }
      }
    );
    wsRef.current = ws;
    return () => ws.close();
  }, [mode]);

  const hasLiveData = Object.values(liveLeads).some((arr) => arr.length > 1);

  const displayedLeads = useMemo(() => {
    if (!result) return {} as Record<EcgLeadName, number[]>;
    if (stage === 'filtered') return result.filteredLeads;
    if (stage === 'processed') return result.processedLeads;
    return result.leads;
  }, [result, stage]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950/60 to-slate-900 rounded-2xl p-6 border border-rose-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-rose-500/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider">
            <HeartPulse className="w-4 h-4" />
            <span>ECG Edge AI</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Raspberry Pi 5 ECG Monitor & Rhythm Classifier</h2>
          <p className="text-sm text-slate-300 max-w-2xl">
            Two AD8232 + Arduino Nano units stream raw ECG to a Raspberry Pi 5, which reconstructs
            the standard 6-lead frontal ECG (I, II, III, aVR, aVL, aVF) via Einthoven's/Goldberger's
            equations and classifies 19 rhythm/conduction patterns with a local, CPU-only PyTorch
            model trained on PTB-XL.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
            <span className="flex items-center gap-1.5"><Waves className="w-3.5 h-3.5 text-rose-400" /> AD8232 &rarr; Arduino Nano &rarr; Pi 5</span>
            <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-rose-400" /> Filter &rarr; Lead reconstruction &rarr; ECGNet &rarr; Prediction</span>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mt-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Research/education prototype, not a certified medical device. Model output is a
              classification, not a medical diagnosis -- it must not be used for clinical decisions.</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setMode('demo')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                mode === 'demo' ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/25' : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>Demo Mode</span>
            </button>
            <button
              onClick={() => setMode('live')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                mode === 'live' ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/25' : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Live Hardware</span>
            </button>
          </div>
        </div>
      </div>

      {mode === 'live' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {hasLiveData ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <LeadSelector selected={selectedLead} onSelect={setSelectedLead} />
                <ECGChart leads={liveLeads} samplingRateHz={100} selectedLead={selectedLead} />
              </div>
            ) : (
              <EmptyState icon={Radio} title="Waiting for hardware" detail={liveStatus ?? 'Connecting to the live WebSocket endpoint...'} />
            )}
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <Radio className={`w-4 h-4 ${liveHardware ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span>Hardware Status</span>
              </div>
              <p className="text-xs text-slate-400">{liveStatus ?? 'Connecting...'}</p>
              {liveHardware === false && (
                <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
                  This is expected in the portfolio deployment -- the backend container has no AD8232/Arduino
                  attached. On a real Raspberry Pi 5 with both sensors plugged in, this same endpoint streams
                  live readings (see <span className="font-mono">raspberry-pi-ecg/README.md</span>). Try Demo Mode instead.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                  <Sliders className="w-4 h-4 text-rose-400" />
                  <span>Input</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  onClick={() => { setUploadFile(null); setSource('sample'); }}
                  className={`py-2 rounded-xl border font-medium transition ${!uploadFile && source === 'sample' ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Recorded sample
                </button>
                <button
                  onClick={() => { setUploadFile(null); setSource('synthetic'); }}
                  className={`py-2 rounded-xl border font-medium transition ${!uploadFile && source === 'synthetic' ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Synthetic
                </button>
                <button
                  onClick={() => { setUploadFile(null); setSource('public'); }}
                  title="A real, public, de-identified record from PTB-XL (PhysioNet, CC-BY 4.0) with real ground-truth labels"
                  className={`py-2 rounded-xl border font-medium transition ${!uploadFile && source === 'public' ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  Public PTB-XL example
                </button>
              </div>

              {!uploadFile && source === 'public' && (
                <p className="text-[10px] text-slate-500">
                  A real, public, de-identified ECG record from PTB-XL (PhysioNet, CC-BY 4.0) with
                  real ground-truth labels -- see raspberry-pi-ecg/data/README.md.
                </p>
              )}

              {!uploadFile && source === 'synthetic' && (
                <div>
                  <div className="flex justify-between mb-1 text-xs">
                    <span className="text-slate-400">Heart rate</span>
                    <span className="font-mono text-rose-400 font-bold">{heartRate} bpm</span>
                  </div>
                  <input type="range" min={40} max={180} value={heartRate} onChange={(e) => setHeartRate(Number(e.target.value))} className="w-full accent-rose-500 bg-slate-800" />
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <p className="text-xs text-slate-400">Or upload your own recording:</p>
                <input
                  type="file"
                  accept=".npy"
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs hover:file:bg-slate-700"
                />
                <p className="text-[10px] text-slate-500">Needs shape (1000, 6) or (6, 1000).</p>
                {uploadFile && (
                  <div className="flex items-center justify-between text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-300 truncate">{uploadFile.name}</span>
                    <button onClick={() => setUploadFile(null)} className="text-slate-500 hover:text-slate-300">Clear</button>
                  </div>
                )}
              </div>

              <button
                onClick={runDemo}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-medium rounded-xl shadow-lg shadow-rose-500/25 transition disabled:opacity-50"
              >
                {uploadFile ? <Upload className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                <span>{loading ? 'Running...' : uploadFile ? `Analyze ${uploadFile.name}` : 'Run Analysis'}</span>
              </button>
            </div>

            {result && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm pb-2 border-b border-slate-800">
                  <Info className="w-4 h-4 text-rose-400" />
                  <span>Technical Details</span>
                </div>
                <dl className="text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between"><dt className="text-slate-500">Model</dt><dd className="text-slate-300">ECGNet (Conv1d x4 + FC)</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Trained on</dt><dd className="text-slate-300">PTB-XL (~21.8k records)</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Input shape</dt><dd className="text-slate-300">(1, 6, 1000)</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Preprocessing</dt><dd className="text-slate-300">0.5-40Hz bandpass + z-score</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Device</dt><dd className="text-slate-300">CPU (TorchScript)</dd></div>
                </dl>
              </div>
            )}
          </div>

          {/* Right: visualization + results */}
          <div className="lg:col-span-8 space-y-6">
            {loading ? (
              <LoadingState title="Running the ECG pipeline..." detail="Bandpass filter -> z-score -> ECGNet forward pass" accent="indigo" />
            ) : error ? (
              <ErrorState message={error} />
            ) : !result ? (
              <EmptyState icon={HeartPulse} title="No analysis yet" detail="Click Run Analysis to process a sample ECG through the real preprocessing and model pipeline." />
            ) : (
              <>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-100">ECG Visualization</h3>
                    <SignalStatus result={result} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <LeadSelector selected={selectedLead} onSelect={setSelectedLead} />
                    <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
                      {(['raw', 'filtered', 'processed'] as EcgStage[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setStage(s)}
                          title={
                            s === 'raw' ? 'Signal before any preprocessing' :
                            s === 'filtered' ? '0.5-40Hz Butterworth bandpass applied, not yet normalized' :
                            'Bandpass + per-lead z-score -- exactly what the model sees'
                          }
                          className={`px-3 py-1 rounded-lg font-medium capitalize transition ${
                            stage === s ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ECGChart leads={displayedLeads} samplingRateHz={result.samplingRateHz} selectedLead={selectedLead} />
                  <p className="text-[10px] text-slate-500">
                    {stage === 'raw' && 'Signal as received, before any processing.'}
                    {stage === 'filtered' && 'After the real 0.5-40Hz Butterworth bandpass filter -- baseline drift and high-frequency noise removed, amplitude not yet normalized.'}
                    {stage === 'processed' && 'After bandpass + per-lead z-score normalization -- this is the exact array fed into ECGNet.'}
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-base font-bold text-slate-100 mb-4">Signal Metrics</h3>
                  <SignalMetricsPanel result={result} />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-base font-bold text-slate-100 mb-4">Model Result</h3>
                  <InferenceResult result={result} />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <button
                    onClick={() => setShowEvaluation((v) => !v)}
                    className="w-full flex items-center justify-between text-base font-bold text-slate-100"
                  >
                    <span className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-rose-400" /> Evaluation (real metrics on a labeled dataset)</span>
                    {showEvaluation ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {showEvaluation && <div className="mt-4"><EvaluationPanel /></div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <StaticResultsSection />
    </div>
  );
};
