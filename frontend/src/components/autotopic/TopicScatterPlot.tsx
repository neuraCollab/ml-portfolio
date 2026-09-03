import React, { useMemo } from 'react';
import { LogDocument, TopicModel } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';
import { Map as MapIcon } from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface TopicScatterPlotProps {
  documents: LogDocument[];
  topics: TopicModel[];
}

/** Real 2D UMAP projection of each document's sentence embedding (see
 * backend/app/services/autotopic_service.py::_project_2d) -- a document that
 * looks close to another one here genuinely has a similar embedding, this
 * is not a layout simulation. Renders nothing (rather than a fake plot) when
 * the current result set has no coordinates, e.g. an older saved snapshot. */
export const TopicScatterPlot: React.FC<TopicScatterPlotProps> = ({ documents, topics }) => {
  const { t } = useTranslation();

  const points = useMemo(
    () => documents.filter((doc) => typeof doc.x === 'number' && typeof doc.y === 'number'),
    [documents]
  );

  const byTopic = useMemo(() => {
    const groups = new Map<number, { color: string; name: string; data: LogDocument[] }>();
    for (const doc of points) {
      const topic = topics.find((tp) => tp.id === doc.topicId);
      if (!groups.has(doc.topicId)) {
        groups.set(doc.topicId, {
          color: topic?.color ?? '#64748b',
          name: topic?.name ?? t('autotopic.resultsPanel.documentsTable.noiseFallback'),
          data: [],
        });
      }
      groups.get(doc.topicId)!.data.push(doc);
    }
    return Array.from(groups.entries());
  }, [points, topics, t]);

  if (points.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <MapIcon className="w-4 h-4 text-cyan-400" />
          <span>{t('autotopic.resultsPanel.topicMap.heading')}</span>
        </h3>
        <p className="text-xs text-slate-500">{t('autotopic.resultsPanel.topicMap.unavailableNote')}</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <MapIcon className="w-4 h-4 text-cyan-400" />
          <span>{t('autotopic.resultsPanel.topicMap.heading')}</span>
        </h3>
        <p className="text-xs text-slate-400">{t('autotopic.resultsPanel.topicMap.subheading')}</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis type="number" dataKey="x" hide />
            <YAxis type="number" dataKey="y" hide />
            <ZAxis range={[40, 40]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', maxWidth: 260 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const doc = payload[0].payload as LogDocument;
                const topic = topics.find((tp) => tp.id === doc.topicId);
                return (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs max-w-[260px]">
                    <div className="font-semibold" style={{ color: topic?.color ?? '#94a3b8' }}>
                      {t('autotopic.resultsPanel.keywords.topicLabel', { id: doc.topicId, name: topic?.name ?? t('autotopic.resultsPanel.documentsTable.noiseFallback') })}
                    </div>
                    <div className="text-slate-300 mt-1">{doc.cleanedText}</div>
                  </div>
                );
              }}
            />
            {byTopic.map(([topicId, group]) => (
              <Scatter key={topicId} data={group.data} fill={group.color}>
                {group.data.map((_, i) => (
                  <Cell key={i} fill={group.color} fillOpacity={0.75} />
                ))}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500">{t('autotopic.resultsPanel.topicMap.caption')}</p>
    </div>
  );
};
