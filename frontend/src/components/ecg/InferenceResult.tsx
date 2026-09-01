import React from 'react';
import { EcgAnalysisResult } from '../../types';
import { BrainCircuit, HelpCircle, CheckCircle2, XCircle } from 'lucide-react';
import { ProbabilityBarChart } from './ProbabilityBarChart';
import { formatProbability } from '../../utils/formatProbability';

interface InferenceResultProps {
  result: EcgAnalysisResult;
}

export const InferenceResult: React.FC<InferenceResultProps> = ({ result }) => {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-slate-500 font-mono uppercase">Top classification</div>
          <div className="text-lg font-bold text-rose-300">{result.topLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono text-rose-400">{formatProbability(result.topProbability)}</div>
          <div className="text-[10px] text-slate-500">raw model probability</div>
        </div>
      </div>

      {!result.groundTruthAvailable && (
        <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
          <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Ground truth unavailable -- this sample demonstrates inference only, not measured accuracy.
            See the Evaluation section below to compute real accuracy/precision/recall against a labeled dataset.</span>
        </div>
      )}

      {result.groundTruthAvailable && result.groundTruthLabels && result.groundTruthCorrect && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
          <div className="text-[11px] text-slate-400 font-mono uppercase">Real PTB-XL ground truth vs. this prediction</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Object.entries(result.groundTruthLabels)
              .filter(([name, isPositive]) => isPositive || !result.groundTruthCorrect?.[name])
              .map(([name, isPositive]) => {
                const correct = result.groundTruthCorrect![name];
                return (
                  <div key={name} className="flex items-center gap-1.5 text-xs">
                    {correct ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="text-slate-300 font-mono truncate">{name}</span>
                    <span className="text-slate-500">({isPositive ? 'true' : 'false'})</span>
                  </div>
                );
              })}
          </div>
          <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
            Green = model's predicted/not-predicted call matches the real label. Red = a real
            mismatch (see raspberry-pi-ecg/data/README.md for why some classes score lower than
            others). Rows with a true label of "false" are only shown when the model got them wrong.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mb-2">
          <BrainCircuit className="w-3.5 h-3.5 text-rose-400" />
          <span>Class probabilities</span>
        </div>
        <ProbabilityBarChart predictions={result.predictions} />
      </div>

      <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3">{result.note}</p>
    </div>
  );
};
