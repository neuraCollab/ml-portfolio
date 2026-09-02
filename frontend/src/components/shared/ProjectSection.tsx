import React, { useState } from 'react';
import { LucideIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface ProjectSectionProps {
  /** Anchor id, used by ProjectSectionNav for scroll-to-section and by IntersectionObserver for active-section highlighting. */
  id: string;
  title: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  /** Sections start expanded by default, matching the pre-existing pages where everything was already visible on load. */
  defaultOpen?: boolean;
  /** When true, renders a compact "Not available" state instead of children -- never fabricate content for a section that doesn't have real data yet. */
  unavailable?: boolean;
  /** One-line explanation of what's missing, shown under the "Not available" label. */
  unavailableReason?: string;
  /** Icon/active-nav accent color class, e.g. 'text-emerald-400'. Defaults to this app's general accent. */
  accentClassName?: string;
}

export const ProjectSection: React.FC<ProjectSectionProps> = ({
  id,
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  unavailable,
  unavailableReason,
  accentClassName = 'text-indigo-400',
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-24 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-lg font-bold text-white tracking-tight">
          <Icon className={`w-5 h-5 ${accentClassName}`} />
          {title}
        </span>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>
      {open && (
        <div className="px-6 pb-6">
          {unavailable ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-400">{t('common.shared.notAvailable')}</p>
              {unavailableReason && (
                <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">{unavailableReason}</p>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
};
