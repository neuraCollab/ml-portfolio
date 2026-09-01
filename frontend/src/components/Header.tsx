import React from 'react';
import { ActiveTab } from '../types';
import { Sparkles, Car, Layers, Github, BookOpen, Activity, HeartPulse } from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 sm:py-0 sm:h-16">

          {/* Brand & Repository title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-emerald-500 p-0.5 shadow-lg shadow-indigo-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-slate-100 text-base sm:text-lg tracking-tight truncate">ML Portfolio Workspace</h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  v2.4 Production
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate">neuraCollab / ml-portfolio</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800 overflow-x-auto max-w-full sm:max-w-none">
            <button
              onClick={() => setActiveTab('autotopic')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
                activeTab === 'autotopic'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-300" />
              <span className="hidden sm:inline">AutoTopic (NLP)</span>
              <span className="sm:hidden">AutoTopic</span>
            </button>

            <button
              onClick={() => setActiveTab('autopilot')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
                activeTab === 'autopilot'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Car className="w-4 h-4 text-emerald-300" />
              <span className="hidden sm:inline">RL Car Autopilot (CV)</span>
              <span className="sm:hidden">Autopilot</span>
            </button>

            <button
              onClick={() => setActiveTab('ecg')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
                activeTab === 'ecg'
                  ? 'bg-gradient-to-r from-rose-600 to-pink-700 text-white shadow-md shadow-rose-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <HeartPulse className="w-4 h-4 text-rose-300" />
              <span className="hidden sm:inline">ECG Edge AI</span>
              <span className="sm:hidden">ECG</span>
            </button>

            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
                activeTab === 'overview'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Overview & Docs</span>
            </button>
          </nav>

          {/* Repository Links & Status */}
          <div className="hidden lg:flex items-center space-x-3">
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>Container Ready</span>
            </div>

            <a
              href="https://github.com/neuraCollab/ml-portfolio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition"
            >
              <Github className="w-4 h-4" />
              <span>Source Repo</span>
            </a>
          </div>

        </div>
      </div>
    </header>
  );
};
