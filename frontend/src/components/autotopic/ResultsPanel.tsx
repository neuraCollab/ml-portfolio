import React, { useMemo, useState } from 'react';
import { AutoTopicResults } from '../../types';
import { MetricCard } from '../shared/MetricCard';
import { useTranslation } from '../../i18n/I18nContext';
import {
  BarChart2, Tag, Zap, Sparkles, CheckCircle2, CircleDashed, Files, Star,
  FileText, Search,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts';

interface ResultsPanelProps {
  results: AutoTopicResults;
  /** Overrides the "Classified Log Documents" heading count -- use this to
   * make clear when the table is a preview sample rather than everything. */
  documentsHeading?: string;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, documentsHeading }) => {
  const { t } = useTranslation();
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [searchDocFilter, setSearchDocFilter] = useState('');
  const [docTopicFilter, setDocTopicFilter] = useState<number | 'all'>('all');

  const filteredDocs = useMemo(() => {
    return results.documents.filter((doc) => {
      const matchesSearch =
        doc.text.toLowerCase().includes(searchDocFilter.toLowerCase()) ||
        doc.cleanedText.toLowerCase().includes(searchDocFilter.toLowerCase());
      const matchesTopic = docTopicFilter === 'all' || doc.topicId === docTopicFilter;
      return matchesSearch && matchesTopic;
    });
  }, [results.documents, searchDocFilter, docTopicFilter]);

  const activeTopicObj = useMemo(() => {
    if (selectedTopicId === null) return results.topics[0] || null;
    return results.topics.find((topic) => topic.id === selectedTopicId) || results.topics[0] || null;
  }, [selectedTopicId, results.topics]);

  return (
    <>
      {/* Key Quality Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label={t('autotopic.resultsPanel.metrics.documentsAnalyzedLabel')}
          value={results.metrics.documentsAnalyzed}
          icon={Files}
          color="text-sky-400"
          tooltip={t('autotopic.resultsPanel.metrics.documentsAnalyzedTooltip')}
        />
        <MetricCard
          label={t('autotopic.resultsPanel.metrics.discoveredTopicsLabel')}
          value={results.metrics.nTopics}
          icon={Tag}
          color="text-amber-400"
          detail={t('autotopic.resultsPanel.metrics.discoveredTopicsDetail')}
          tooltip={t('autotopic.resultsPanel.metrics.discoveredTopicsTooltip')}
        />
        <MetricCard
          label={t('autotopic.resultsPanel.metrics.outliersLabel')}
          value={results.metrics.outlierCount}
          unit={`(${results.metrics.outlierPercentage}%)`}
          icon={CircleDashed}
          color="text-slate-400"
          tooltip={t('autotopic.resultsPanel.metrics.outliersTooltip')}
        />
        <MetricCard
          label={t('autotopic.resultsPanel.metrics.coherenceLabel')}
          value={results.metrics.coherenceUci}
          icon={Zap}
          color="text-indigo-400"
          tooltip={t('autotopic.resultsPanel.metrics.coherenceTooltip')}
        />
        <MetricCard
          label={t('autotopic.resultsPanel.metrics.diversityLabel')}
          value={results.metrics.diversity}
          icon={Sparkles}
          color="text-purple-400"
          tooltip={t('autotopic.resultsPanel.metrics.diversityTooltip')}
        />
        <MetricCard
          label={t('autotopic.resultsPanel.metrics.compositeScoreLabel')}
          value={results.metrics.compositeScore}
          icon={CheckCircle2}
          color="text-emerald-400"
          tooltip={t('autotopic.resultsPanel.metrics.compositeScoreTooltip')}
        />
      </div>

      {/* Topic Size Distribution Bar Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              <span>{t('autotopic.resultsPanel.topicSizeChart.heading')}</span>
            </h3>
            <p className="text-xs text-slate-400">{t('autotopic.resultsPanel.topicSizeChart.subheading')}</p>
          </div>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={results.topics} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
              <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                labelStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {results.topics.map((topic, idx) => (
                  <Cell key={`cell-${idx}`} fill={topic.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive Topic Keywords & WordCloud Simulator */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <Tag className="w-4 h-4 text-purple-400" />
            <span>{t('autotopic.resultsPanel.keywords.heading')}</span>
          </h3>
        </div>

        {/* Topic Buttons Pill bar */}
        <div className="flex flex-wrap gap-2">
          {results.topics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => {
                setSelectedTopicId(topic.id);
                setDocTopicFilter(topic.id);
              }}
              title={t('autotopic.resultsPanel.keywords.topicButtonTitle')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center space-x-2 ${
                activeTopicObj?.id === topic.id
                  ? 'bg-slate-800 border-slate-600 text-white shadow'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: topic.color }} />
              <span>{t('autotopic.resultsPanel.keywords.topicLabel', { id: topic.id, name: topic.name })}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                {topic.count}
              </span>
            </button>
          ))}
        </div>

        {/* Selected Topic Keyword Weights Cloud */}
        {activeTopicObj && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span>{t('autotopic.resultsPanel.keywords.selectedTopicSummary', { id: activeTopicObj.id, percentage: activeTopicObj.percentage })}</span>
              <span className="text-indigo-400">{t('autotopic.resultsPanel.keywords.keyTermsCount', { count: activeTopicObj.keywords.length })}</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {activeTopicObj.keywords.map((kw, i) => {
                const fontSize = Math.max(12, Math.min(22, 12 + kw.weight * 12));
                return (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-lg border border-slate-800/80 bg-slate-900 text-slate-200 font-mono transition hover:scale-105"
                    style={{ fontSize: `${fontSize}px`, borderColor: activeTopicObj.color + '40' }}
                  >
                    {kw.word}
                    <span className="ml-1.5 text-[10px] text-slate-500 font-mono">
                      ({kw.weight.toFixed(2)})
                    </span>
                  </span>
                );
              })}
            </div>

            {activeTopicObj.id !== -1 && activeTopicObj.representativeDocs.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center space-x-1.5 text-[11px] font-mono text-slate-500 uppercase">
                  <Star className="w-3 h-3 text-amber-400" />
                  <span>{t('autotopic.resultsPanel.keywords.representativeDocsHeading')}</span>
                </div>
                {activeTopicObj.representativeDocs.map((doc, i) => (
                  <p key={i} className="text-xs text-slate-300 font-mono bg-slate-900 rounded-lg px-3 py-2 border border-slate-800/80">
                    {doc}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optuna Hyperparameter Optimization Trials Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{t('autotopic.resultsPanel.optuna.heading')}</span>
            </h3>
            <p className="text-xs text-slate-400">{t('autotopic.resultsPanel.optuna.subheading')}</p>
          </div>
        </div>

        {results.trials.length > 0 ? (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results.trials} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="trial" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                />
                <Line type="monotone" dataKey="compositeScore" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name={t('autotopic.resultsPanel.optuna.compositeScoreSeriesName')} />
                <Line type="monotone" dataKey="coherenceUci" stroke="#6366f1" strokeWidth={1.5} dot={false} name={t('autotopic.resultsPanel.optuna.coherenceSeriesName')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            {t('autotopic.resultsPanel.optuna.emptyStatePrefix')}<code className="text-slate-400">main.py</code>{t('autotopic.resultsPanel.optuna.emptyStateSuffix')}
          </div>
        )}
      </div>

      {/* Document Classifier Explorer Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>{documentsHeading ?? t('autotopic.resultsPanel.documentsTable.headingDefault', { count: filteredDocs.length })}</span>
          </h3>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="relative min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchDocFilter}
                onChange={(e) => setSearchDocFilter(e.target.value)}
                placeholder={t('autotopic.resultsPanel.documentsTable.searchPlaceholder')}
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* max-w + truncate cap the select's own width -- topic names are
                real clustered keywords and can be long in either UI language,
                so without a cap the native <select> auto-sizes to its widest
                option and can overflow narrow viewports. */}
            <select
              value={docTopicFilter}
              onChange={(e) =>
                setDocTopicFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none max-w-[160px] truncate"
            >
              <option value="all">{t('autotopic.resultsPanel.documentsTable.allTopicsOption')}</option>
              {results.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {t('autotopic.resultsPanel.documentsTable.topicOption', { id: topic.id, name: topic.name })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">{t('autotopic.resultsPanel.documentsTable.colDocId')}</th>
                <th className="py-2.5 px-3">{t('autotopic.resultsPanel.documentsTable.colRawLogText')}</th>
                <th className="py-2.5 px-3">{t('autotopic.resultsPanel.documentsTable.colCleanedOutput')}</th>
                <th className="py-2.5 px-3">{t('autotopic.resultsPanel.documentsTable.colTopic')}</th>
                <th className="py-2.5 px-3">{t('autotopic.resultsPanel.documentsTable.colConfidence')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredDocs.map((doc) => {
                const topicObj = results.topics.find((topic) => topic.id === doc.topicId);
                return (
                  <tr key={doc.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2 px-3 text-slate-500 text-[10px]">{doc.id}</td>
                    <td className="py-2 px-3 text-slate-200 font-sans max-w-xs truncate" title={doc.text}>
                      {doc.text}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans max-w-xs truncate" title={doc.cleanedText}>
                      {doc.cleanedText}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-semibold"
                        style={{
                          backgroundColor: (topicObj?.color || '#64748b') + '20',
                          color: topicObj?.color || '#94a3b8',
                          borderColor: (topicObj?.color || '#64748b') + '40',
                        }}
                      >
                        #{doc.topicId}: {topicObj?.name || t('autotopic.resultsPanel.documentsTable.noiseFallback')}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">{doc.confidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
