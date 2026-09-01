import React, { useState } from 'react';
import { ActiveTab } from './types';
import { Header } from './components/Header';
import { AutoTopicWorkspace } from './components/AutoTopicWorkspace';
import { AutopilotWorkspace } from './components/AutopilotWorkspace';
import { ECGWorkspace } from './components/ECGWorkspace';
import { OverviewWorkspace } from './components/OverviewWorkspace';
import { CassandraGrpcWorkspace } from './components/CassandraGrpcWorkspace';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('autotopic');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'autotopic' && <AutoTopicWorkspace />}
        {activeTab === 'autopilot' && <AutopilotWorkspace />}
        {activeTab === 'ecg' && <ECGWorkspace />}
        {activeTab === 'cassandragrpc' && <CassandraGrpcWorkspace />}
        {activeTab === 'overview' && <OverviewWorkspace />}
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/50 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
          <div>
            <span>Machine Learning Portfolio &bull; neuraCollab/ml-portfolio</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>BERTopic &bull; Optuna &bull; SAC/DDPG &bull; KITTI &bull; ECGNet</span>
            <span>AI Studio Container Port 3000</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
