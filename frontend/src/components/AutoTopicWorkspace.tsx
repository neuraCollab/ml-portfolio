import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AutoTopicConfig,
  AutoTopicDatasetInfo,
  AutoTopicFullPipelineStatus,
  AutoTopicResults,
} from '../types';
import {
  SAMPLE_LOG_TEXTS,
  DEFAULT_CONFIG,
} from '../data/autotopicData';
import {
  analyzeTexts, analyzeCsv, analyzeDataset, getAutoTopicDatasetInfo,
  startFullPipeline, getFullPipelineStatus, ApiError,
} from '../api/client';
import { ResultsPanel } from './autotopic/ResultsPanel';
import { useTranslation } from '../i18n/I18nContext';
import {
  Sparkles,
  Play,
  Settings2,
  FileText,
  Sliders,
  Cpu,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  Info,
  Database,
  XCircle,
  CheckCircle2,
  Globe2,
  ClipboardCheck,
} from 'lucide-react';

const EMPTY_RESULTS: AutoTopicResults = {
  metrics: {
    documentsAnalyzed: 0, nTopics: 0, outlierCount: 0, outlierPercentage: 0,
    coherenceUci: 0, coherenceUmass: 0, diversity: 0, compositeScore: 0,
  },
  topics: [],
  documents: [],
  trials: [],
};

export const AutoTopicWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const PIPELINE_STEPS = useMemo(
    () => [
      t('autotopic.pipeline.stage1'),
      t('autotopic.pipeline.stage2'),
      t('autotopic.pipeline.stage3'),
      t('autotopic.pipeline.stage4'),
      t('autotopic.pipeline.stage5'),
    ],
    [t]
  );
  const [config, setConfig] = useState<AutoTopicConfig>(DEFAULT_CONFIG);
  const [rawLogs, setRawLogs] = useState<string[]>(SAMPLE_LOG_TEXTS);
  const [customText, setCustomText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const [results, setResults] = useState<AutoTopicResults>(EMPTY_RESULTS);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [datasetInfo, setDatasetInfo] = useState<AutoTopicDatasetInfo | null>(null);
  // Raw backend message (ApiError -- already in whatever language the backend
  // sent, out of scope for client-side translation) vs. a flag for the
  // generic "unreachable" case, whose text is derived via t() at render time
  // below rather than stored pre-translated -- otherwise it would get stuck
  // in the wrong language after a mount-time failure + later language switch.
  const [datasetInfoErrorMessage, setDatasetInfoErrorMessage] = useState<string | null>(null);
  const [datasetInfoHasGenericError, setDatasetInfoHasGenericError] = useState(false);
  const [datasetSampleSize, setDatasetSampleSize] = useState(300);

  const [fullPipelineStatus, setFullPipelineStatus] = useState<AutoTopicFullPipelineStatus | null>(null);
  const [fullPipelineError, setFullPipelineError] = useState<string | null>(null);
  const fullPipelinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Static snapshot of a real full-dataset run (backend/scripts/generate_static_results.py).
  // Fetched at runtime from public/ (not bundled into the JS -- it's ~500KB
  // of real topics/documents) so it's visible even if the live background
  // job above has never been run in this session or the backend restarted.
  const [staticFullPipelineResults, setStaticFullPipelineResults] = useState<AutoTopicResults | null>(null);
  // Boolean flag, not pre-translated text -- see datasetInfoHasGenericError above.
  const [staticFullPipelineHasError, setStaticFullPipelineHasError] = useState(false);

  useEffect(() => () => {
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    if (fullPipelinePollRef.current) clearInterval(fullPipelinePollRef.current);
  }, []);

  useEffect(() => {
    getAutoTopicDatasetInfo()
      .then(setDatasetInfo)
      .catch((err) => {
        if (err instanceof ApiError) {
          setDatasetInfoErrorMessage(err.message);
        } else {
          setDatasetInfoHasGenericError(true);
        }
      });
  }, []);

  useEffect(() => {
    const base = (import.meta as any).env.BASE_URL;
    fetch(`${base}static-results/autotopic/full_pipeline_results.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setStaticFullPipelineResults)
      .catch(() => setStaticFullPipelineHasError(true));
  }, []);

  // Derived at render time (see comment on datasetInfoHasGenericError above).
  const datasetInfoErrorText = datasetInfoErrorMessage ?? (datasetInfoHasGenericError ? t('autotopic.errors.backendUnreachable') : null);
  const staticFullPipelineErrorText = staticFullPipelineHasError ? t('autotopic.errors.staticResultsLoadFailed') : null;

  const pollFullPipeline = () => {
    if (fullPipelinePollRef.current) return;
    fullPipelinePollRef.current = setInterval(async () => {
      try {
        const s = await getFullPipelineStatus();
        setFullPipelineStatus(s);
        if (s.status !== 'running' && fullPipelinePollRef.current) {
          clearInterval(fullPipelinePollRef.current);
          fullPipelinePollRef.current = null;
        }
      } catch {
        // transient network hiccup -- keep polling, the next tick will retry
      }
    }, 5000);
  };

  // Recover an already-running or already-completed job on mount (the job
  // lives server-side, so a page reload shouldn't lose track of it).
  useEffect(() => {
    getFullPipelineStatus()
      .then((s) => {
        setFullPipelineStatus(s);
        if (s.status === 'running') pollFullPipeline();
      })
      .catch(() => {});
    return () => {
      if (fullPipelinePollRef.current) clearInterval(fullPipelinePollRef.current);
    };
  }, []);

  const handleStartFullPipeline = async () => {
    setFullPipelineError(null);
    try {
      const s = await startFullPipeline(config);
      setFullPipelineStatus(s);
      pollFullPipeline();
    } catch (err) {
      setFullPipelineError(err instanceof ApiError ? err.message : t('autotopic.errors.fullPipelineStartFailed'));
    }
  };

  const runPipeline = async (source: 'sample' | 'csv' | 'dataset') => {
    setIsProcessing(true);
    setError(null);
    setNote(null);

    let stepIdx = 0;
    setActiveStep(PIPELINE_STEPS[0]);
    stepIntervalRef.current = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, PIPELINE_STEPS.length - 1);
      setActiveStep(PIPELINE_STEPS[stepIdx]);
    }, 700);

    try {
      const newResults =
        source === 'dataset'
          ? await analyzeDataset(datasetSampleSize, 42, config)
          : source === 'csv' && csvFile
          ? await analyzeCsv(csvFile, 'log_text', config)
          : await analyzeTexts(rawLogs, config);
      setResults(newResults);
      setNote(newResults.note ?? null);
      setHasRun(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('autotopic.errors.pipelineRunFailed');
      setError(message);
    } finally {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      setIsProcessing(false);
      setActiveStep(null);
    }
  };

  const handleRunPipeline = () => runPipeline(csvFile ? 'csv' : 'sample');
  const handleRunOnDataset = () => runPipeline('dataset');

  const handleAddCustomLog = (e: React.FormEvent) => {
    e.preventDefault();
    // One line = one document, so pasting several documents at once (not
    // just a single log line) adds them all in one go.
    const lines = customText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setRawLogs((prev) => [...lines, ...prev]);
    setCsvFile(null);
    setCustomText('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setCsvFile(file);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(results, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `autotopic_report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 rounded-2xl p-6 border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-indigo-500/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>{t('autotopic.banner.eyebrow')}</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t('autotopic.banner.title')}
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              {t('autotopic.banner.description')}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleRunPipeline}
              disabled={isProcessing}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('autotopic.banner.processingLabel')}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>{csvFile ? t('autotopic.banner.analyzeFileLabel', { fileName: csvFile.name }) : t('autotopic.banner.executeButtonLabel')}</span>
                </>
              )}
            </button>
            <button
              onClick={handleExportJson}
              disabled={!hasRun}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-xl transition text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              <span>{t('autotopic.banner.exportJsonButton')}</span>
            </button>
          </div>
        </div>

        {/* Processing Progress Status Indicator */}
        {isProcessing && activeStep && (
          <div className="mt-4 pt-4 border-t border-indigo-500/20 flex items-center space-x-3 animate-pulse">
            <Cpu className="w-5 h-5 text-indigo-400 animate-spin" />
            <span className="text-sm font-mono text-indigo-300">{activeStep}</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mt-4 pt-4 border-t border-red-500/20 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-300">
              <span className="font-semibold">{t('autotopic.banner.pipelineFailedPrefix')}</span>
              {error}
            </div>
          </div>
        )}

        {/* Transparency note about real pipeline behavior (e.g. dropped documents) */}
        {!error && note && (
          <div className="mt-4 pt-4 border-t border-indigo-500/20 flex items-start space-x-3">
            <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">{note}</div>
          </div>
        )}

        {/* Real dataset provenance, when results came from analyze-dataset */}
        {!error && results.datasetInfo && (
          <div className="mt-4 pt-4 border-t border-emerald-500/20 flex items-start space-x-3">
            <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              {t('autotopic.banner.datasetProvenance.prefix')}
              <span className="font-mono text-emerald-400">{results.datasetInfo.sampledRows}</span>
              {t('autotopic.banner.datasetProvenance.middle')}
              <span className="font-mono text-emerald-400">{results.datasetInfo.totalRows?.toLocaleString()}</span>
              {t('autotopic.banner.datasetProvenance.rowsLoadedFrom')}
              <span className="font-mono text-slate-400">{results.datasetInfo.resolvedPath}</span>
              {t('autotopic.banner.datasetProvenance.suffix')}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Control Drawer vs Results Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Hyperparameters & Pipeline Controls (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Cleaning Pipeline Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>{t('autotopic.config.cleaningHeading')}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">stages/cleaning.py</span>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">{t('autotopic.config.removeHtmlLabel')}</span>
                <input
                  type="checkbox"
                  checked={config.removeHtml}
                  onChange={(e) => setConfig({ ...config, removeHtml: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">{t('autotopic.config.removeEmojisLabel')}</span>
                <input
                  type="checkbox"
                  checked={config.removeEmojis}
                  onChange={(e) => setConfig({ ...config, removeEmojis: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">{t('autotopic.config.removeCodeLabel')}</span>
                <input
                  type="checkbox"
                  checked={config.removeCode}
                  onChange={(e) => setConfig({ ...config, removeCode: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">{t('autotopic.config.removeLlmPrefixLabel')}</span>
                <input
                  type="checkbox"
                  checked={config.removeLlmPrefix}
                  onChange={(e) => setConfig({ ...config, removeLlmPrefix: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          {/* BERTopic & Optuna Parameters */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <Settings2 className="w-4 h-4 text-purple-400" />
                <span>{t('autotopic.config.bertopicHeading')}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">config.yaml</span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">min_topic_size (HDBSCAN)</span>
                  <span className="font-mono text-indigo-400 font-bold">{config.minTopicSize}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="20"
                  value={config.minTopicSize}
                  onChange={(e) => setConfig({ ...config, minTopicSize: Number(e.target.value) })}
                  className="w-full accent-indigo-500 bg-slate-800"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">umap_n_neighbors</span>
                  <span className="font-mono text-indigo-400 font-bold">{config.umapNeighbors}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={config.umapNeighbors}
                  onChange={(e) => setConfig({ ...config, umapNeighbors: Number(e.target.value) })}
                  className="w-full accent-indigo-500 bg-slate-800"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">{t('autotopic.config.topNWordsLabel')}</span>
                  <span className="font-mono text-indigo-400 font-bold">{config.topNWords}</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="15"
                  value={config.topNWords}
                  onChange={(e) => setConfig({ ...config, topNWords: Number(e.target.value) })}
                  className="w-full accent-indigo-500 bg-slate-800"
                />
              </div>

              <div>
                <span className="text-slate-400 block mb-1">{t('autotopic.config.languageModeLabel')}</span>
                <select
                  value={config.languageMode}
                  onChange={(e) => setConfig({ ...config, languageMode: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:border-indigo-500"
                >
                  <option value="mixed">{t('autotopic.config.languageModeMixed')}</option>
                  <option value="ru">{t('autotopic.config.languageModeRu')}</option>
                  <option value="en">{t('autotopic.config.languageModeEn')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Upload your own CSV */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>{t('autotopic.upload.heading')}</span>
            </div>
            <p className="text-xs text-slate-400">
              {t('autotopic.upload.helpPrefix')}<code className="text-slate-300">log_text</code>{t('autotopic.upload.helpSuffix', { count: rawLogs.length })}
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs hover:file:bg-slate-700"
            />
            {csvFile && (
              <div className="flex items-center justify-between text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                <span className="text-slate-300 truncate">{csvFile.name}</span>
                <button onClick={() => setCsvFile(null)} className="text-slate-500 hover:text-slate-300">
                  {t('autotopic.upload.clearButton')}
                </button>
              </div>
            )}
          </div>

          {/* Real Dataset (configurable location, e.g. AutoTopic/data/raw/labeled_requests.parquet) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>{t('autotopic.dataset.heading')}</span>
            </div>

            {datasetInfoErrorText ? (
              <p className="text-xs text-red-400">{datasetInfoErrorText}</p>
            ) : !datasetInfo ? (
              <p className="text-xs text-slate-500">{t('autotopic.dataset.checkingLocation')}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-1.5 text-xs">
                  {datasetInfo.exists ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <span className="text-slate-300">
                    {datasetInfo.exists
                      ? t('autotopic.dataset.foundRows', { count: datasetInfo.totalRows?.toLocaleString() ?? '?' })
                      : t('autotopic.dataset.notFound')}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 font-mono break-all">
                  {datasetInfo.resolvedPath}
                </div>
                <p className="text-[10px] text-slate-500">
                  {t('autotopic.dataset.envVarNote.prefix')}<code className="text-slate-400">AUTOTOPIC_DATA_URL</code>
                  {t('autotopic.dataset.envVarNote.middle')}
                  <span className="font-mono text-slate-400">{datasetInfo.configuredLocation}</span>
                  {t('autotopic.dataset.envVarNote.localPathSuffix')}
                  <span className="text-amber-400">{t('autotopic.dataset.envVarNote.replaceHint')}</span>
                  {t('autotopic.dataset.envVarNote.seeSuffix')}<code className="text-slate-400">AutoTopic/data/README.md</code>.
                </p>
              </div>
            )}

            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span className="text-slate-400">{t('autotopic.dataset.sampleSizeLabel')}</span>
                <span className="font-mono text-emerald-400 font-bold">{datasetSampleSize}</span>
              </div>
              <input
                type="range"
                min={10}
                max={1000}
                step={10}
                value={datasetSampleSize}
                onChange={(e) => setDatasetSampleSize(Number(e.target.value))}
                className="w-full accent-emerald-500 bg-slate-800"
              />
            </div>

            <button
              onClick={handleRunOnDataset}
              disabled={isProcessing || !datasetInfo?.exists}
              className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition"
            >
              {t('autotopic.dataset.runOnDatasetButton')}
            </button>
          </div>

          {/* Add Custom Log Entry */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>{t('autotopic.customLog.heading')}</span>
            </div>

            <form onSubmit={handleAddCustomLog} className="space-y-3">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={t('autotopic.customLog.placeholder')}
                className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="submit"
                disabled={!customText.trim()}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
              >
                {t('autotopic.customLog.addButton', { count: rawLogs.length })}
              </button>
            </form>
          </div>

        </div>

        {/* Right Column: Results & Analytics Dashboard (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {isProcessing ? (
            <div className="bg-slate-900 border border-dashed border-indigo-500/30 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <h3 className="text-slate-300 font-semibold">{t('autotopic.demo.runningHeading')}</h3>
              <p className="text-xs text-slate-500 max-w-sm">{activeStep}</p>
            </div>
          ) : !hasRun ? (
            <div className="bg-slate-900 border border-dashed border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <Sparkles className="w-8 h-8 text-slate-600" />
              <h3 className="text-slate-300 font-semibold">{t('autotopic.demo.noResultsHeading')}</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                {t('autotopic.demo.noResultsPrefix')}<span className="text-indigo-400 font-medium">{t('autotopic.banner.executeButtonLabel')}</span>
                {t('autotopic.demo.noResultsSuffix', { count: rawLogs.length })}
              </p>
            </div>
          ) : (
            <ResultsPanel results={results} />
          )}

        </div>

      </div>

      {/* Full Dataset Pipeline: real end-to-end run on every real row in the
          configured dataset (see AutoTopic/data/README.md), not a capped
          sample. This is a genuinely long-running job on CPU, so it runs as
          a background job on the backend rather than inside this request. */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 rounded-2xl p-6 border border-emerald-500/20 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
              <Globe2 className="w-4 h-4" />
              <span>{t('autotopic.fullPipeline.eyebrow')}</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {t('autotopic.fullPipeline.title')}
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              {t('autotopic.fullPipeline.descriptionPrefix')}
              {datasetInfo ? (
                <span className="font-mono text-emerald-400">{datasetInfo.resolvedPath}</span>
              ) : (
                t('autotopic.fullPipeline.configuredDatasetFallback')
              )}
              {t('autotopic.fullPipeline.descriptionMiddle')}<code className="text-slate-400">AutoTopic/main.py</code>
              {t('autotopic.fullPipeline.descriptionSuffix')}
            </p>
          </div>
          <button
            onClick={handleStartFullPipeline}
            disabled={fullPipelineStatus?.status === 'running' || !datasetInfo?.exists}
            className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {fullPipelineStatus?.status === 'running' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t('autotopic.fullPipeline.runningButton')}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>{t('autotopic.fullPipeline.runButton')}</span>
              </>
            )}
          </button>
        </div>

        {fullPipelineError && (
          <div className="flex items-start space-x-3 pt-4 border-t border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-300">{fullPipelineError}</div>
          </div>
        )}

        {fullPipelineStatus && fullPipelineStatus.status !== 'idle' && (
          <div className="pt-4 border-t border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                {fullPipelineStatus.status === 'running' && (fullPipelineStatus.stage ?? t('autotopic.fullPipeline.workingFallback'))}
                {fullPipelineStatus.status === 'completed' && t('autotopic.fullPipeline.completedStatus')}
                {fullPipelineStatus.status === 'failed' && t('autotopic.fullPipeline.failedStatus')}
              </span>
              {fullPipelineStatus.progressPercent != null && (
                <span className="text-emerald-400">{fullPipelineStatus.progressPercent.toFixed(0)}%</span>
              )}
            </div>
            {fullPipelineStatus.status === 'running' && (
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                  style={{ width: `${fullPipelineStatus.progressPercent ?? 0}%` }}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400 font-mono">
              {fullPipelineStatus.totalRows != null && (
                <span>{t('autotopic.fullPipeline.totalRows', { count: fullPipelineStatus.totalRows.toLocaleString() })}</span>
              )}
              {fullPipelineStatus.survivingRows != null && (
                <span>{t('autotopic.fullPipeline.surviving', { count: fullPipelineStatus.survivingRows.toLocaleString() })}</span>
              )}
              {fullPipelineStatus.elapsedSeconds != null && (
                <span>{t('autotopic.fullPipeline.elapsed', { minutes: (fullPipelineStatus.elapsedSeconds / 60).toFixed(1) })}</span>
              )}
            </div>
            {fullPipelineStatus.status === 'failed' && fullPipelineStatus.error && (
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{fullPipelineStatus.error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full-dataset results: a single spot, not two. Prefers a result from
          a job that JUST completed live in this session (freshest data) and
          falls back to the saved snapshot (backend/scripts/generate_static_results.py)
          otherwise, so this is always visible without duplicating the same
          numbers/charts in two places when both happen to be the same run. */}
      {(() => {
        const liveResult = fullPipelineStatus?.status === 'completed' ? fullPipelineStatus.result : null;
        const effectiveResults = liveResult ?? staticFullPipelineResults;
        const isLive = !!liveResult;
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider">
              <ClipboardCheck className="w-4 h-4" />
              <span>{t('autotopic.staticResults.eyebrow')}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('autotopic.staticResults.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">
                {effectiveResults ? (
                  <>
                    {isLive
                      ? t('autotopic.staticResults.liveResultsPrefix')
                      : t('autotopic.staticResults.snapshotResultsPrefix')}
                    <span className="font-mono text-emerald-400">{effectiveResults.datasetInfo?.resolvedPath}</span>
                    {t('autotopic.staticResults.documentsClusteredSuffix', {
                      docCount: effectiveResults.metrics.documentsAnalyzed.toLocaleString(),
                      topicCount: effectiveResults.metrics.nTopics,
                    })}
                    {!isLive && t('autotopic.staticResults.visibleImmediatelyNote')}
                  </>
                ) : (
                  t('autotopic.staticResults.noResultsDescription')
                )}
              </p>
            </div>
            {staticFullPipelineErrorText && !effectiveResults ? (
              <p className="text-xs text-red-400">{staticFullPipelineErrorText}</p>
            ) : !effectiveResults ? (
              <p className="text-xs text-slate-500">{t('autotopic.staticResults.loadingSnapshot')}</p>
            ) : (
              <ResultsPanel
                results={effectiveResults}
                documentsHeading={t('autotopic.staticResults.documentsHeadingPreview', { count: effectiveResults.documents.length })}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
};
