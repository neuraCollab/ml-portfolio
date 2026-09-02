// frontend/src/components/cassandragrpc/ConfusionMatrixTable.tsx
import React from 'react';
import { ClassSupport, ConfusionMatrixEntry } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface Props {
  topClasses: ClassSupport[];
  confusionMatrix: ConfusionMatrixEntry[];
}

export const ConfusionMatrixTable: React.FC<Props> = ({ topClasses, confusionMatrix }) => {
  const { t } = useTranslation();
  const countFor = (trueId: number, predId: number) =>
    confusionMatrix.find((e) => e.trueTopicId === trueId && e.predictedTopicId === predId)?.count ?? 0;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="text-[10px] text-slate-300 min-w-[700px]">
        <thead>
          <tr>
            <th className="p-2 bg-slate-950 text-left font-mono text-slate-500">{t('cassandraGrpc.confusionMatrix.truePredictedHeader')}</th>
            {topClasses.map((c) => (
              <th key={c.topicId} className="p-1.5 bg-slate-950 font-mono text-slate-400 max-w-[80px] truncate" title={c.topicName}>
                {c.topicId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {topClasses.map((rowClass) => (
            <tr key={rowClass.topicId}>
              <td className="p-2 font-mono text-slate-400 truncate max-w-[160px]" title={rowClass.topicName}>
                {rowClass.topicId} · {rowClass.topicName}
              </td>
              {topClasses.map((colClass) => {
                const count = countFor(rowClass.topicId, colClass.topicId);
                const isDiagonal = rowClass.topicId === colClass.topicId;
                return (
                  <td
                    key={colClass.topicId}
                    className={`p-1.5 text-center font-mono ${isDiagonal ? 'bg-cyan-500/20 text-cyan-300' : count > 0 ? 'text-slate-300' : 'text-slate-700'}`}
                  >
                    {count || '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
