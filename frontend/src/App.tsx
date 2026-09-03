import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { AutoTopicWorkspace } from './components/AutoTopicWorkspace';
import { AutopilotWorkspace } from './components/AutopilotWorkspace';
import { ECGWorkspace } from './components/ECGWorkspace';
import { OverviewWorkspace } from './components/OverviewWorkspace';
import { CassandraGrpcWorkspace } from './components/CassandraGrpcWorkspace';
import { PageTitle } from './components/shared/PageTitle';
import { useTranslation } from './i18n/I18nContext';
import { LanguageSelectionPopup } from './i18n/LanguageSelectionPopup';

export function App() {
  const { t, needsLanguageSelection } = useTranslation();

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        {needsLanguageSelection && <LanguageSelectionPopup />}
        <Header />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <Routes>
            <Route path="/" element={<Navigate to="/autotopic" replace />} />
            <Route
              path="/autotopic"
              element={
                <>
                  <PageTitle title={t('common.header.nav.autotopicFull')} />
                  <AutoTopicWorkspace />
                </>
              }
            />
            <Route
              path="/autopilot"
              element={
                <>
                  <PageTitle title={t('common.header.nav.autopilotFull')} />
                  <AutopilotWorkspace />
                </>
              }
            />
            <Route
              path="/ecg"
              element={
                <>
                  <PageTitle title={t('common.header.nav.ecgFull')} />
                  <ECGWorkspace />
                </>
              }
            />
            <Route
              path="/cassandragrpc"
              element={
                <>
                  <PageTitle title={t('common.header.nav.cassandraGrpcFull')} />
                  <CassandraGrpcWorkspace />
                </>
              }
            />
            <Route
              path="/overview"
              element={
                <>
                  <PageTitle title={t('common.header.nav.overview')} />
                  <OverviewWorkspace />
                </>
              }
            />
            <Route path="*" element={<Navigate to="/autotopic" replace />} />
          </Routes>
        </main>

        <footer className="border-t border-slate-800 bg-slate-900/50 py-6 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
            <div>
              <span>{t('common.footer.portfolioLine')} &bull; neuraCollab/ml-portfolio</span>
            </div>
            <div className="flex items-center space-x-4">
              <span>BERTopic &bull; Optuna &bull; SAC &bull; KITTI &bull; ECGNet</span>
              <span>{t('common.footer.containerLine')}</span>
            </div>
          </div>
        </footer>
      </div>
    </HashRouter>
  );
}

export default App;
