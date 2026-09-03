import React from 'react';
import { Layers, Sparkles, Car, CheckCircle2, Code2, Cpu, FileCode, BookOpen, HeartPulse, Network } from 'lucide-react';
import { useTranslation, TranslationKey } from '../i18n/I18nContext';

const BANNER_TAG_KEYS: { id: string; key: TranslationKey }[] = [
  { id: 'nlp', key: 'overview.banner.tags.nlpTopicModeling' },
  { id: 'rl', key: 'overview.banner.tags.reinforcementLearning' },
  { id: 'cv', key: 'overview.banner.tags.computerVision' },
  { id: 'sp', key: 'overview.banner.tags.signalProcessing' },
  { id: 'edge', key: 'overview.banner.tags.edgeAi' },
  { id: 'distributed', key: 'overview.banner.tags.distributedSystems' },
  { id: 'backend', key: 'overview.banner.tags.backendEngineering' },
];

export const OverviewWorkspace: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700/60 shadow-xl">
        <div className="flex items-center space-x-3 text-indigo-400 text-xs font-mono font-semibold uppercase tracking-wider mb-2">
          <BookOpen className="w-4 h-4" />
          <span>{t('overview.banner.eyebrow')}</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {t('overview.banner.title')}
        </h2>
        <p className="text-sm text-slate-300 max-w-3xl mt-1">
          {t('overview.banner.description')}
        </p>
        <div className="flex flex-wrap gap-2 pt-3 text-[11px] font-mono">
          {BANNER_TAG_KEYS.map(({ id, key }) => (
            <span key={id} className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">{t(key)}</span>
          ))}
        </div>
      </div>

      {/* Grid: 4 Portfolio Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* AutoTopic Module */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('overview.projects.autotopic.title')}</h3>
                <span className="text-xs text-slate-400 font-mono">/AutoTopic/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('overview.projects.autotopic.description')}
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-indigo-400 uppercase">{t('overview.techStackHeading')}</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('overview.projects.autotopic.stack.item1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('overview.projects.autotopic.stack.item2')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('overview.projects.autotopic.stack.item3')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('overview.projects.autotopic.stack.item4')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('overview.projects.autotopic.stack.item5')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* RL Autopilot Module */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Car className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('overview.projects.autopilot.title')}</h3>
                <span className="text-xs text-slate-400 font-mono">/rl_cv_car-autopilot/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('overview.projects.autopilot.description')}
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-emerald-400 uppercase">{t('overview.techStackHeading')}</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('overview.projects.autopilot.stack.item1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('overview.projects.autopilot.stack.item2')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('overview.projects.autopilot.stack.item3Prefix')}<span className="text-emerald-300">KITTICarEnv</span>{t('overview.projects.autopilot.stack.item3Suffix')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('overview.projects.autopilot.stack.item4')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('overview.projects.autopilot.stack.item5')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* ECG Edge AI Module */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <HeartPulse className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('overview.projects.ecg.title')}</h3>
                <span className="text-xs text-slate-400 font-mono">/raspberry-pi-ecg/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('overview.projects.ecg.description')}
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-rose-400 uppercase">{t('overview.techStackHeading')}</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('overview.projects.ecg.stack.item1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('overview.projects.ecg.stack.item2')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('overview.projects.ecg.stack.item3')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('overview.projects.ecg.stack.item4')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('overview.projects.ecg.stack.item5')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cassandra + gRPC ML Module */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('overview.projects.cassandraGrpc.title')}</h3>
                <span className="text-xs text-slate-400 font-mono">/cassandra-grpc-ml/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('overview.projects.cassandraGrpc.description')}
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-cyan-400 uppercase">{t('overview.techStackHeading')}</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('overview.projects.cassandraGrpc.stack.item1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('overview.projects.cassandraGrpc.stack.item2')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('overview.projects.cassandraGrpc.stack.item3')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('overview.projects.cassandraGrpc.stack.item4')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('overview.projects.cassandraGrpc.stack.item5')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>

      {/* Complete Technology Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>{t('overview.techMatrix.heading')}</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">{t('overview.techMatrix.headers.component')}</th>
                <th className="py-3 px-4">{t('overview.techMatrix.headers.originalLibrary')}</th>
                <th className="py-3 px-4">{t('overview.techMatrix.headers.inThisWebApp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.topicModeling.component')}</td>
                <td className="py-2.5 px-4 text-indigo-400">bertopic (v0.17+)</td>
                <td className="py-2.5 px-4 text-emerald-400">{t('overview.techMatrix.rows.topicModeling.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.embeddings.component')}</td>
                <td className="py-2.5 px-4 text-indigo-400">sentence-transformers MiniLM-L12</td>
                <td className="py-2.5 px-4 text-emerald-400">{t('overview.techMatrix.rows.embeddings.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.hyperparameterOptimization.component')}</td>
                <td className="py-2.5 px-4 text-indigo-400">optuna (v3.0+) TPE Sampler</td>
                <td className="py-2.5 px-4 text-slate-400">{t('overview.techMatrix.rows.hyperparameterOptimization.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.reinforcementLearning.component')}</td>
                <td className="py-2.5 px-4 text-emerald-400">stable-baselines3 (SAC)</td>
                <td className="py-2.5 px-4 text-slate-400">{t('overview.techMatrix.rows.reinforcementLearning.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.computerVisionSensors.component')}</td>
                <td className="py-2.5 px-4 text-emerald-400">OpenCV (cv2) + KITTI Velodyne LiDAR</td>
                <td className="py-2.5 px-4 text-slate-400">{t('overview.techMatrix.rows.computerVisionSensors.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.ecgSignalProcessing.component')}</td>
                <td className="py-2.5 px-4 text-rose-400">SciPy Butterworth filter + Einthoven/Goldberger</td>
                <td className="py-2.5 px-4 text-emerald-400">{t('overview.techMatrix.rows.ecgSignalProcessing.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.ecgClassification.component')}</td>
                <td className="py-2.5 px-4 text-rose-400">PyTorch ECGNet (TorchScript), PTB-XL</td>
                <td className="py-2.5 px-4 text-emerald-400">{t('overview.techMatrix.rows.ecgClassification.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.distributedStorage.component')}</td>
                <td className="py-2.5 px-4 text-cyan-400">Apache Cassandra 5</td>
                <td className="py-2.5 px-4 text-emerald-400">{t('overview.techMatrix.rows.distributedStorage.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.distributedServing.component')}</td>
                <td className="py-2.5 px-4 text-cyan-400">grpcio + Protocol Buffers, scikit-learn TF-IDF/LogisticRegression</td>
                <td className="py-2.5 px-4 text-emerald-400">{t('overview.techMatrix.rows.distributedServing.inApp')}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">{t('overview.techMatrix.rows.frontendInterface.component')}</td>
                <td className="py-2.5 px-4 text-slate-400">Streamlit + Jupyter Notebooks + Jinja2/Chart.js</td>
                <td className="py-2.5 px-4 text-purple-400">React 18 + Vite + Tailwind CSS + Recharts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
