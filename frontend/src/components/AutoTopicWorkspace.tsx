import React, { useState, useRef, useEffect } from 'react';
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

const PIPELINE_STEPS = [
  'Stage 1: Text Cleaning (HTML, Emojis, LLM prefixes)',
  'Stage 2: Lemmatization (pymorphy3 ru / spaCy en)',
  'Stage 3: Embedding Computation (SentenceTransformers MiniLM-L12)',
  'Stage 4: UMAP Dimensionality Reduction & HDBSCAN Clustering',
  'Stage 5: c-TF-IDF Topic Representations & Metric Calculation',
];

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
  const [datasetInfoError, setDatasetInfoError] = useState<string | null>(null);
  const [datasetSampleSize, setDatasetSampleSize] = useState(300);

  const [fullPipelineStatus, setFullPipelineStatus] = useState<AutoTopicFullPipelineStatus | null>(null);
  const [fullPipelineError, setFullPipelineError] = useState<string | null>(null);
  const fullPipelinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Static snapshot of a real full-dataset run (backend/scripts/generate_static_results.py).
  // Fetched at runtime from public/ (not bundled into the JS -- it's ~500KB
  // of real topics/documents) so it's visible even if the live background
  // job above has never been run in this session or the backend restarted.
  const [staticFullPipelineResults, setStaticFullPipelineResults] = useState<AutoTopicResults | null>(null);
  const [staticFullPipelineError, setStaticFullPipelineError] = useState<string | null>(null);

  useEffect(() => () => {
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    if (fullPipelinePollRef.current) clearInterval(fullPipelinePollRef.current);
  }, []);

  useEffect(() => {
    getAutoTopicDatasetInfo()
      .then(setDatasetInfo)
      .catch((err) => setDatasetInfoError(err instanceof ApiError ? err.message : 'Could not reach the backend.'));
  }, []);

  useEffect(() => {
    const base = (import.meta as any).env.BASE_URL;
    fetch(`${base}static-results/autotopic/full_pipeline_results.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setStaticFullPipelineResults)
      .catch(() => setStaticFullPipelineError('Could not load the static full-dataset results snapshot.'));
  }, []);

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
      setFullPipelineError(err instanceof ApiError ? err.message : 'Could not start the full pipeline.');
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
      const message = err instanceof ApiError ? err.message : 'Unexpected error running the pipeline.';
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
              <span>AutoTopic Pipeline Engine</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Automatic Unstructured Text Log Topic Analysis
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Combines SentenceTransformers embeddings, UMAP dimensionality reduction, HDBSCAN clustering, and c-TF-IDF with Optuna hyperparameter optimization.
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
                  <span>Processing Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>{csvFile ? `Analyze ${csvFile.name}` : 'Execute BERTopic Pipeline'}</span>
                </>
              )}
            </button>
            <button
              onClick={handleExportJson}
              disabled={!hasRun}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-xl transition text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              <span>Export JSON</span>
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
              <span className="font-semibold">Pipeline failed: </span>
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
              These results are from a real random sample of{' '}
              <span className="font-mono text-emerald-400">{results.datasetInfo.sampledRows}</span> of{' '}
              <span className="font-mono text-emerald-400">{results.datasetInfo.totalRows?.toLocaleString()}</span>{' '}
              rows loaded from{' '}
              <span className="font-mono text-slate-400">{results.datasetInfo.resolvedPath}</span> -- not the
              bundled demo sample.
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
                <span>Text Cleaning Stage</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">stages/cleaning.py</span>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">Remove HTML tags</span>
                <input
                  type="checkbox"
                  checked={config.removeHtml}
                  onChange={(e) => setConfig({ ...config, removeHtml: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">Strip Emojis & Symbols</span>
                <input
                  type="checkbox"
                  checked={config.removeEmojis}
                  onChange={(e) => setConfig({ ...config, removeEmojis: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">Clean Code & SQL snippets</span>
                <input
                  type="checkbox"
                  checked={config.removeCode}
                  onChange={(e) => setConfig({ ...config, removeCode: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700">
                <span className="text-slate-300">Filter LLM model prefixes</span>
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
                <span>BERTopic & Optuna Config</span>
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
                  <span className="text-slate-400">Top-N Keywords per Topic</span>
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
                <span className="text-slate-400 block mb-1">Language Mode</span>
                <select
                  value={config.languageMode}
                  onChange={(e) => setConfig({ ...config, languageMode: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:border-indigo-500"
                >
                  <option value="mixed">Mixed (Ru & En - Multilingual MiniLM)</option>
                  <option value="ru">Russian Only (pymorphy3)</option>
                  <option value="en">English Only (spaCy)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Upload your own CSV */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>Upload Your Own CSV</span>
            </div>
            <p className="text-xs text-slate-400">
              Needs a <code className="text-slate-300">log_text</code> column. Leave empty to use the {rawLogs.length} bundled sample log lines below.
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
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Real Dataset (configurable location, e.g. AutoTopic/data/raw/labeled_requests.parquet) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Real Dataset (parquet)</span>
            </div>

            {datasetInfoError ? (
              <p className="text-xs text-red-400">{datasetInfoError}</p>
            ) : !datasetInfo ? (
              <p className="text-xs text-slate-500">Checking dataset location...</p>
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
                      ? `Found -- ${datasetInfo.totalRows?.toLocaleString() ?? '?'} real rows.`
                      : 'Not found at the configured location.'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 font-mono break-all">
                  {datasetInfo.resolvedPath}
                </div>
                <p className="text-[10px] text-slate-500">
                  Location is set by the <code className="text-slate-400">AUTOTOPIC_DATA_URL</code> env
                  var (backend/.env.example) -- currently{' '}
                  <span className="font-mono text-slate-400">{datasetInfo.configuredLocation}</span>, a local
                  path. <span className="text-amber-400">Replace it with your Google Drive link once uploaded</span>{' '}
                  -- see <code className="text-slate-400">AutoTopic/data/README.md</code>.
                </p>
              </div>
            )}

            <div>
              <div className="flex justify-between mb-1 text-xs">
                <span className="text-slate-400">Sample size (random, real rows)</span>
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
              Run BERTopic on real dataset sample
            </button>
          </div>

          {/* Add Custom Log Entry */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Add Custom Log Document</span>
            </div>

            <form onSubmit={handleAddCustomLog} className="space-y-3">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Paste one or more log lines, one per line (e.g. 'Error 500: Database connection pool exhausted...')"
                className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="submit"
                disabled={!customText.trim()}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition"
              >
                + Add to Sample Set ({rawLogs.length} docs, re-run to re-cluster)
              </button>
            </form>
          </div>

        </div>

        {/* Right Column: Results & Analytics Dashboard (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {isProcessing ? (
            <div className="bg-slate-900 border border-dashed border-indigo-500/30 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <h3 className="text-slate-300 font-semibold">Running the real pipeline...</h3>
              <p className="text-xs text-slate-500 max-w-sm">{activeStep}</p>
            </div>
          ) : !hasRun ? (
            <div className="bg-slate-900 border border-dashed border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <Sparkles className="w-8 h-8 text-slate-600" />
              <h3 className="text-slate-300 font-semibold">No results yet</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Click <span className="text-indigo-400 font-medium">Execute BERTopic Pipeline</span> to run the
                real cleaning &rarr; embedding &rarr; UMAP/HDBSCAN &rarr; c-TF-IDF pipeline on the {rawLogs.length}{' '}
                bundled sample log lines (or your uploaded CSV).
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
              <span>Full Dataset Pipeline</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Run the Real Pipeline on the Whole Dataset
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Same real cleaning &rarr; lemmatization &rarr; filtering &rarr; embedding &rarr; UMAP/HDBSCAN &rarr;
              c-TF-IDF pipeline as above, but over every real row in{' '}
              {datasetInfo ? (
                <span className="font-mono text-emerald-400">{datasetInfo.resolvedPath}</span>
              ) : (
                'the configured dataset'
              )}{' '}
              instead of a capped sample -- matching how <code className="text-slate-400">AutoTopic/main.py</code>{' '}
              trains on the full corpus. This is a genuinely long CPU job (embeddings alone take roughly
              45-75 minutes on ~370k rows, plus clustering time on top), so it runs as a background job you
              can leave running and check back on.
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
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Run Full Pipeline (Whole Dataset)</span>
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
                {fullPipelineStatus.status === 'running' && (fullPipelineStatus.stage ?? 'Working...')}
                {fullPipelineStatus.status === 'completed' && 'Completed'}
                {fullPipelineStatus.status === 'failed' && 'Failed'}
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
                <span>Total rows: {fullPipelineStatus.totalRows.toLocaleString()}</span>
              )}
              {fullPipelineStatus.survivingRows != null && (
                <span>Surviving: {fullPipelineStatus.survivingRows.toLocaleString()}</span>
              )}
              {fullPipelineStatus.elapsedSeconds != null && (
                <span>Elapsed: {(fullPipelineStatus.elapsedSeconds / 60).toFixed(1)} min</span>
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
              <span>Results</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Real Full-Dataset Pipeline Results</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">
                {effectiveResults ? (
                  <>
                    {isLive
                      ? 'Results from the job you just ran above, over every real row in '
                      : 'A saved snapshot of a real run of the full pipeline above, over every real row in '}
                    <span className="font-mono text-emerald-400">{effectiveResults.datasetInfo?.resolvedPath}</span>{' '}
                    -- {effectiveResults.metrics.documentsAnalyzed.toLocaleString()} real documents
                    clustered into {effectiveResults.metrics.nTopics} real topics.
                    {!isLive && ' Visible immediately, no need to run the (~45-70 minute) job yourself.'}
                  </>
                ) : (
                  'A saved snapshot of a real full-dataset pipeline run -- visible immediately, no need to run the (~45-70 minute) job yourself.'
                )}
              </p>
            </div>
            {staticFullPipelineError && !effectiveResults ? (
              <p className="text-xs text-red-400">{staticFullPipelineError}</p>
            ) : !effectiveResults ? (
              <p className="text-xs text-slate-500">Loading saved results...</p>
            ) : (
              <ResultsPanel
                results={effectiveResults}
                documentsHeading={`Classified Log Documents (random preview of ${effectiveResults.documents.length})`}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
};
