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
import { useTranslation } from '../i18n/I18nContext';
import {
  HeartPulse, Play, Upload, Radio, FlaskConical, ShieldAlert,
  Cpu, Waves, Sliders, Info, ChevronDown, ChevronUp, ClipboardCheck,
} from 'lucide-react';

type Mode = 'demo' | 'live';

export const ECGWorkspace: React.FC = () => {
  const { t } = useTranslation();
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
      setError(err instanceof ApiError ? err.message : t('ecg.workspace.analysisErrorFallback'));
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
    setLiveStatus(t('ecg.workspace.liveConnectingStatus'));
    setLiveHardware(null);
    setLiveLeads({});
    let receivedAnyMessage = false;
    const ws = openEcgLiveSocket(
      (data) => {
        receivedAnyMessage = true;
        if (data.type === 'status') {
          setLiveHardware(data.hardwareAvailable);
          setLiveStatus(data.message ?? (data.hardwareAvailable ? t('ecg.workspace.liveStreamingStatus') : t('ecg.workspace.liveNoHardwareStatus')));
          return;
        }
        setLiveHardware(true);
        setLiveStatus(t('ecg.workspace.liveStreamingDataStatus'));
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
          setLiveStatus(t('ecg.workspace.liveUnreachableStatus'));
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
            <span>{t('ecg.workspace.eyebrow')}</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{t('ecg.workspace.title')}</h2>
          <p className="text-sm text-slate-300 max-w-2xl">
            {t('ecg.workspace.description')}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
            <span className="flex items-center gap-1.5"><Waves className="w-3.5 h-3.5 text-rose-400" /> {t('ecg.workspace.hardwarePipelineLabel')}</span>
            <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-rose-400" /> {t('ecg.workspace.modelPipelineLabel')}</span>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 mt-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t('ecg.workspace.disclaimerText')}</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setMode('demo')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                mode === 'demo' ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/25' : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>{t('ecg.workspace.demoModeButton')}</span>
            </button>
            <button
              onClick={() => setMode('live')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                mode === 'live' ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/25' : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>{t('ecg.workspace.liveHardwareButton')}</span>
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
              <EmptyState icon={Radio} title={t('ecg.workspace.liveWaitingTitle')} detail={liveStatus ?? t('ecg.workspace.liveConnectingDetail')} />
            )}
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <Radio className={`w-4 h-4 ${liveHardware ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span>{t('ecg.workspace.hardwareStatusLabel')}</span>
              </div>
              <p className="text-xs text-slate-400">{liveStatus ?? t('ecg.workspace.liveConnectingStatus')}</p>
              {liveHardware === false && (
                <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
                  {t('ecg.workspace.liveExpectedPrefix')}<span className="font-mono">raspberry-pi-ecg/README.md</span>{t('ecg.workspace.liveExpectedSuffix')}
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
                  <span>{t('ecg.workspace.inputHeading')}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  onClick={() => { setUploadFile(null); setSource('sample'); }}
                  className={`py-2 rounded-xl border font-medium transition ${!uploadFile && source === 'sample' ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  {t('ecg.workspace.sourceRecordedSample')}
                </button>
                <button
                  onClick={() => { setUploadFile(null); setSource('synthetic'); }}
                  className={`py-2 rounded-xl border font-medium transition ${!uploadFile && source === 'synthetic' ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  {t('ecg.workspace.sourceSynthetic')}
                </button>
                <button
                  onClick={() => { setUploadFile(null); setSource('public'); }}
                  title={t('ecg.workspace.sourcePublicTitle')}
                  className={`py-2 rounded-xl border font-medium transition ${!uploadFile && source === 'public' ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                >
                  {t('ecg.workspace.sourcePublicLabel')}
                </button>
              </div>

              {!uploadFile && source === 'public' && (
                <p className="text-[10px] text-slate-500">
                  {t('ecg.workspace.sourcePublicDetail')}
                </p>
              )}

              {!uploadFile && source === 'synthetic' && (
                <div>
                  <div className="flex justify-between mb-1 text-xs">
                    <span className="text-slate-400">{t('ecg.workspace.heartRateLabel')}</span>
                    <span className="font-mono text-rose-400 font-bold">{heartRate} bpm</span>
                  </div>
                  <input type="range" min={40} max={180} value={heartRate} onChange={(e) => setHeartRate(Number(e.target.value))} className="w-full accent-rose-500 bg-slate-800" />
                </div>
              )}

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <p className="text-xs text-slate-400">{t('ecg.workspace.uploadPrompt')}</p>
                <input
                  type="file"
                  accept=".npy"
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs hover:file:bg-slate-700"
                />
                <p className="text-[10px] text-slate-500">{t('ecg.workspace.uploadShapeHint')}</p>
                {uploadFile && (
                  <div className="flex items-center justify-between text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <span className="text-slate-300 truncate">{uploadFile.name}</span>
                    <button onClick={() => setUploadFile(null)} className="text-slate-500 hover:text-slate-300">{t('ecg.workspace.clearButton')}</button>
                  </div>
                )}
              </div>

              <button
                onClick={runDemo}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-medium rounded-xl shadow-lg shadow-rose-500/25 transition disabled:opacity-50"
              >
                {uploadFile ? <Upload className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                <span>{loading ? t('ecg.workspace.runningButton') : uploadFile ? t('ecg.workspace.analyzeButton', { filename: uploadFile.name }) : t('ecg.workspace.runAnalysisButton')}</span>
              </button>
            </div>

            {result && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm pb-2 border-b border-slate-800">
                  <Info className="w-4 h-4 text-rose-400" />
                  <span>{t('ecg.workspace.technicalDetailsHeading')}</span>
                </div>
                <dl className="text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between"><dt className="text-slate-500">{t('ecg.workspace.modelFieldLabel')}</dt><dd className="text-slate-300">{t('ecg.workspace.modelFieldValue')}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">{t('ecg.workspace.trainedOnFieldLabel')}</dt><dd className="text-slate-300">{t('ecg.workspace.trainedOnFieldValue')}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">{t('ecg.workspace.inputShapeFieldLabel')}</dt><dd className="text-slate-300">{t('ecg.workspace.inputShapeFieldValue')}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">{t('ecg.workspace.preprocessingFieldLabel')}</dt><dd className="text-slate-300">{t('ecg.workspace.preprocessingFieldValue')}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">{t('ecg.workspace.deviceFieldLabel')}</dt><dd className="text-slate-300">{t('ecg.workspace.deviceFieldValue')}</dd></div>
                </dl>
              </div>
            )}
          </div>

          {/* Right: visualization + results */}
          <div className="lg:col-span-8 space-y-6">
            {loading ? (
              <LoadingState title={t('ecg.workspace.pipelineLoadingTitle')} detail={t('ecg.workspace.pipelineLoadingDetail')} accent="indigo" />
            ) : error ? (
              <ErrorState message={error} />
            ) : !result ? (
              <EmptyState icon={HeartPulse} title={t('ecg.workspace.noAnalysisTitle')} detail={t('ecg.workspace.noAnalysisDetail')} />
            ) : (
              <>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-100">{t('ecg.workspace.visualizationHeading')}</h3>
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
                            s === 'raw' ? t('ecg.workspace.stageRawTitle') :
                            s === 'filtered' ? t('ecg.workspace.stageFilteredTitle') :
                            t('ecg.workspace.stageProcessedTitle')
                          }
                          className={`px-3 py-1 rounded-lg font-medium capitalize transition ${
                            stage === s ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {s === 'raw' ? t('ecg.workspace.stageRaw') : s === 'filtered' ? t('ecg.workspace.stageFiltered') : t('ecg.workspace.stageProcessed')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ECGChart leads={displayedLeads} samplingRateHz={result.samplingRateHz} selectedLead={selectedLead} />
                  <p className="text-[10px] text-slate-500">
                    {stage === 'raw' && t('ecg.workspace.stageRawDescription')}
                    {stage === 'filtered' && t('ecg.workspace.stageFilteredDescription')}
                    {stage === 'processed' && t('ecg.workspace.stageProcessedDescription')}
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-base font-bold text-slate-100 mb-4">{t('ecg.workspace.signalMetricsHeading')}</h3>
                  <SignalMetricsPanel result={result} />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-base font-bold text-slate-100 mb-4">{t('ecg.workspace.modelResultHeading')}</h3>
                  <InferenceResult result={result} />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <button
                    onClick={() => setShowEvaluation((v) => !v)}
                    className="w-full flex items-center justify-between text-base font-bold text-slate-100"
                  >
                    <span className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-rose-400" /> {t('ecg.workspace.evaluationToggleLabel')}</span>
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
