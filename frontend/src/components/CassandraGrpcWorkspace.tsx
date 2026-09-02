import React, { useEffect, useMemo, useState } from 'react';
import {
  Database, Info, Layers, Workflow, GitCompare, Brain, Target, Bug, ShieldCheck, ClipboardCheck,
  CheckCircle2, Server, Boxes,
} from 'lucide-react';
import { OverviewPanel } from './cassandragrpc/OverviewPanel';
import { DatasetPanel } from './cassandragrpc/DatasetPanel';
import { TrainingPanel } from './cassandragrpc/TrainingPanel';
import { InferencePanel } from './cassandragrpc/InferencePanel';
import { MetricsPanel } from './cassandragrpc/MetricsPanel';
import { StaticResultsSection } from './cassandragrpc/StaticResultsSection';
import { SystemStatusPanel } from './cassandragrpc/SystemStatusPanel';
import { WorkerPool } from './cassandragrpc/WorkerPool';
import { CassandraGrpcStatus } from '../types';
import { getCassandraGrpcStatus } from '../api/client';
import { ProjectSection } from './shared/ProjectSection';
import { ProjectSectionNav } from './shared/ProjectSectionNav';
import { useTranslation } from '../i18n/I18nContext';

const ACCENT = 'text-cyan-400';
const ARCHITECTURE_STEP_KEYS = ['s1', 's2', 's3', 's4', 's5'] as const;

export const CassandraGrpcWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
  const [poolStatus, setPoolStatus] = useState<CassandraGrpcStatus | null>(null);
  useEffect(() => {
    const refresh = () => {
      getCassandraGrpcStatus().then(setPoolStatus).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, []);

  const SECTION_ITEMS = useMemo(
    () => [
      { id: 'overview', label: t('common.projectSections.overview'), icon: Info },
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

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-10 lg:items-start">
      <ProjectSectionNav items={SECTION_ITEMS} accentClassName={ACCENT} />

      <div className="flex-1 min-w-0 space-y-6">
        <ProjectSection id="overview" title={t('common.projectSections.overview')} icon={Info} accentClassName={ACCENT}>
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
                <Database className="w-4 h-4" />
                <span>{t('cassandraGrpc.workspace.categoryLabel')}</span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mt-1">{t('cassandraGrpc.workspace.title')}</h1>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">
                {t('cassandraGrpc.workspace.description')}
              </p>
            </div>
            <OverviewPanel />
          </div>
        </ProjectSection>

        <ProjectSection id="architecture" title={t('common.projectSections.architecture')} icon={Layers} accentClassName={ACCENT}>
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div>
                <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                  <Layers className="w-4 h-4" />
                  <span>{t('cassandraGrpc.architecture.eyebrow')}</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">{t('cassandraGrpc.architecture.title')}</h2>
              </div>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3.5 overflow-x-auto">
                <span className="text-sm sm:text-base font-mono font-bold text-cyan-300 whitespace-nowrap">
                  {t('cassandraGrpc.architecture.flowBanner')}
                </span>
              </div>
              <p className="text-sm text-slate-400 max-w-3xl">{t('cassandraGrpc.architecture.intro')}</p>
              <div className="flex flex-col divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                {ARCHITECTURE_STEP_KEYS.map((key, idx) => (
                  <div key={key} className="flex items-start gap-3 p-3.5 bg-slate-950/50">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold font-mono flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-200">{t(`cassandraGrpc.architecture.steps.${key}.title` as any)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{t(`cassandraGrpc.architecture.steps.${key}.detail` as any)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-800 pt-3">
                <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.architecture.whyHeading')}</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.architecture.whyBody')}</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                {t('cassandraGrpc.architecture.systemStatusHeading')}
              </h3>
              <SystemStatusPanel />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-cyan-400" />
                {t('cassandraGrpc.architecture.workerPoolHeading')}
              </h3>
              <WorkerPool status={poolStatus} onStatusChange={setPoolStatus} />
            </div>
          </div>
        </ProjectSection>

        <ProjectSection id="dataset" title={t('common.projectSections.dataset')} icon={Database} accentClassName={ACCENT}>
          <DatasetPanel />
        </ProjectSection>

        <ProjectSection id="methodology" title={t('common.projectSections.methodology')} icon={Workflow} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Workflow className="w-4 h-4" />
                <span>{t('cassandraGrpc.methodologySection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('cassandraGrpc.methodologySection.title')}</h2>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.methodologySection.ingestionHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.methodologySection.ingestionBody')}</p>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.methodologySection.trainingHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.methodologySection.trainingBody')}</p>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.methodologySection.persistenceHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.methodologySection.persistenceBody')}</p>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.methodologySection.servingHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.methodologySection.servingBody')}</p>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.methodologySection.predictionHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.methodologySection.predictionBody')}</p>
            </div>
            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('cassandraGrpc.methodologySection.loggingHeading')}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t('cassandraGrpc.methodologySection.loggingBody')}</p>
            </div>
          </div>
        </ProjectSection>

        <ProjectSection id="baseline" title={t('common.projectSections.baseline')} icon={GitCompare} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <GitCompare className="w-4 h-4" />
                <span>{t('cassandraGrpc.baselineSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('cassandraGrpc.baselineSection.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('cassandraGrpc.baselineSection.intro')}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-slate-400">
              {t('cassandraGrpc.baselineSection.caveat')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('cassandraGrpc.baselineSection.baselineCardTitle')}</h3>
                <p className="text-xs text-slate-300 font-mono">{t('cassandraGrpc.baselineSection.baselineTime')}</p>
                <p className="text-xs text-slate-300 font-mono">{t('cassandraGrpc.baselineSection.baselineQuery')}</p>
              </div>
              <div className="bg-slate-950/60 border border-cyan-500/20 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wide">{t('cassandraGrpc.baselineSection.modelCardTitle')}</h3>
                <p className="text-xs text-cyan-200 font-mono">{t('cassandraGrpc.baselineSection.modelTime')}</p>
                <p className="text-xs text-cyan-200 font-mono">{t('cassandraGrpc.baselineSection.modelQuery')}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">{t('cassandraGrpc.baselineSection.sourceNote')}</p>
          </div>
        </ProjectSection>

        <ProjectSection id="model" title={t('common.projectSections.model')} icon={Brain} accentClassName={ACCENT}>
          <div className="space-y-6">
            <TrainingPanel onTrainingComplete={() => setMetricsRefreshKey((k) => k + 1)} />
            <InferencePanel />
          </div>
        </ProjectSection>

        <ProjectSection id="metrics" title={t('common.projectSections.metrics')} icon={Target} accentClassName={ACCENT}>
          <MetricsPanel refreshKey={metricsRefreshKey} />
        </ProjectSection>

        <ProjectSection id="errorAnalysis" title={t('common.projectSections.errorAnalysis')} icon={Bug} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <Bug className="w-4 h-4" />
                <span>{t('cassandraGrpc.errorAnalysisSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('cassandraGrpc.errorAnalysisSection.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('cassandraGrpc.errorAnalysisSection.intro')}</p>
            </div>
            <div className="space-y-3">
              {(['majorityBias', 'weakClass', 'macroVsAccuracy'] as const).map((key) => (
                <div key={key} className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-4">
                  <h4 className="text-xs font-bold text-amber-300">{t(`cassandraGrpc.errorAnalysisSection.${key}Title` as any)}</h4>
                  <p className="text-[11px] text-slate-400 mt-1.5">{t(`cassandraGrpc.errorAnalysisSection.${key}Body` as any)}</p>
                </div>
              ))}
            </div>
          </div>
        </ProjectSection>

        <ProjectSection id="regressionTests" title={t('common.projectSections.regressionTests')} icon={ShieldCheck} accentClassName={ACCENT}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>{t('cassandraGrpc.regressionTestsSection.eyebrow')}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{t('cassandraGrpc.regressionTestsSection.title')}</h2>
              <p className="text-sm text-slate-400 max-w-3xl mt-1">{t('cassandraGrpc.regressionTestsSection.intro')}</p>
            </div>

            <div className="flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 shrink-0" />
              <div>
                <div className="text-2xl font-bold text-emerald-300">55 / 55 passed</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  cassandra-grpc-ml/worker/tests/ (11) + cassandra-grpc-ml/coordinator/tests/ (19) + backend/tests/test_cassandra_grpc_*.py (25) -- last run 2026-09-02, pytest 9.1.1
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-2">{t('cassandraGrpc.regressionTestsSection.testListHeading')}</h3>
              <ul className="space-y-1.5">
                {(['test1', 'test2', 'test3', 'test4', 'test5', 'test6'] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2 text-xs text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t(`cassandraGrpc.regressionTestsSection.${key}` as any)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-slate-500">
              {t('cassandraGrpc.regressionTestsSection.howToRerun')}
              <code className="text-slate-400 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5">
                pytest cassandra-grpc-ml/worker/tests/ cassandra-grpc-ml/coordinator/tests/ backend/tests/test_cassandra_grpc_*.py -v
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
