import React, { useMemo, useState } from 'react';
import { Database, Info, Layers, Workflow, GitCompare, Brain, Target, Bug, ShieldCheck, ClipboardCheck } from 'lucide-react';
import { OverviewPanel } from './cassandragrpc/OverviewPanel';
import { DatasetPanel } from './cassandragrpc/DatasetPanel';
import { TrainingPanel } from './cassandragrpc/TrainingPanel';
import { InferencePanel } from './cassandragrpc/InferencePanel';
import { MetricsPanel } from './cassandragrpc/MetricsPanel';
import { StaticResultsSection } from './cassandragrpc/StaticResultsSection';
import { ProjectSection } from './shared/ProjectSection';
import { ProjectSectionNav } from './shared/ProjectSectionNav';
import { useTranslation } from '../i18n/I18nContext';

const ACCENT = 'text-cyan-400';

export const CassandraGrpcWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);

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

        <ProjectSection
          id="architecture"
          title={t('common.projectSections.architecture')}
          icon={Layers}
          accentClassName={ACCENT}
          unavailable
          unavailableReason={t('common.projectSections.comingSoonReason')}
        />

        <ProjectSection id="dataset" title={t('common.projectSections.dataset')} icon={Database} accentClassName={ACCENT}>
          <DatasetPanel />
        </ProjectSection>

        <ProjectSection
          id="methodology"
          title={t('common.projectSections.methodology')}
          icon={Workflow}
          accentClassName={ACCENT}
          unavailable
          unavailableReason={t('common.projectSections.comingSoonReason')}
        />

        <ProjectSection
          id="baseline"
          title={t('common.projectSections.baseline')}
          icon={GitCompare}
          accentClassName={ACCENT}
          unavailable
          unavailableReason={t('common.projectSections.comingSoonReason')}
        />

        <ProjectSection id="model" title={t('common.projectSections.model')} icon={Brain} accentClassName={ACCENT}>
          <div className="space-y-6">
            <TrainingPanel onTrainingComplete={() => setMetricsRefreshKey((k) => k + 1)} />
            <InferencePanel />
          </div>
        </ProjectSection>

        <ProjectSection id="metrics" title={t('common.projectSections.metrics')} icon={Target} accentClassName={ACCENT}>
          <MetricsPanel refreshKey={metricsRefreshKey} />
        </ProjectSection>

        <ProjectSection
          id="errorAnalysis"
          title={t('common.projectSections.errorAnalysis')}
          icon={Bug}
          accentClassName={ACCENT}
          unavailable
          unavailableReason={t('common.projectSections.comingSoonReason')}
        />

        <ProjectSection
          id="regressionTests"
          title={t('common.projectSections.regressionTests')}
          icon={ShieldCheck}
          accentClassName={ACCENT}
          unavailable
          unavailableReason={t('common.projectSections.comingSoonReason')}
        />

        <ProjectSection id="results" title={t('common.projectSections.results')} icon={ClipboardCheck} accentClassName={ACCENT}>
          <StaticResultsSection />
        </ProjectSection>
      </div>
    </div>
  );
};
