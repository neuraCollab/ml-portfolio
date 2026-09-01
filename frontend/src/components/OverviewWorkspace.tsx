import React from 'react';
import { Layers, Sparkles, Car, CheckCircle2, Code2, Cpu, FileCode, BookOpen, HeartPulse } from 'lucide-react';

export const OverviewWorkspace: React.FC = () => {
  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700/60 shadow-xl">
        <div className="flex items-center space-x-3 text-indigo-400 text-xs font-mono font-semibold uppercase tracking-wider mb-2">
          <BookOpen className="w-4 h-4" />
          <span>Repository Overview & Architecture</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Machine Learning Portfolio: AutoTopic, RL Autopilot & ECG Edge AI
        </h2>
        <p className="text-sm text-slate-300 max-w-3xl mt-1">
          Three projects demonstrating machine learning, deep learning, signal processing,
          reinforcement learning, and backend/edge-AI engineering, consolidated into one
          dashboard backed by a FastAPI service that runs each project's real Python code.
        </p>
        <div className="flex flex-wrap gap-2 pt-3 text-[11px] font-mono">
          {['NLP / Topic Modeling', 'Reinforcement Learning', 'Computer Vision', 'Signal Processing', 'Edge AI', 'Backend Engineering'].map((tag) => (
            <span key={tag} className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">{tag}</span>
          ))}
        </div>
      </div>

      {/* Grid: 3 Portfolio Projects */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* AutoTopic Module */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Project 1: AutoTopic NLP Pipeline</h3>
                <span className="text-xs text-slate-400 font-mono">/AutoTopic/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Automated topic discovery and interpretation in unstructured text logs. Built to accelerate incident resolution and product insights without manual dataset annotation.
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-indigo-400 uppercase">Core Architecture & Tech Stack:</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>BERTopic + SentenceTransformers (MiniLM-L12)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>UMAP (cosine) + HDBSCAN density clustering</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Optuna (TPE Sampler) hyperparameter tuning</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Coherence UCI (c_uci) & Diversity metrics evaluation</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>MLflow experiment tracking & Streamlit frontend</span>
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
                <h3 className="text-lg font-bold text-white">Project 2: RL & CV Autonomous Driving</h3>
                <span className="text-xs text-slate-400 font-mono">/rl_cv_car-autopilot/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Autonomous driving policy trained with Reinforcement Learning on the KITTI Vision Benchmark dataset, combining camera streams, LiDAR point clouds, and OXTS IMU sensor fusion.
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-emerald-400 uppercase">Core Architecture & Tech Stack:</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>OpenCV Camera Calibration & Lens Undistortion (K_00, D_00)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Velodyne LiDAR 3D Point Cloud Projection (Tr_velo_to_cam)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Custom OpenAI Gym Environment (<span className="text-emerald-300">KITTICarEnv</span>)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Stable-Baselines3 (SAC & DDPG MultiInputPolicy)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tracklet 3D Bounding Boxes (tx, ty, tz) & Anomaly Detection</span>
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
                <h3 className="text-lg font-bold text-white">Project 3: Raspberry Pi ECG / Edge AI</h3>
                <span className="text-xs text-slate-400 font-mono">/raspberry-pi-ecg/</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Edge device (Raspberry Pi 5 + AD8232 + Arduino Nano) that reconstructs a 6-lead ECG
              from 2 physical channels and classifies 19 rhythm/conduction patterns locally, on-device.
            </p>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-mono font-semibold text-rose-400 uppercase">Core Architecture & Tech Stack:</h4>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>AD8232 + Arduino Nano x2 &rarr; serial &rarr; Raspberry Pi 5</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Butterworth bandpass (0.5-40Hz) + Einthoven/Goldberger reconstruction</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>ECGNet (Conv1d x4) TorchScript, trained on PTB-XL</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>FastAPI + WebSocket, CPU-only edge inference</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Research prototype -- not a certified medical device</span>
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
          <span>Complete Technology Stack Matrix</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Component</th>
                <th className="py-3 px-4">Original Library / Framework</th>
                <th className="py-3 px-4">In This Web App</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">Topic Modeling</td>
                <td className="py-2.5 px-4 text-indigo-400">bertopic (v0.17+)</td>
                <td className="py-2.5 px-4 text-emerald-400">Real: runs via FastAPI on the sample or uploaded corpus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">Embeddings</td>
                <td className="py-2.5 px-4 text-indigo-400">sentence-transformers MiniLM-L12</td>
                <td className="py-2.5 px-4 text-emerald-400">Real: model loaded once in the backend</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">Hyperparameter Optimization</td>
                <td className="py-2.5 px-4 text-indigo-400">optuna (v3.0+) TPE Sampler</td>
                <td className="py-2.5 px-4 text-slate-400">Offline only (main.py) -- too slow for a live request</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">Reinforcement Learning</td>
                <td className="py-2.5 px-4 text-emerald-400">stable-baselines3 (SAC / DDPG)</td>
                <td className="py-2.5 px-4 text-slate-400">Canvas sim by default; "Live Backend Demo" queries the real pretrained policy (falls back to a heuristic if it can't load)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">Computer Vision & Sensors</td>
                <td className="py-2.5 px-4 text-emerald-400">OpenCV (cv2) + KITTI Velodyne LiDAR</td>
                <td className="py-2.5 px-4 text-slate-400">Canvas sim by default; "Live Backend Demo" runs the real undistort/projection code on a sample frame</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">ECG Signal Processing</td>
                <td className="py-2.5 px-4 text-rose-400">SciPy Butterworth filter + Einthoven/Goldberger</td>
                <td className="py-2.5 px-4 text-emerald-400">Real: runs on a bundled sample, synthetic signal, or your .npy upload</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">ECG Classification</td>
                <td className="py-2.5 px-4 text-rose-400">PyTorch ECGNet (TorchScript), PTB-XL</td>
                <td className="py-2.5 px-4 text-emerald-400">Real: same trained weights, corrected preprocessing (see project README)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-white font-semibold">Frontend Interface</td>
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
