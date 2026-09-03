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
import { ArchitectureDiagram } from './ecg/ArchitectureDiagram';
import { ElectrodePlacementDiagram } from './ecg/ElectrodePlacementDiagram';
import { BaselineComparisonPanel } from './ecg/BaselineComparisonPanel';
import { RpiRuntimePanel } from './ecg/RpiRuntimePanel';
import { ProjectSection } from './shared/ProjectSection';
import { ProjectSectionNav } from './shared/ProjectSectionNav';
import { useTranslation } from '../i18n/I18nContext';
import {
  HeartPulse, Play, Upload, Radio, FlaskConical, ShieldAlert,
  Cpu, Waves, Sliders, Info, ChevronDown, ChevronUp, ClipboardCheck,
  Layers, Database, Workflow, GitCompare, Brain, Target, Bug, ShieldCheck,
  Camera, CheckCircle2, ListChecks, Wrench,
} from 'lucide-react';

const HARDWARE_PHOTO_PATH = 'static-results/ecg/hardware.jpg';
const ARCHITECTURE_STEP_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;

type Mode = 'demo' | 'live';
type LiveStatusKind = 'connecting' | 'streaming' | 'noHardware' | 'streamingData' | 'unreachable';

const ACCENT = 'text-rose-400';

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

  // The live-status text is derived at render time (see liveStatusText below)
  // rather than stored pre-translated, so that a language switch retranslates
  // it immediately without needing to tear down and reopen the WebSocket.
  const [liveStatusKind, setLiveStatusKind] = useState<LiveStatusKind | null>(null);
  const [liveStatusRawMessage, setLiveStatusRawMessage] = useState<string | null>(null);
  const [liveHardware, setLiveHardware] = useState<boolean | null>(null);
  const [liveLeads, setLiveLeads] = useState<Record<string, number[]>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const SECTION_ITEMS = useMemo(
    () => [
      { id: 'overview', label: t('common.projectSections.overview'), icon: HeartPulse },
      { id: 'architecture', label: t('common.projectSections.architecture'), icon: Layers },
      { id: 'dataset', label: t('common.projectSections.dataset'), icon: Database },
      { id: 'methodology', label: t('common.projectSections.methodology'), icon: Workflow },
      { id: 'baseline', label: t('common.projectSections.baseline'), icon: GitCompare },
      { id: 'model', label: t('common.projectSections.model'), icon: Brain },
      { id: 'metrics', label: t('common.projectSections.metrics'), icon: Target },
      { id: 'errorAnalysis', label: t('common.projectSections.errorAnalysis'), icon: Bug },
      { id: 'regressionTests', label: t('common.projectSections.regressionTests'), icon: ShieldCheck },
      { id: 'results', label: t('common.projectSections.results'), icon: ClipboardCheck },
    ],
    [t]
  );

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
    setLiveStatusKind('connecting');
    setLiveStatusRawMessage(null);
    setLiveHardware(null);
    setLiveLeads({});
    let receivedAnyMessage = false;
    const ws = openEcgLiveSocket(
      (data) => {
        receivedAnyMessage = true;
        if (data.type === 'status') {
          setLiveHardware(data.hardwareAvailable);
          if (data.message) {
            // Server-supplied diagnostic text (e.g. a serial-port error) --
            // shown verbatim, not translated client-side.
            setLiveStatusRawMessage(data.message);
            setLiveStatusKind(null);
          } else {
            setLiveStatusRawMessage(null);
            setLiveStatusKind(data.hardwareAvailable ? 'streaming' : 'noHardware');
          }
          return;
        }
        setLiveHardware(true);
        setLiveStatusRawMessage(null);
        setLiveStatusKind('streamingData');
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
          setLiveStatusRawMessage(null);
          setLiveStatusKind('unreachable');
        }
      }
    );
    wsRef.current = ws;
    return () => ws.close();
    // Intentionally keyed on `mode` only: this effect owns the WebSocket
    // connection lifecycle. It must NOT re-run on language change, or every
    // language switch while live would tear down and reopen the connection
    // (openEcgLiveSocket() below creates a brand-new WebSocket each time this
    // effect runs), which would interrupt a real hardware stream. Instead,
    // the displayed status text is re-derived from `liveStatusKind` at render
    // time via `t()` in `liveStatusText` below, so it retranslates on
    // language change without touching the connection.
  }, [mode]);

  const liveStatusText = useMemo(() => {
    if (liveStatusRawMessage) return liveStatusRawMessage;
    switch (liveStatusKind) {
      case 'connecting': return t('ecg.workspace.liveConnectingStatus');
      case 'streaming': return t('ecg.workspace.liveStreamingStatus');
      case 'noHardware': return t('ecg.workspace.liveNoHardwareStatus');
      case 'streamingData': return t('ecg.workspace.liveStreamingDataStatus');
      case 'unreachable': return t('ecg.workspace.liveUnreachableStatus');
      default: return null;
    }
  }, [liveStatusKind, liveStatusRawMessage, t]);

  const hasLiveData = Object.values(liveLeads).some((arr) => arr.length > 1);

  const displayedLeads = useMemo(() => {
    if (!result) return {} as Record<EcgLeadName, number[]>;
    if (stage === 'filtered') return result.filteredLeads;
    if (stage === 'processed') return result.processedLeads;
    return result.leads;
  }, [result, stage]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-12 lg:items-start">
      <ProjectSectionNav items={SECTION_ITEMS} accentClassName={ACCENT} />

      <div className="flex-1 min-w-0 space-y-6">
        <ProjectSection id="overview" title={t('common.projectSections.overview')} icon={HeartPulse} accentClassName={ACCENT}>
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

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2 mt-6">
            <h3 className="text-base font-bold text-slate-100">{t('common.projectSections.roleContribution')}</h3>
            <p className="text-sm text-slate-400 max-w-3xl">{t('ecg.roleContribution.body')}</p>
          </div>
        </ProjectSection>

        <ProjectSection id="architecture" title={t('common.projectSections.architecture')} icon={Layers} accentClassName={ACCENT}>
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider">
                <Layers className="w-4 h-4" />
                <span>{t('ecg.architecture.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.architecture.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl">{t('ecg.architecture.intro')}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <figure className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Camera className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('ecg.architecture.photoHeading')}</span>
                </div>
                <img
                  src={`${(import.meta as any).env.BASE_URL}${HARDWARE_PHOTO_PATH}`}
                  alt={t('ecg.staticResults.hardwareImageAlt')}
                  className="w-full h-auto rounded-xl border border-slate-800 object-cover"
                />
                <figcaption className="text-[11px] text-slate-500">{t('ecg.architecture.photoCaption')}</figcaption>
              </figure>

              <figure className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Workflow className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('ecg.architecture.diagramHeading')}</span>
                </div>
                <ArchitectureDiagram />
              </figure>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <ListChecks className="w-4 h-4 text-rose-400" />
                <span>{t('ecg.architecture.howItWorksHeading')}</span>
              </div>
              <ol className="space-y-3">
                {ARCHITECTURE_STEP_KEYS.map((key, idx) => (
                  <li key={key} className="flex items-start gap-3 text-xs text-slate-400">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-bold font-mono flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{t(`ecg.architecture.steps.${key}` as any)}</span>
                  </li>
                ))}
              </ol>
            </div>

            <figure className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-slate-200 mb-3">{t('ecg.electrodes.heading')}</h3>
              <ElectrodePlacementDiagram />
              <figcaption className="text-[11px] text-slate-500 mt-3 max-w-xl mx-auto">{t('ecg.electrodes.caption')}</figcaption>
            </figure>
          </div>
        </ProjectSection>

        {/* Dataset: the demo-mode source picker (recorded sample / synthetic /
            public / upload) is real dataset-selection content, but it lives
            entangled inside the live-vs-demo mode grid below (see Model
            section) alongside the WebSocket-sensitive live view. Pulling it
            out would mean either duplicating it or changing when it's shown
            relative to the Demo/Live toggle, so per the "don't force an
            extraction that risks a layout/behavior bug" rule it stays in
            place and this section is a stub. */}
        <ProjectSection id="dataset" title={t('common.projectSections.dataset')} icon={Database} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Database className="w-4 h-4" />
                <span>{t('ecg.datasetSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.datasetSection.title')}</h2>
              <p className="text-xs text-slate-500 mt-1 italic">{t('ecg.datasetSection.citation')}</p>
              <p className="text-xs text-slate-500">{t('ecg.datasetSection.licenseNote')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-200">{t('ecg.datasetSection.trainingHeading')}</h3>
                <p className="text-[11px] text-slate-500 mt-1">{t('ecg.datasetSection.trainingBody')}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-200">{t('ecg.datasetSection.evalHeading')}</h3>
                <p className="text-[11px] text-slate-500 mt-1">{t('ecg.datasetSection.evalBody')}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-slate-200">{t('ecg.datasetSection.calibrationHeading')}</h3>
                <p className="text-[11px] text-slate-500 mt-1">{t('ecg.datasetSection.calibrationBody')}</p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-xs font-bold text-slate-200">{t('ecg.datasetSection.labelRuleHeading')}</h3>
              <p className="text-[11px] text-slate-500 mt-1 max-w-3xl">{t('ecg.datasetSection.labelRuleBody')}</p>
            </div>
          </div>
        </ProjectSection>

        {/* Methodology: likewise, the "technical details" model-card block
            (preprocessing steps, input shape, device) is nested inside the
            same mode-gated demo grid and only appears after a result -- left
            in place for the same reason as Dataset above. */}
        <ProjectSection id="methodology" title={t('common.projectSections.methodology')} icon={Workflow} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Workflow className="w-4 h-4" />
                <span>{t('ecg.methodologySection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.methodologySection.title')}</h2>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{t('ecg.methodologySection.pipelineHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('ecg.methodologySection.pipelineBody')}</p>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('ecg.methodologySection.thresholdHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('ecg.methodologySection.thresholdBody')}</p>
            </div>
          </div>
        </ProjectSection>

        <ProjectSection id="baseline" title={t('common.projectSections.baseline')} icon={GitCompare} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <GitCompare className="w-4 h-4" />
                <span>{t('ecg.baselineSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.baselineSection.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('ecg.baselineSection.intro')}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-slate-400">
              {t('ecg.baselineSection.caveat')}
            </div>
            <BaselineComparisonPanel />
          </div>
        </ProjectSection>

        <ProjectSection id="model" title={t('common.projectSections.model')} icon={Brain} accentClassName={ACCENT}>
          {mode === 'live' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                {hasLiveData ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <LeadSelector selected={selectedLead} onSelect={setSelectedLead} />
                    <ECGChart leads={liveLeads} samplingRateHz={100} selectedLead={selectedLead} />
                  </div>
                ) : (
                  <EmptyState icon={Radio} title={t('ecg.workspace.liveWaitingTitle')} detail={liveStatusText ?? t('ecg.workspace.liveConnectingDetail')} />
                )}
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                    <Radio className={`w-4 h-4 ${liveHardware ? 'text-emerald-400' : 'text-amber-400'}`} />
                    <span>{t('ecg.workspace.hardwareStatusLabel')}</span>
                  </div>
                  <p className="text-xs text-slate-400">{liveStatusText ?? t('ecg.workspace.liveConnectingStatus')}</p>
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
        </ProjectSection>

        {/* Metrics: real per-run signal metrics are shown via
            SignalMetricsPanel inside the Model section above, as one of
            several results that appear together once a run completes
            (chart / metrics / inference / evaluation). Splitting that panel
            out on its own would break up that "all results appear together"
            cluster, so it stays there and this section is a stub. */}
        <ProjectSection id="metrics" title={t('common.projectSections.metrics')} icon={Target} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Target className="w-4 h-4" />
                <span>{t('ecg.metricsSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.metricsSection.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('ecg.metricsSection.intro')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                'macroF1Label', 'microF1Label', 'macroPrecisionLabel', 'macroRecallLabel',
                'microPrecisionLabel', 'microRecallLabel', 'prAucMacroLabel', 'prAucMicroLabel',
                'subsetAccuracyLabel', 'hammingAccuracyLabel',
              ] as const).map((labelKey) => {
                const tooltipKey = labelKey.replace('Label', 'Tooltip') as
                  | 'subsetAccuracyTooltip' | 'hammingAccuracyTooltip' | 'microPrecisionTooltip' | 'microRecallTooltip' | 'microF1Tooltip'
                  | 'macroPrecisionTooltip' | 'macroRecallTooltip' | 'macroF1Tooltip' | 'prAucMacroTooltip' | 'prAucMicroTooltip';
                return (
                  <div key={labelKey} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                    <div className="text-xs font-semibold text-slate-200">{t(`ecg.evaluation.${labelKey}` as any)}</div>
                    <p className="text-[11px] text-slate-500 mt-1">{t(`ecg.evaluation.${tooltipKey}` as any)}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-2">{t('ecg.metricsSection.referenceHeading')}</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-[11px] text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">{t('ecg.evaluation.tableClassHeader')}</th>
                      <th className="py-2 px-3">{t('ecg.evaluation.tableSupportHeader')}</th>
                      <th className="py-2 px-3">{t('ecg.evaluation.tablePrecisionHeader')}</th>
                      <th className="py-2 px-3">{t('ecg.evaluation.tableRecallHeader')}</th>
                      <th className="py-2 px-3">{t('ecg.evaluation.tableF1Header')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {[
                      // Only raspberry-pi-ecg/data/README.md's explicitly documented
                      // numbers -- is_afib's F1 is the exact harmonic mean of its cited
                      // P/R (2*0.21*1.00/(0.21+1.00) = 0.347), not a separate citation.
                      // has_lafb's precision/F1 were never documented, so they show as
                      // not available rather than a guessed number.
                      { name: 'is_sinus_rhythm', support: 40, p: '0.64', r: '0.93', f1: '0.76' },
                      { name: 'is_afib', support: 13, p: '0.21', r: '1.00', f1: '0.35' },
                      { name: 'has_lafb', support: 11, p: null, r: '0.09', f1: null },
                    ].map((row) => (
                      <tr key={row.name}>
                        <td className="py-1.5 px-3 font-sans">{row.name}</td>
                        <td className="py-1.5 px-3">{row.support}</td>
                        <td className="py-1.5 px-3">{row.p ?? t('common.shared.notAvailable')}</td>
                        <td className="py-1.5 px-3">{row.r}</td>
                        <td className="py-1.5 px-3">{row.f1 ?? t('common.shared.notAvailable')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">{t('ecg.metricsSection.referenceNote')}</p>
            </div>

            <p className="text-[11px] text-rose-300/80">{t('ecg.metricsSection.pointerNote')}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 mt-6">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Cpu className="w-4 h-4" />
                <span>{t('ecg.runtime.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.runtime.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('ecg.runtime.intro')}</p>
            </div>
            <RpiRuntimePanel />
          </div>
        </ProjectSection>

        <ProjectSection id="errorAnalysis" title={t('common.projectSections.errorAnalysis')} icon={Bug} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Bug className="w-4 h-4" />
                <span>{t('ecg.errorAnalysisSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.errorAnalysisSection.title')}</h2>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-rose-400" />
                {t('ecg.errorAnalysisSection.bugsHeading')}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('ecg.errorAnalysisSection.bugsIntro')}</p>
            </div>

            <div className="space-y-3">
              {(['bug1', 'bug2', 'bug3'] as const).map((key) => (
                <div key={key} className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-4">
                  <h4 className="text-xs font-bold text-amber-300">{t(`ecg.errorAnalysisSection.${key}Title` as any)}</h4>
                  <p className="text-[11px] text-slate-400 mt-1.5">{t(`ecg.errorAnalysisSection.${key}Body` as any)}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('ecg.errorAnalysisSection.modelWeaknessHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('ecg.errorAnalysisSection.modelWeaknessBody')}</p>
            </div>
          </div>
        </ProjectSection>

        <ProjectSection id="regressionTests" title={t('common.projectSections.regressionTests')} icon={ShieldCheck} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>{t('ecg.regressionTestsSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.regressionTestsSection.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('ecg.regressionTestsSection.intro')}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-2">{t('ecg.regressionTestsSection.testListHeading')}</h3>
              <ul className="space-y-1.5">
                {(['test1', 'test2', 'test3', 'test4', 'test5'] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2 text-xs text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t(`ecg.regressionTestsSection.${key}` as any)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-bold text-emerald-300">19 / 19 passed</div>
                <div className="text-[11px] text-slate-500">
                  backend/tests/test_ecg_pipeline.py + test_ecg_schemas.py -- last run 2026-09-02, pytest 9.1.1
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {t('ecg.regressionTestsSection.howToRerun')}
              <code className="text-slate-400 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
                pytest backend/tests/test_ecg_pipeline.py backend/tests/test_ecg_schemas.py -v
              </code>
            </p>
          </div>
        </ProjectSection>

        <ProjectSection id="results" title={t('common.projectSections.results')} icon={ClipboardCheck} accentClassName={ACCENT}>
          <StaticResultsSection />
        </ProjectSection>
      </div>
    </div>
  );
};
