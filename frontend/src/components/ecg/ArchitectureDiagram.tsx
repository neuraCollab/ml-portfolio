import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';

/** Vertical pipeline diagram: AD8232 x2 -> Arduino Nano x2 -> USB serial ->
 * Raspberry Pi 5 (bandpass + Einthoven/Goldberger reconstruction -> ECGNet
 * TorchScript inference, all local) -> FastAPI/WebSocket -> browser (Chart.js).
 * Every stage here matches raspberry-pi-ecg/README.md and ecg_pipeline.py --
 * no invented components. The Pi 5 bounding box exists specifically to make
 * "no remote server, no cloud dependency" visually obvious. */
export const ArchitectureDiagram: React.FC = () => {
  const { t } = useTranslation();
  return (
    <svg viewBox="0 0 620 900" className="w-full max-w-lg mx-auto" role="img" aria-label={t('ecg.architecture.diagramAlt')}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
        </marker>
      </defs>

      {/* Row 1: two AD8232 sensors */}
      <g>
        <rect x="30" y="10" width="255" height="56" rx="12" className="fill-slate-900 stroke-rose-500/40" strokeWidth="1.5" />
        <text x="157.5" y="33" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.ad8232_1')}</text>
        <text x="157.5" y="50" textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.nodes.ad8232Detail')}</text>

        <rect x="335" y="10" width="255" height="56" rx="12" className="fill-slate-900 stroke-rose-500/40" strokeWidth="1.5" />
        <text x="462.5" y="33" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.ad8232_2')}</text>
        <text x="462.5" y="50" textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.nodes.ad8232Detail')}</text>
      </g>

      <line x1="157.5" y1="66" x2="157.5" y2="100" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <line x1="462.5" y1="66" x2="462.5" y2="100" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Row 2: two Arduino Nanos */}
      <g>
        <rect x="30" y="104" width="255" height="46" rx="12" className="fill-slate-900 stroke-slate-700" strokeWidth="1.5" />
        <text x="157.5" y="132" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.arduino_1')}</text>

        <rect x="335" y="104" width="255" height="46" rx="12" className="fill-slate-900 stroke-slate-700" strokeWidth="1.5" />
        <text x="462.5" y="132" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.arduino_2')}</text>
      </g>

      <line x1="157.5" y1="150" x2="157.5" y2="185" stroke="#64748b" strokeWidth="1.5" />
      <line x1="462.5" y1="150" x2="462.5" y2="185" stroke="#64748b" strokeWidth="1.5" />
      <line x1="157.5" y1="185" x2="462.5" y2="185" stroke="#64748b" strokeWidth="1.5" />
      <line x1="310" y1="185" x2="310" y2="210" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* USB serial */}
      <rect x="185" y="214" width="250" height="42" rx="10" className="fill-slate-900 stroke-slate-700" strokeWidth="1.5" />
      <text x="310" y="240" textAnchor="middle" className="fill-slate-200 text-[12px] font-bold font-mono">{t('ecg.architecture.nodes.usbSerial')}</text>

      <line x1="310" y1="256" x2="310" y2="288" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Raspberry Pi 5 bounding box -- everything inside runs locally */}
      <rect x="20" y="292" width="580" height="330" rx="16" className="fill-rose-500/5 stroke-rose-500/40" strokeWidth="1.5" strokeDasharray="6 4" />
      <text x="40" y="318" className="fill-rose-400 text-[11px] font-bold font-mono uppercase tracking-wider">{t('ecg.architecture.piLabel')}</text>
      <text x="40" y="334" className="fill-slate-500 text-[10px]">{t('ecg.architecture.noCloudNote')}</text>

      <rect x="60" y="350" width="500" height="60" rx="12" className="fill-slate-900 stroke-slate-700" strokeWidth="1.5" />
      <text x="310" y="374" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.filter')}</text>
      <text x="310" y="392" textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.nodes.filterDetail')}</text>

      <line x1="310" y1="410" x2="310" y2="440" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />

      <rect x="60" y="444" width="500" height="60" rx="12" className="fill-slate-900 stroke-rose-500/40" strokeWidth="1.5" />
      <text x="310" y="468" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.model')}</text>
      <text x="310" y="486" textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.nodes.modelDetail')}</text>

      <line x1="310" y1="504" x2="310" y2="534" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />

      <rect x="60" y="538" width="500" height="60" rx="12" className="fill-slate-900 stroke-slate-700" strokeWidth="1.5" />
      <text x="310" y="562" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.server')}</text>
      <text x="310" y="580" textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.nodes.serverDetail')}</text>

      <line x1="310" y1="622" x2="310" y2="660" stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <text x="330" y="645" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.laoLabel')}</text>

      {/* Browser client -- outside the Pi box: a separate device on the LAN */}
      <rect x="110" y="664" width="400" height="60" rx="12" className="fill-slate-900 stroke-slate-700" strokeWidth="1.5" />
      <text x="310" y="688" textAnchor="middle" className="fill-slate-200 text-[13px] font-bold">{t('ecg.architecture.nodes.browser')}</text>
      <text x="310" y="706" textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">{t('ecg.architecture.nodes.browserDetail')}</text>

      <text x="310" y="750" textAnchor="middle" className="fill-slate-600 text-[10px] italic">{t('ecg.architecture.thisPortfolioNote')}</text>
      <text x="310" y="770" textAnchor="middle" className="fill-slate-600 text-[10px] italic">{t('ecg.architecture.thisPortfolioNote2')}</text>
    </svg>
  );
};
